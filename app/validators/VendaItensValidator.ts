import vine from '@vinejs/vine'

export const VendaItensCreateValidator = vine.compile(
  vine.object({
    venda_id: vine.number().exists(async (db, value) => { return await db.from('vendas').where('id', value).first() }).optional(),
    produto_validade_id: vine.number().exists(async (db, value) => { return await db.from('produto_validade').where('id', value).first() }),
    quantidade: vine.number(),
    // preco_unitario: vine.number()
  })
)

export const VendaItensUpdateValidator = vine.compile(
  vine.object({
    venda_id: vine.number().exists(async (db, value) => { return await db.from('vendas').where('id', value).first() }).optional(),
    produto_validade_id: vine.number().exists(async (db, value) => { return await db.from('produto_validade').where('id', value).first() }).optional(),
    quantidade: vine.number().optional(),
    // preco_unitario: vine.number().optional()
  })
)
