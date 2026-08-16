import Papel from '#models/auth/papel'
import Permissao from '#models/auth/permissao'
import papel_permissao from '#models/auth/papel_permissao'

/**
 * Motor partilhado pelos comandos `permissao:conceder` e `permissao:revogar`.
 *
 * A lógica vive aqui (e não dentro de um `BaseCommand`) por duas razões: os dois comandos
 * precisam exactamente da mesma resolução de nomes, e assim isto é testável sem simular
 * uma execução de ace — ver `tests/functional/rbac_permissoes_helper.spec.ts`.
 */

/** Ler o recurso. */
export const SUFIXOS_LEITURA = ['index', 'show']
/** Criar/alterar/remover o recurso. */
export const SUFIXOS_ESCRITA = ['store', 'update', 'destroy']

export type ModoPermissao = 'leitura' | 'escrita' | 'tudo'

export interface PermissoesResolvidas {
  /** Permissões existentes no catálogo que correspondem ao pedido. */
  permissoes: InstanceType<typeof Permissao>[]
  /** Nomes canónicos que este recurso não tem (ex.: um recurso sem `update`). Informativo. */
  inexistentes: string[]
  /**
   * Acções PRÓPRIAS do recurso (`catalogo`, `meu`, `anular`, `validar`, ...) que existem no
   * catálogo mas ficam de fora de `--leitura`/`--escrita`: nada no nome diz com segurança
   * se lêem ou escrevem, e adivinhar isso numa fronteira de acesso é como se criam buracos.
   * Concedem-se pelo nome exacto ou com `--tudo`.
   */
  foraDoModo: string[]
}

function nomesCanonicos(prefixo: string, modo: ModoPermissao) {
  if (modo === 'leitura') return SUFIXOS_LEITURA.map((s) => `${prefixo}.${s}`)
  if (modo === 'escrita') return SUFIXOS_ESCRITA.map((s) => `${prefixo}.${s}`)
  return []
}

/**
 * Traduz o que foi pedido na linha de comandos para permissões reais do catálogo.
 *
 * - Sem `modo`: `alvos` são nomes exactos (`domain_vendapagamento.store`, ou nomes sem
 *   ponto nenhum como `domain_reembolso_total`, que também existem).
 * - Com `modo`: `alvos` são prefixos de recurso (`domain_vendapagamento`).
 */
export async function resolverPermissoes(
  alvos: string[],
  modo?: ModoPermissao
): Promise<PermissoesResolvidas> {
  if (!modo) {
    const encontradas = await Permissao.query().whereIn('nome', alvos)
    const nomesEncontrados = new Set(encontradas.map((p) => p.nome))
    return {
      permissoes: encontradas,
      inexistentes: alvos.filter((a) => !nomesEncontrados.has(a)),
      foraDoModo: [],
    }
  }

  const permissoes: InstanceType<typeof Permissao>[] = []
  const inexistentes: string[] = []
  const foraDoModo: string[] = []

  for (const prefixo of alvos) {
    // Tudo o que o recurso tem: `prefixo.accao` e também o próprio `prefixo` (há permissões
    // sem ponto, ex.: `domain_reembolso_total`).
    const doRecurso = await Permissao.query()
      .where((q) => q.where('nome', prefixo).orWhere('nome', 'like', `${prefixo}.%`))
      .orderBy('nome')

    if (modo === 'tudo') {
      permissoes.push(...doRecurso)
      if (doRecurso.length === 0) inexistentes.push(`${prefixo}.*`)
      continue
    }

    const canonicos = nomesCanonicos(prefixo, modo)
    const porNome = new Map(doRecurso.map((p) => [p.nome, p]))

    for (const nome of canonicos) {
      const encontrada = porNome.get(nome)
      if (encontrada) permissoes.push(encontrada)
      else inexistentes.push(nome)
    }

    for (const p of doRecurso) {
      const ehCanonicoDeAlgumModo = [...SUFIXOS_LEITURA, ...SUFIXOS_ESCRITA].some(
        (s) => p.nome === `${prefixo}.${s}`
      )
      if (!ehCanonicoDeAlgumModo) foraDoModo.push(p.nome)
    }
  }

  return { permissoes, inexistentes, foraDoModo }
}

export type ResultadoConceder = 'atribuída' | 'reposta' | 'já tinha'
export type ResultadoRevogar = 'removida' | 'não tinha'

/**
 * Atribui uma permissão a um papel, sem duplicar.
 *
 * `'reposta'` cobre o caso de a associação existir mas estar com soft delete: a tabela tem
 * `unique(papel_id, permissao_id)`, por isso não dava para criar outra por cima — e deixar
 * a linha apagada seria dizer "já tinha" a quem não tem.
 */
export async function concederPermissao(
  papel: InstanceType<typeof Papel>,
  permissao: InstanceType<typeof Permissao>
): Promise<ResultadoConceder> {
  const existente = await papel_permissao
    .query()
    .where('papel_id', papel.id)
    .where('permissao_id', permissao.id)
    .first()

  if (existente) {
    if (!existente.deletedAt) return 'já tinha'
    existente.deletedAt = null
    await existente.save()
    return 'reposta'
  }

  await papel_permissao.create({ papel_id: papel.id, permissao_id: permissao.id })
  return 'atribuída'
}

/**
 * Retira a permissão ao papel — apagando mesmo a linha, não com soft delete.
 *
 * Porquê apagar: `unique(papel_id, permissao_id)` faria uma linha apagada bloquear qualquer
 * reatribuição futura, e o histórico de quem teve o quê não é o que esta tabela guarda (para
 * isso há `security_logs`). Uma permissão nunca é apagada do catálogo — só a associação ao
 * papel; outros papéis não são tocados.
 */
export async function revogarPermissao(
  papel: InstanceType<typeof Papel>,
  permissao: InstanceType<typeof Permissao>
): Promise<ResultadoRevogar> {
  const apagadas = await papel_permissao
    .query()
    .where('papel_id', papel.id)
    .where('permissao_id', permissao.id)
    .delete()

  const total = Array.isArray(apagadas) ? Number(apagadas[0] ?? 0) : Number(apagadas ?? 0)
  return total > 0 ? 'removida' : 'não tinha'
}

/** Papéis cuja perda de permissões deixa alguém sem forma de voltar a atribuí-las. */
export const PAPEIS_CRITICOS = ['Admin', 'Platform_Admin']

export function ehPapelCritico(nome: string) {
  return PAPEIS_CRITICOS.includes(nome)
}
