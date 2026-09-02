import users from '#models/user'
import { DateTime } from 'luxon'
import {
  BaseModel,
  column,
  beforeCreate,
  belongsTo,
  hasMany,
  // beforeSave,
} from '@adonisjs/lucid/orm'
import { randomUUID } from 'node:crypto'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import venda_itens from './venda_itens.js'
import cliente from '#models/cliente'
import cupom from '#models/cupom'
import Empresa from '#models/empresa'
import type { CondicaoPagamento } from '../../helpers/regras_de_emissao.js'
// import db from '@adonisjs/lucid/services/db'

export default class vendas extends BaseModel {
  static table = 'vendas'

  @column({ isPrimary: true })
  declare id: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @column.dateTime()
  declare deletedAt: DateTime | null


  @beforeCreate()
  static uuid(model: vendas) {
    model.id ??= randomUUID()
  }

  @column()
  declare total: number

  @column()
  declare status: 'aberta' | 'fechada' | 'cancelada' | 'reembolsada' | 'proforma'

  /**
   * Motivos de anulação e de reembolso. As colunas existem na tabela desde sempre (ver a
   * migration de `vendas`) mas nunca tinham sido declaradas no model — na prática eram
   * inescreviveis: o Lucid recusa gravar uma propriedade que não conhece.
   */
  @column()
  declare motivo_cancelamento: string | null

  @column()
  declare motivo_reembolso: string | null

  @hasMany(() => venda_itens, {
    foreignKey: 'venda_id',
  })
  declare itens: HasMany<typeof venda_itens>

  @column()
  declare caixa_id: string | null

  @column()
  declare venda_tipo: 'presencial' | 'online' | 'online_loja'

  /**
   * Como é que esta venda é paga — e, daí, tudo o resto.
   *
   * É o único campo que o balcão escolhe sobre a relação de pagamento, e dele saem
   * quatro respostas: se o fecho exige o dinheiro, se o stock sai, que documento
   * fiscal é emitido, e se o valor conta como receita. A tabela está em
   * `REGRAS_DA_CONDICAO` (`app/helpers/regras_de_emissao.ts`), num sítio só,
   * porque as quatro têm de concordar entre si.
   *
   * `pronto_pagamento` por omissão: é o que todas as vendas anteriores a esta
   * coluna foram, porque era a única coisa que o sistema permitia.
   */
  @column()
  declare condicao_pagamento: CondicaoPagamento

  /**
   * O prazo acordado, em dias, congelado no fecho. Só nas vendas a crédito.
   *
   * Congelado e não lido de `empresa.prazo_pagamento_dias` quando é preciso: essa
   * é uma preferência que muda, e uma venda a 30 dias não passa a ser a 15 porque
   * a empresa mudou de política depois.
   */
  @column()
  declare prazo_pagamento_dias: number | null

  /**
   * Quando o produto de um adiantamento saiu efectivamente.
   *
   * Nas outras condições a entrega é o próprio fecho e esta coluna fica nula. Num
   * adiantamento é o momento em que o stock sai e a receita é reconhecida — até
   * lá há dinheiro recebido e nenhuma venda realizada.
   */
  @column.dateTime()
  declare entregue_em: DateTime | null

  @column()
  declare cliente_online_id: string | null

  @belongsTo(() => users, {
    foreignKey: 'cliente_online_id',
  })
  declare cliente_online: BelongsTo<typeof users>

  @column()
  declare cliente_presencial_id: string | null

  @belongsTo(() => cliente, {
    foreignKey: 'cliente_presencial_id',
  })
  declare cliente_presencial: BelongsTo<typeof cliente>

  @column()
  declare cupom_id: string | null

  @belongsTo(() => cupom, {
    foreignKey: 'cupom_id',
  })
  declare cupom: BelongsTo<typeof cupom>

  @column()
  declare valor_desconto: number

  /** Resolvido via `caixa.empresa_id` no momento da criação — null se essa caixa não
   * tiver empresa associada (ver caixa.ts). */
  @column()
  declare empresa_id: string | null

  @belongsTo(() => Empresa, {
    foreignKey: 'empresa_id',
  })
  declare empresa: BelongsTo<typeof Empresa>

  /** Número sequencial por empresa (nunca global) — nº do registo, distinto do `id`
   * (UUID). Null quando não há empresa associada. */
  @column()
  declare numero: number | null
}
