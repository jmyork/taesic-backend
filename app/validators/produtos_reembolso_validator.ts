import vine from '@vinejs/vine'

export const ReembolsoParcialValidator = vine.compile(
  vine.object({
    venda_item_id: vine.string().uuid().exists(async (db, value, field) => {
      const exists = await db.from('venda_itens')
        .join('vendas', 'vendas.id', 'venda_itens.venda_id')
        .join('caixa', 'caixa.id', 'vendas.caixa_id')
        .join('pos', 'pos.id', 'caixa.pos_id')
        .join('empresa', 'empresa.id', 'pos.empresa_id')
        .where('empresa.company_alias', field.data.params.company_alias ?? '')
        .where('venda_itens.id', value)
        .first()
      return !!exists
    }),
    venda_id: vine.string().uuid().exists(async (db, value, field) => {
      const exists = await db.from('venda_itens')
        .join('vendas', 'vendas.id', 'venda_itens.venda_id')
        .join('caixa', 'caixa.id', 'vendas.caixa_id')
        .join('pos', 'pos.id', 'caixa.pos_id')
        .join('empresa', 'empresa.id', 'pos.empresa_id')
        .where('empresa.company_alias', field.data.params.company_alias ?? '')
        .where('venda_itens.id', field.data.venda_item_id)
        .where('vendas.id', value)
        .first()
      return !!exists
    }),

    quantidade: vine.number().positive(),
    motivo: vine.string().trim().escape().optional(),
  })
)

export const ReembolsoTotalValidator = vine.compile(
  vine.object({
    venda_id: vine.string().uuid().exists(async (db, value, field) => {
      const exists = await db.from('vendas')
        .join('caixa', 'caixa.id', 'vendas.caixa_id')
        .join('pos', 'pos.id', 'caixa.pos_id')
        .join('empresa', 'empresa.id', 'pos.empresa_id')
        .where('empresa.company_alias', field.data.params.company_alias ?? '')
        .where('vendas.id', value)
        .first()
      return !!exists
    }),
    motivo: vine.string().trim().escape().optional(),
  })
)

export const ShowProdutosReembolsoValidator = vine.compile(
  vine.object({
    venda_id: vine.string().uuid(),
  })
)
export const ProdutosReembolsoQueryValidator = vine.compile(
  vine.object({
    deleted: vine.enum(['deleted', 'all']).optional(),
    createdDtStart: vine.date({ formats: ['iso8601'] }).optional(),
    createdDtEnd: vine.date({ formats: ['iso8601'] }).optional(),
    updatedDtStart: vine.date({ formats: ['iso8601'] }).optional(),
    updatedDtEnd: vine.date({ formats: ['iso8601'] }).optional(),
    page: vine.number().positive().optional(),
    limit: vine.number().positive().optional(),
    quantidade: vine.number().positive().optional(),
    quantidade_start: vine.number().positive().optional(),
    quantidade_end: vine.number().positive().optional(),
    user_id: vine.string().trim().escape().optional(),
    venda_item_id: vine.string().trim().escape().optional(),
  })
)
