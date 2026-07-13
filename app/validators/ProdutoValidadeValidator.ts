import vine from '@vinejs/vine'

export const ProdutoValidadeCreateValidator = vine.compile(
  vine.object({
    produto_id: vine.number().exists(async (db, value) => { return await db.from('produtos').where('id', value).first() }),
    data_validade: vine.date(),
    data_fabrico: vine.date(),
    preco_compra: vine.number(),
    preco_venda: vine.number()
  })
)

export const ProdutoValidadeUpdateValidator = vine.compile(
  vine.object({
    produto_id: vine.number().exists(async (db, value) => { return await db.from('produtos').where('id', value).first() }).optional(),
    data_validade: vine.date().optional(),
    data_fabrico: vine.date().optional(),
    preco_compra: vine.number().optional(),
    preco_venda: vine.number().optional()
  })
)
