import { DateTime } from 'luxon'
import { BaseModel, column, beforeCreate } from '@adonisjs/lucid/orm'
import { randomUUID } from 'node:crypto'

/**
 * Cache das consultas ao portal do contribuinte (Minfin), servidas através do
 * serviço externo `bknkv-utils-api-resources`.
 *
 * Porquê cache: esse serviço não é uma API — é um scraper Playwright. Uma consulta
 * "morna" leva 4-5s e uma "fria" (browser ainda por lançar) ~14s. Sem cache, cada
 * venda/registo pagaria esse custo outra vez pelo mesmo NIF.
 *
 * Deliberadamente NÃO é isolada por empresa: um NIF é um identificador nacional, a
 * resposta é a mesma para qualquer tenant. O isolamento é feito no acesso (a rota
 * exige autenticação e `company_alias`), não nos dados.
 */
export default class NifConsulta extends BaseModel {
  static table = 'nif_consulta'

  @column({ isPrimary: true })
  declare id: string

  @beforeCreate()
  static uuid(model: NifConsulta) {
    model.id ??= randomUUID()
  }

  @column()
  declare nif: string

  /** `false` = o portal respondeu mas não encontrou o contribuinte (resultado válido,
   * também vale a pena cachear para não repetir a consulta lenta). */
  @column()
  declare found: boolean

  @column()
  declare nome: string | null

  /** Ex.: "COLECTIVO - Empresa". É a partir daqui que se decide se o cliente é
   * Pessoa Jurídica ou Pessoa Física, em vez de o perguntar ao utilizador. */
  @column()
  declare tipo: string | null

  @column()
  declare estado: string | null

  @column()
  declare inadimplente: string | null

  @column()
  declare regime_iva: string | null

  /** Resposta completa do portal, serializada. O portal pode acrescentar campos sem
   * que isto exija migration. */
  @column()
  declare raw: string | null

  @column.dateTime()
  declare consultado_em: DateTime

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
