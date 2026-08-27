import { DateTime } from 'luxon'
import { BaseModel, column, beforeCreate, belongsTo } from '@adonisjs/lucid/orm'
import { randomUUID } from 'node:crypto'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Empresa from './empresa.js'

/**
 * Um ramo de actuação escolhido por uma empresa. Uma linha por ramo.
 *
 * Fonte da verdade sobre o CONJUNTO de ramos; `empresa.ramo_actuacao` guarda só o
 * principal (o primeiro escolhido), para os ecrãs e respostas que só têm espaço para um
 * nome. Ver a migração `create_empresa_ramo`.
 *
 * **Sem `deletedAt`**, ao contrário de quase todos os models deste projecto: isto é um
 * conjunto de escolhas e não um registo de negócio — retirar um ramo é retirar a linha.
 */
export default class EmpresaRamo extends BaseModel {
  static table = 'empresa_ramo'

  @column({ isPrimary: true })
  declare id: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @beforeCreate()
  static uuid(model: EmpresaRamo) {
    model.id ??= randomUUID()
  }

  @column()
  declare empresa_id: string

  @belongsTo(() => Empresa, { foreignKey: 'empresa_id' })
  declare empresa: BelongsTo<typeof Empresa>

  /** O `id` do ramo no catálogo (`farmacia`, `restauracao`, ...) — ver
   *  `app/helpers/ramos_de_actuacao.ts`. Texto, e não chave estrangeira: o catálogo vive
   *  no código, e um ramo retirado de lá deve continuar legível como história do que a
   *  empresa escolheu. */
  @column()
  declare ramo: string
}
