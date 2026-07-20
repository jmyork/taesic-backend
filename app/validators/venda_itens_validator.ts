import vine from '@vinejs/vine'
import { EstoqueDisponivelCheck } from '../helpers/ValidatorCustomRule.js'

export const createvenda_itensValidator = vine.compile(
  vine.object({
    venda_id: vine
      .string()
      .escape()
      .exists(async (db, value, field) => {
        const venda = await db.from('vendas')
          .join('caixa', 'caixa.id', 'vendas.caixa_id')
          .join('pos', 'pos.id', 'caixa.pos_id')
          .join('empresa', 'empresa.id', 'pos.empresa_id')
          .where('vendas.id', value)
          .where("vendas.status", 'aberta')
          .where('empresa.company_alias', field.data.params.company_alias ?? '')
          .select('vendas.*')
          .first()

        return !!venda
      }),
    lote_produto_id: vine
      .string()
      .escape()
      .exists(async (db, value, field) => {
        const exists = await db
          .from('produtos')
          .leftJoin('empresa', 'empresa.id', 'produtos.empresa_id')
          .leftJoin('lote_produto', 'lote_produto.produto_id', 'produtos.id')
          .where('empresa.company_alias', field.data.params.company_alias)
          .where('lote_produto.id', value)
          .whereNull('lote_produto.deleted_at')
          .where('produtos.is_service', false)
          .first()
        return !!exists
      }),
    quantidade: vine.number().positive().use(EstoqueDisponivelCheck()),
    operation_type: vine.enum(['sub', 'add']).optional(),
    // preco_unitario: vine.().escape(),
  })
)


export const VendaItensQueryValidator = vine.compile(
  vine.object({
    deleted: vine.enum(['deleted', 'all']).optional(),
    createdDtStart: vine.date({ formats: ['iso8601'] }).optional(),
    createdDtEnd: vine.date({ formats: ['iso8601'] }).optional(),
    updatedDtStart: vine.date({ formats: ['iso8601'] }).optional(),
    updatedDtEnd: vine.date({ formats: ['iso8601'] }).optional(),
    page: vine.number().positive().optional(),
    limit: vine.number().positive().optional(),

    venda_id: vine
      .string()
      .uuid().optional(),
    lote_produto_id: vine
      .string()
      .uuid().optional(),
  })
)

export const VendaItemCreateValidator = vine.compile(
  vine.object({
    venda_id: vine
      .string()
      .escape()
      .exists(async (db, value, __) => {
        const exists = await db.from('vendas').where('id', value).first()
        return exists !== undefined
      }),
    lote_produto_id: vine
      .string()
      .escape()
      .exists(async (db, value, __) => {
        const exists = await db.from('lote_produto').where('id', value).first()
        return exists !== undefined
      }),
    quantidade: vine.number().positive(),
  })
)

export const VendaItemDestroyValidator = vine.compile(
  vine.object({
    id: vine.string().escape().exists(async (db, value, __) => {
      const exists = await db.from('venda_itens').where('id', value).first()
      return exists !== undefined
    }),
  })
)
