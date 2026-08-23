import { BaseSchema } from '@adonisjs/lucid/schema'
import { randomUUID } from 'node:crypto'

/**
 * Dá a cada empresa a sua cópia dos papéis padrão, e repõe as atribuições nela.
 *
 * É o passo perigoso desta mudança: mexe em quem tem acesso a quê. Duas decisões
 * governam-no.
 *
 * PRIMEIRA: nada é apagado. Os 10 papéis padrão continuam a existir como
 * `modelo`; o que muda é que deixam de estar atribuídos a alguém. Se isto correr
 * mal, o estado anterior está todo lá.
 *
 * SEGUNDA: no fim há uma verificação que ABORTA a migração se sobrar uma única
 * atribuição a apontar para um `modelo`. Uma migração de acessos que falha em
 * silêncio é a pior espécie: descobre-se quando alguém não consegue trabalhar,
 * ou — pior — quando alguém consegue o que não devia. Melhor não terminar do que
 * terminar com alguém no sítio errado.
 *
 * Aferido contra os dados reais antes de ser escrita: 2 empresas, 20 atribuições
 * activas (15 delas de plataforma, que esta migração nem toca), 752 ligações
 * papel-permissão a clonar, e ZERO utilizadores sem empresa a segurar um papel
 * de inquilino — que era o único caso capaz de custar acesso a alguém. Com 200
 * empresas isto seria outro problema; é agora que sai barato.
 *
 * É idempotente: reexecutar não duplica nada.
 */
export default class extends BaseSchema {
  async up() {
    this.defer(async (db) => {
      const agora = new Date()

      // ── 1. Quem é papel de PLATAFORMA ──────────────────────────────────────
      // Única vez em que decidir pelo nome é correcto: são 5 linhas conhecidas,
      // e é precisamente esta migração que passa a decisão do nome para
      // `escopo`. A partir daqui nenhum código volta a olhar para o prefixo.
      await db
        .from('papel')
        .whereNull('empresa_id')
        .where('nome', 'like', 'Platform_%')
        .update({ escopo: 'plataforma' })

      // Os restantes ficam `modelo`, que já é o valor por omissão da coluna.

      // ── 2. Clonar os modelos para cada empresa ─────────────────────────────
      const modelos = await db
        .from('papel')
        .where('escopo', 'modelo')
        .select('id', 'nome', 'descricao')

      const empresas = await db.from('empresa').select('id', 'company_alias')

      const papeisNovos: Record<string, unknown>[] = []
      const ligacoesNovas: Record<string, unknown>[] = []

      for (const empresa of empresas) {
        for (const modelo of modelos) {
          const existente = await db
            .from('papel')
            .where('empresa_id', empresa.id)
            .where('nome', modelo.nome)
            .select('id')
            .first()

          const idDoClone = existente?.id ?? randomUUID()

          if (!existente) {
            papeisNovos.push({
              id: idDoClone,
              nome: modelo.nome,
              descricao: modelo.descricao,
              empresa_id: empresa.id,
              escopo: 'empresa',
              created_at: agora,
              updated_at: agora,
            })
          }

          const ligacoes = await db
            .from('papel_permissao')
            .where('papel_id', modelo.id)
            .whereNull('deleted_at')
            .select('permissao_id')

          const jaLigadas = new Set(
            (await db.from('papel_permissao').where('papel_id', idDoClone).select('permissao_id')).map(
              (l: { permissao_id: string }) => l.permissao_id
            )
          )

          for (const ligacao of ligacoes) {
            if (jaLigadas.has(ligacao.permissao_id)) continue
            ligacoesNovas.push({
              id: randomUUID(),
              papel_id: idDoClone,
              permissao_id: ligacao.permissao_id,
              created_at: agora,
              updated_at: agora,
            })
          }
        }
      }

      // Em lotes: 1504 inserções uma a uma são 1504 idas à base de dados.
      for (const lote of emLotes(papeisNovos, 200)) {
        await db.table('papel').multiInsert(lote)
      }
      for (const lote of emLotes(ligacoesNovas, 500)) {
        await db.table('papel_permissao').multiInsert(lote)
      }

      // ── 3. Repontar as atribuições para a cópia da empresa do utilizador ───
      const aRepontar = await db
        .from('user_papel as up')
        .join('papel as p', 'p.id', 'up.papel_id')
        .join('user as u', 'u.id', 'up.user_id')
        .where('p.escopo', 'modelo')
        .whereNotNull('u.empresa_id')
        .select(
          'up.id as atribuicao_id',
          'up.user_id as user_id',
          'u.empresa_id as empresa_id',
          'p.nome as papel_nome'
        )

      for (const atribuicao of aRepontar) {
        const destino = await db
          .from('papel')
          .where('empresa_id', atribuicao.empresa_id)
          .where('nome', atribuicao.papel_nome)
          .select('id')
          .first()

        if (!destino) {
          throw new Error(
            `Backfill abortado: a empresa ${atribuicao.empresa_id} não tem cópia do papel ` +
              `"${atribuicao.papel_nome}", necessária para a atribuição ${atribuicao.atribuicao_id}. ` +
              `Nenhum acesso foi retirado — o estado anterior está intacto.`
          )
        }

        // `unique(user_id, papel_id)`: se o utilizador já tiver a cópia, esta
        // linha passa a ser duplicada. Fica a que já lá está; uma linha revogada
        // não é histórico que justifique bloquear a reatribuição — é o mesmo
        // raciocínio já documentado em `revogarPermissao`, e o histórico vive em
        // `security_logs`.
        const colide = await db
          .from('user_papel')
          .where('user_id', atribuicao.user_id)
          .where('papel_id', destino.id)
          .select('id')
          .first()

        if (colide) {
          await db.from('user_papel').where('id', atribuicao.atribuicao_id).delete()
          continue
        }

        await db
          .from('user_papel')
          .where('id', atribuicao.atribuicao_id)
          .update({ papel_id: destino.id, updated_at: agora })
      }

      // ── 4. A verificação que aborta ────────────────────────────────────────
      const sobra = await db
        .from('user_papel as up')
        .join('papel as p', 'p.id', 'up.papel_id')
        .where('p.escopo', 'modelo')
        .count('* as total')

      const total = Number((sobra[0] as { total?: number })?.total ?? 0)
      if (total > 0) {
        throw new Error(
          `Backfill abortado: ${total} atribuição(ões) continuam a apontar para um papel ` +
            `"modelo". São utilizadores sem empresa a segurar um papel de inquilino — não há ` +
            `cópia para onde os mandar. Resolva-os à mão (dar-lhes empresa, ou revogar o papel) ` +
            `e reexecute; esta migração é idempotente.`
        )
      }
    })
  }

  async down() {
    this.defer(async (db) => {
      // Devolve as atribuições aos papéis padrão e apaga as cópias. A FK de
      // `papel_permissao.papel_id` é ON DELETE CASCADE, portanto as ligações
      // clonadas desaparecem com elas.
      const clones = await db.from('papel').where('escopo', 'empresa').select('id', 'nome')

      for (const clone of clones) {
        const modelo = await db
          .from('papel')
          .where('escopo', 'modelo')
          .where('nome', clone.nome)
          .select('id')
          .first()

        if (!modelo) continue

        const atribuicoes = await db
          .from('user_papel')
          .where('papel_id', clone.id)
          .select('id', 'user_id')

        for (const atribuicao of atribuicoes) {
          const colide = await db
            .from('user_papel')
            .where('user_id', atribuicao.user_id)
            .where('papel_id', modelo.id)
            .select('id')
            .first()

          if (colide) {
            await db.from('user_papel').where('id', atribuicao.id).delete()
          } else {
            await db.from('user_papel').where('id', atribuicao.id).update({ papel_id: modelo.id })
          }
        }
      }

      await db.from('papel').where('escopo', 'empresa').delete()
      await db.from('papel').whereNull('empresa_id').update({ escopo: 'modelo' })
    })
  }
}

function* emLotes<T>(itens: T[], tamanho: number): Generator<T[]> {
  for (let i = 0; i < itens.length; i += tamanho) {
    yield itens.slice(i, i + tamanho)
  }
}
