import vine from '@vinejs/vine'
import { CheckPrecoCompraEqualOrLessThanPrecoVenda, requiredIfNotService } from '../helpers/ValidatorCustomRule.js'

export const createloteValidator = vine.compile(
  vine.object({
    produto_id: vine
      .string()
      .uuid()
      .escape()
      .exists(async (db, value, field) => {
        const exists = await db
          .from('produtos')
          .leftJoin('empresa', 'empresa.id', 'produtos.empresa_id')
          .where('empresa.company_alias', field.data.params.company_alias)
          .where('produtos.id', value)
          .whereNull('produtos.deleted_at')
          .first()
        return !!exists
      }),

    data_validade: vine
      .date({ formats: ['iso8601'] })
      .afterOrEqual('today')
      .afterField('data_fabrico')
      .optional(),
    data_fabrico: vine
      .date({ formats: ['iso8601'] })
      .beforeOrEqual('today')
      .optional(),
    // quantidade_em_estoque: vine.number().optional().use(requiredIfNotService()).optional(),
    lote: vine.string().escape().trim().unique(async (db, value, field) => {
      const exists = await db
        .from('produtos')
        .leftJoin('empresa', 'empresa.id', 'produtos.empresa_id')
        .leftJoin('lote_produto', 'lote_produto.produto_id', 'produtos.id')
        .where('empresa.company_alias', field.data.params.company_alias)
        .where('lote_produto.lote', value)
        .first()
      return !exists

    }).optional(),
    preco_venda: vine.number().decimal([0, 12]).positive(),
    preco_compra: vine.number().decimal([0, 12]).positive().optional().use(requiredIfNotService()).use(CheckPrecoCompraEqualOrLessThanPrecoVenda()),
  })
)



export const updateloteValidator = vine.compile(
  vine.object({

    lote: vine.string().escape().trim().unique(async (db, value, field) => {
      const exists = await db
        .from('produtos')
        .leftJoin('empresa', 'empresa.id', 'produtos.empresa_id')
        .leftJoin('lote_produto', 'lote_produto.produto_id', 'produtos.id')
        .where('empresa.company_alias', field.data.params.company_alias)
        .where('lote_produto.lote', value)
        .whereNot('lote_produto.id', field.meta.id) // Ignorar o lote atual
        .first()
      return !exists

    }).optional(),
    data_validade: vine
      .date({ formats: ['iso8601'] })
      .afterOrEqual('today')
      .afterField('data_fabrico')
      .optional(),
    data_fabrico: vine
      .date({ formats: ['iso8601'] })
      .beforeOrEqual('today')
      .optional(),
    preco_venda: vine.number().decimal([0, 12]).positive().optional(),
    preco_compra: vine.number().decimal([0, 12]).positive().optional().use(requiredIfNotService()).use(CheckPrecoCompraEqualOrLessThanPrecoVenda()),
  })
)

export const LoteQueryValidator = vine.compile(
  vine.object({
    // Filtros de status
    deleted: vine.enum(['deleted', 'all']).optional(),

    // Audit dates (ranges)
    createdDtStart: vine.date({ formats: ['iso8601'] }).optional(),
    createdDtEnd: vine.date({ formats: ['iso8601'] }).optional(),
    updatedDtStart: vine.date({ formats: ['iso8601'] }).optional(),
    updatedDtEnd: vine.date({ formats: ['iso8601'] }).optional(),

    // Filtros exatos
    produto_id: vine.string().trim().escape().uuid().optional(),
    lote: vine.string().trim().escape().optional(),
    quantidade_em_estoque: vine.number().min(0).optional(),
    data_validade: vine.date({ formats: ['iso8601'] }).optional(),
    data_fabrico: vine.date({ formats: ['iso8601'] }).optional(),
    preco_venda: vine.number().decimal([0, 12]).optional(),
    preco_compra: vine.number().decimal([0, 12]).optional(),

    // Data de fabrico (ranges)
    data_fabrico_start: vine.date({ formats: ['iso8601'] }).optional(),
    data_fabrico_end: vine
      .date({ formats: ['iso8601'] })
      .afterField('data_fabrico_start')
      .optional(),

    // Data de validade (ranges)
    data_validade_start: vine.date({ formats: ['iso8601'] }).optional(),
    data_validade_end: vine
      .date({ formats: ['iso8601'] })
      .afterField('data_validade_start')
      .optional(),

    // Preços (ranges)
    preco_compra_start: vine.number().decimal([0, 12]).positive().optional(),
    preco_compra_end: vine.number().decimal([0, 12]).positive().optional(),
    preco_venda_start: vine.number().decimal([0, 12]).positive().optional(),
    preco_venda_end: vine.number().decimal([0, 12]).positive().optional(),

    // Empresa
    empresa_id: vine.string().trim().escape().uuid().optional(),
    company_alias: vine.string().trim().escape().optional(),

    // Paginação
    page: vine.number().positive().optional(),
    limit: vine.number().positive().withoutDecimals().max(100).optional(),
  })
)
