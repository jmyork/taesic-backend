import type { FieldContext } from '@vinejs/vine/types'
import type { Database } from '@adonisjs/lucid/database'

/**
 * `exists()` COM fronteira de empresa.
 *
 * O PROBLEMA QUE ISTO FECHA. O isolamento multi-tenant desta API estava só
 * metade feito, e a metade em falta não se via a ler um controlador.
 *
 * A metade que existia: `BaseRepository.findOrFail(id, companyAlias)` aplica
 * `scopeToTenant`, portanto o RECURSO que se actualiza é sempre da empresa de
 * quem faz o pedido. Ninguém edita a caixa de outra empresa.
 *
 * A metade que faltava: as CHAVES ESTRANGEIRAS escritas para dentro desse
 * recurso não eram verificadas contra nada. Vários validadores confirmavam
 * apenas que a linha apontada existia — em qualquer sítio da base de dados:
 *
 *     .exists(async (db, value, __) => {
 *       const exists = await db.from('user').where('id', value).first()
 *       return !!exists
 *     })
 *
 * O `__` no terceiro parâmetro é o sintoma: é o `FieldContext`, o único sítio de
 * onde vem o `company_alias` da rota, e estava explicitamente ignorado.
 *
 * O que isso permitia, com uma sessão legítima de uma empresa qualquer:
 *
 *   - `POST api/:alias/caixas` com o `user_id` de um funcionário de OUTRA
 *     empresa — abre-se uma caixa registada em nome de alguém que não é nosso.
 *   - `POST api/:alias/cliente` com `cliente_pai_id` a apontar para o cliente de
 *     OUTRA empresa. E este é o pior, porque não fica por ali: a relação
 *     `belongsTo cliente_pai` (app/models/cliente.ts) e o filtro por
 *     `cliente.cliente_pai_id` (app/repositories/cliente_repository.ts) leem-na
 *     de volta. A escrita cross-tenant transforma-se em LEITURA cross-tenant —
 *     a ficha do cliente de um concorrente, servida pela nossa própria API.
 *   - `PUT api/:alias/produto-medias/:id` com o `produto_id` de OUTRA empresa —
 *     a nossa imagem passa a estar pendurada no produto deles.
 *
 * Nenhum destes é um furo de autenticação: o atacante entra pela porta, com uma
 * conta verdadeira da empresa dele. É exactamente o que a OWASP chama BOLA —
 * a autorização ao nível do objecto, que a autenticação não substitui.
 *
 * PORQUE É QUE O HELPER É ESTE, E NÃO UMA VERIFICAÇÃO NO REPOSITÓRIO. Porque o
 * padrão correcto já existia neste projecto — `existeNoDominio` e
 * `papelDestaEmpresa` em auth_validator.ts fazem exactamente isto desde sempre.
 * Os validadores acima eram os que ficaram para trás. Extrair o padrão para aqui
 * é o que impede que o próximo validador escrito volte a ficar.
 *
 * FALHA FECHADA. Sem `company_alias` no contexto, devolve `false` — nunca
 * `true`, e nunca "sem filtro". As quatro rotas que usam isto vivem todas sob
 * `.prefix('api/:company_alias')` com `ValidateCompanyAliasMiddleware`
 * (start/companydomainroutes.ts), portanto o alias está sempre lá; se um dia
 * deixar de estar, o sintoma é uma validação que recusa, não um vazamento
 * silencioso. É a direcção certa para errar.
 */

/** Um salto de `join`: tabela de destino, coluna desta ponta, coluna da outra. */
type Ligacao = [tabela: string, coluna: string, colunaEstrangeira: string]

type Ambito = {
  /** Tabela onde a linha apontada pela chave estrangeira vive. */
  tabela: string
  /** Coluna do id nessa tabela. Quase sempre `id`. */
  coluna?: string
  /**
   * Caminho de `join`s até `empresa`. Vazio quando a tabela já tem `empresa_id`
   * e o `join` a `empresa` é directo.
   */
  ligacoes?: Ligacao[]
  /**
   * Coluna que liga a última tabela do caminho a `empresa.id`.
   * Por omissão `<tabela>.empresa_id`.
   */
  chaveDaEmpresa?: string
  /**
   * Colunas de soft-delete que têm de estar nulas. Uma linha apagada não deve
   * poder ser referenciada de novo — é o mesmo raciocínio do
   * `whereNull('deleted_at')` que já existia em cupom_validator.ts.
   */
  soft?: string[]
}

export function pertenceAEmpresa(ambito: Ambito) {
  const tabela = ambito.tabela
  const coluna = ambito.coluna ?? 'id'
  const chaveDaEmpresa = ambito.chaveDaEmpresa ?? `${tabela}.empresa_id`
  const soft = ambito.soft ?? [`${tabela}.deleted_at`]

  return async (db: Database, value: string, field: FieldContext): Promise<boolean> => {
    const companyAlias = (field.data as any)?.params?.company_alias

    // Falha fechada: ver a nota no cabeçalho.
    if (typeof companyAlias !== 'string' || companyAlias.length === 0) {
      return false
    }

    let consulta = db.from(tabela).where(`${tabela}.${coluna}`, value)

    for (const [alvo, daqui, dali] of ambito.ligacoes ?? []) {
      consulta = consulta.join(alvo, daqui, dali)
    }

    consulta = consulta
      .join('empresa', 'empresa.id', chaveDaEmpresa)
      .where('empresa.company_alias', companyAlias)

    for (const colunaSoft of soft) {
      consulta = consulta.whereNull(colunaSoft)
    }

    return !!(await consulta.select(`${tabela}.${coluna}`).first())
  }
}
