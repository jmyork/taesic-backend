import { DateTime } from 'luxon'
import { BaseModel, column, beforeCreate, belongsTo } from '@adonisjs/lucid/orm'
import { randomUUID } from 'node:crypto'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import taxa_iva from './taxa_iva.js'

export default class Empresa extends BaseModel {
  static table = 'empresa'

  @column({ isPrimary: true })
  declare id: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @column.dateTime()
  declare deletedAt: DateTime | null


  @beforeCreate()
  static uuid(model: Empresa) {
    model.id ??= randomUUID()
  }

  @column()
  declare user_id: string

  @column()
  declare nome: string

  @column()
  declare nif: string

  @column()
  declare tamanho: "pequena"|"media"|"grande"

  @column()
  declare status: boolean

  @column()
  declare inadiplente: boolean

  @column()
  declare regime_iva: boolean

  /** Só relevante quando `regime_iva` — decide a taxa usada no cálculo de "IVA
   * liquidado" nos relatórios (`relatorios_repository.ts`). */
  @column()
  declare taxa_iva_id: string | null

  @belongsTo(() => taxa_iva, { foreignKey: 'taxa_iva_id' })
  declare taxaIva: BelongsTo<typeof taxa_iva>

  @column()
  declare company_alias: string

  @column()
  declare localizacao: string

  @column()
  declare contacto: string

  @column()
  declare verified: boolean

  /**
   * Suspensão pelo dono da plataforma. `null` = empresa activa.
   *
   * Coluna própria, e não `status`/`inadiplente`: essas duas são booleans sem
   * semântica documentada, com valores já gravados sob a interpretação de quem os
   * escreveu na altura. Dar-lhes agora significado numa fronteira de acesso seria
   * decidir retroactivamente quem fica de fora. Ver a migração
   * `alter_empresa_suspensao`.
   */
  @column.dateTime()
  declare suspensa_em: DateTime | null

  @column()
  declare suspensa_motivo: string | null

  @column()
  declare suspensa_por: string | null

  /**
   * A pergunta que as fronteiras de acesso fazem.
   *
   * Existe para que nenhuma delas precise de saber que a resposta vive numa data:
   * se a suspensão vier a ganhar mais estados (aviso, período de graça), muda-se
   * aqui e não em cada sítio que a verifica.
   */
  get estaSuspensa(): boolean {
    return this.suspensa_em !== null && this.suspensa_em !== undefined
  }
}
