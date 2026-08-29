import { BaseSchema } from '@adonisjs/lucid/schema'

import { temTabela } from '../helpers/esquema.js'

/**
 * Tira de `plano.funcionalidades` as linhas que o cartão passou a derivar sozinho.
 *
 * ── Porque é que uma base já existente precisa disto ──────────────────────────
 *
 * `plano.limites_descritos` passou a gerar as quatro linhas de limite a partir dos
 * próprios números. Nos planos padrão essas linhas já saíram de `PLANOS_PADRAO` — mas
 * isso só vale para uma instalação de RAIZ: `semearPlanosPadrao()` é idempotente por
 * `slug` e **nunca sobrepõe** o que já existe (de propósito: um preço afinado no
 * backoffice não pode ser revertido por um deploy).
 *
 * Numa base que já tenha os planos — dev, qualidade, produção — o texto antigo fica
 * lá. E o cartão passaria a mostrar cada limite DUAS vezes: uma derivada e uma
 * escrita. Pior do que antes, e por causa de uma melhoria.
 *
 * ── Só o que é provadamente duplicado ─────────────────────────────────────────
 *
 * Compara cada entrada com o texto que ESTE plano geraria agora, e com a linha dos
 * dias livres. Comparação exacta (só ignora espaços à volta e maiúsculas), nunca por
 * palavras: "Relatórios completos" fala de relatórios e não é um limite, e um filtro
 * por palavras apagaria texto de montra que alguém escreveu à mão.
 *
 * A consequência assumida: um plano cujo limite já foi mudado no backoffice tem texto
 * antigo que já não bate certo com nada, e esse NÃO é removido. É a escolha certa —
 * essa linha pode ter sido reescrita de propósito, e apagar texto que não se consegue
 * provar ser duplicado é pior do que deixar um duplicado à vista.
 *
 * Idempotente: correr duas vezes não muda nada na segunda.
 */
export default class extends BaseSchema {
  protected tableName = 'plano'

  async up() {
    this.defer(async (db) => {
      if (!(await temTabela(db, this.tableName))) return

      const planos = await db
        .from('plano')
        .select(
          'id',
          'moeda',
          'funcionalidades',
          'dias_gratuitos',
          'limite_utilizadores',
          'limite_postos',
          'limite_produtos',
          'limite_faturacao_mensal'
        )

      // A MESMA lógica de `app/models/plano.ts`. Repetida aqui de propósito: uma
      // migração tem de descrever o mundo como ele era no dia em que correu, e não
      // seguir um getter que amanhã pode mudar — senão uma alteração inocente ao model
      // muda o que esta migração faz numa base que ainda não a correu.
      const semLimite = (v: unknown) => v === null || v === undefined || Number(v) <= 0
      const numero = (v: unknown) =>
        String(Math.trunc(Number(v))).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
      const simbolo = (m: unknown) => (String(m ?? '').toUpperCase() === 'AOA' ? 'Kz' : String(m ?? ''))
      const contagem = (v: unknown, s: string, pl: string, sem: string) =>
        semLimite(v) ? sem : Number(v) === 1 ? `1 ${s}` : `Até ${numero(v)} ${pl}`

      let alterados = 0

      for (const p of planos as Record<string, unknown>[]) {
        let lista: string[]
        try {
          const lido = JSON.parse(String(p.funcionalidades ?? '[]'))
          lista = Array.isArray(lido) ? lido.map(String) : []
        } catch {
          // Texto mal formado escrito à mão: não é esta migração que o vai adivinhar.
          continue
        }
        if (lista.length === 0) continue

        const derivadas = [
          contagem(p.limite_utilizadores, 'utilizador', 'utilizadores', 'Utilizadores sem limite'),
          contagem(
            p.limite_postos,
            'posto de atendimento',
            'postos de atendimento',
            'Postos de atendimento sem limite'
          ),
          contagem(p.limite_produtos, 'produto', 'produtos', 'Produtos sem limite'),
          semLimite(p.limite_faturacao_mensal)
            ? 'Facturação sem tecto'
            : `Facturação até ${numero(p.limite_faturacao_mensal)} ${simbolo(p.moeda)} por mês`,
        ]

        // O cartão mostra os dias livres à parte, no cabeçalho — a linha na lista era a
        // segunda vez que a mesma coisa aparecia no mesmo cartão.
        const dias = Number(p.dias_gratuitos ?? 0)
        if (dias > 0) derivadas.push(`${dias} dias livres para experimentar`)

        // Também na versão com "AOA", para apanhar texto escrito antes de o produto
        // assentar no símbolo.
        if (!semLimite(p.limite_faturacao_mensal)) {
          derivadas.push(`Facturação até ${numero(p.limite_faturacao_mensal)} ${p.moeda} por mês`)
        }

        const aRemover = new Set(derivadas.map((d) => d.trim().toLowerCase()))
        const limpa = lista.filter((f) => !aRemover.has(f.trim().toLowerCase()))

        if (limpa.length === lista.length) continue

        await db
          .from('plano')
          .where('id', p.id as string)
          .update({ funcionalidades: JSON.stringify(limpa) })
        alterados++
      }

      if (alterados > 0) {
        console.log(
          `[migração] ${alterados} plano(s) com linhas de limite removidas de "funcionalidades" — ` +
            'passam a ser geradas a partir dos próprios limites.'
        )
      }
    })
  }

  /**
   * Sem `down`.
   *
   * Reverter seria voltar a escrever texto que a versão anterior gerava — e o texto
   * removido pode ter sido diferente do que se reescreveria (um limite mudado entretanto).
   * Repor código antigo com estas linhas já removidas dá um cartão sem as linhas de
   * limite, o que é feio mas verdadeiro; repor texto adivinhado dava um cartão que mente.
   *
   * Se for mesmo preciso, `node ace planos:semear` não serve (não sobrepõe) — é edição
   * no backoffice, que é onde estas linhas vivem.
   */
  async down() {}
}
