import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

/** O que mudou numa escrita: só os campos que mudaram, com o valor antes e depois. */
export interface AlteracoesRegistadas {
  antes: Record<string, unknown>
  depois: Record<string, unknown>
}

export default class ActivityLog extends BaseModel {
  static table = 'activity_logs'

  /**
   * Sequencial, não UUID — ao contrário do resto do projecto. A razão está na
   * migração: é o `id` que dá a ordem cronológica que `created_at`, com precisão de
   * segundo, não consegue dar. Por isso não há `@beforeCreate` a gerar id nenhum: o
   * motor atribui-o.
   */
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare user_id: string | null

  /**
   * O email do actor, copiado no momento da acção.
   *
   * Redundante com `user_id` de propósito. `user_id` não tem chave estrangeira (ver a
   * migração), portanto um funcionário apagado deixa linhas a apontar para um id que
   * já não resolve — e um relatório de auditoria que diz "utilizador
   * 8f3a…" em vez de um nome não serve para responder a ninguém. Guardar o email na
   * altura é o que mantém a linha legível daqui a um ano.
   */
  @column()
  declare user_email: string | null

  /** O nome de quem fez a acção, copiado no momento — ver `user_email`. */
  @column()
  declare user_nome: string | null

  @column()
  declare empresa_id: string | null

  @column()
  declare action: string

  @column()
  declare subject_type: string | null

  @column()
  declare subject_id: string | null

  @column({
    prepare: (value: AlteracoesRegistadas | null) => (value ? JSON.stringify(value) : null),
    consume: (value: string | null) => (value ? JSON.parse(value) : null),
  })
  declare changes: AlteracoesRegistadas | null

  @column()
  declare description: string | null

  @column()
  declare ip_address: string | null

  @column()
  declare method: string | null

  @column()
  declare route: string | null

  @column()
  declare status_code: number | null

  /** Quanto tempo o pedido demorou, em milissegundos. */
  @column()
  declare duration_ms: number | null

  /** Cabeçalhos do pedido, já redigidos (sem `authorization` nem `cookie`). */
  @column({
    prepare: (v: unknown) => (v === null || v === undefined ? null : JSON.stringify(v)),
    consume: (v: string | null) => {
      if (!v) return null
      try {
        return JSON.parse(v)
      } catch {
        // Texto que não é JSON (escrito à mão, ou truncado a meio por alguém): devolve-se
        // como texto em vez de rebentar o ecrã de auditoria.
        return v
      }
    },
  })
  declare request_headers: unknown

  /** Os parâmetros de query string (`?pagina=2&q=arroz`). */
  @column({
    prepare: (v: unknown) => (v === null || v === undefined ? null : JSON.stringify(v)),
    consume: (v: string | null) => {
      if (!v) return null
      try {
        return JSON.parse(v)
      } catch {
        // Texto que não é JSON (escrito à mão, ou truncado a meio por alguém): devolve-se
        // como texto em vez de rebentar o ecrã de auditoria.
        return v
      }
    },
  })
  declare request_query: unknown

  /** O corpo enviado, redigido e truncado. */
  @column({
    prepare: (v: unknown) => (v === null || v === undefined ? null : JSON.stringify(v)),
    consume: (v: string | null) => {
      if (!v) return null
      try {
        return JSON.parse(v)
      } catch {
        // Texto que não é JSON (escrito à mão, ou truncado a meio por alguém): devolve-se
        // como texto em vez de rebentar o ecrã de auditoria.
        return v
      }
    },
  })
  declare request_body: unknown

  /** O corpo devolvido, redigido e truncado. */
  @column({
    prepare: (v: unknown) => (v === null || v === undefined ? null : JSON.stringify(v)),
    consume: (v: string | null) => {
      if (!v) return null
      try {
        return JSON.parse(v)
      } catch {
        // Texto que não é JSON (escrito à mão, ou truncado a meio por alguém): devolve-se
        // como texto em vez de rebentar o ecrã de auditoria.
        return v
      }
    },
  })
  declare response_body: unknown


  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime
}
