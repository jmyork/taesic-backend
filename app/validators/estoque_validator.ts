import vine from '@vinejs/vine'
import { validateEstoqueDisponivel } from '../helpers/ValidatorCustomRule.js'
import { commonQueryFields } from './common_query_fields.js'

export const createestoqueValidator = vine.compile(
  vine.object({
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
    pos_id: vine
      .string()
      .uuid()
      .exists(async (db, value, field) => {
        const exists = await db
          .from('pos')
          .leftJoin('empresa', 'empresa.id', 'pos.empresa_id')
          .where('empresa.company_alias', field.data.params.company_alias)
          .where('pos.id', value)
          .whereNull('pos.deleted_at')
          .first()
        return !!exists
      }),
    quantidade: vine.number().positive().withoutDecimals().use(validateEstoqueDisponivel()),

    tipo_movimentacao: vine
      .enum([
        // 'entrada', 'saida', 'ajuste', 'transferencia'
        'entrada', // Entrada genérica
        'saida', // Saída genérica
        'ajuste_negativo', // Diminui estoque (correção)
        'transferencia_saida', // Envio
        'ajuste_positivo', // Aumenta estoque (correção)
        'transferencia_entrada', // Recebimento
      ])
      .optional(),

    motivo: vine.string().escape().trim().optional().requiredWhen('tipo_movimentacao', 'in', [
      'saida', // Saída genérica
      'ajuste_negativo', // Diminui estoque (correção)
      'transferencia_saida', // Envio
    ]),
  })
)
export const EstoqueQueryValidator = vine.compile(
  vine.object({
    ...commonQueryFields,
    // este recurso limita o `limit` a 100 (paginação potencialmente grande) — sobrescreve
    // o campo partilhado, que por si só não impõe máximo.
    limit: vine.number().positive().withoutDecimals().max(100).optional(),

    // Filtros exatos
    pos_id: vine.string().trim().escape().uuid().optional(),
    registrado_por: vine.string().trim().escape().uuid().optional(),
    data_registro: vine.date({ formats: ['iso8601'] }).optional(),
    motivo: vine.string().trim().escape().optional(),
    tipo_movimentacao: vine
      .enum([
        'entrada', // Entrada genérica
        'saida', // Saída genérica
        'ajuste_positivo', // Aumenta estoque (correção)
        'ajuste_negativo', // Diminui estoque (correção)
        'transferencia_entrada', // Recebimento
        'transferencia_saida', // Envio
      ])
      .optional(),
    quantidade: vine.number().min(0).optional(),
    lote_produto_id: vine.string().trim().escape().uuid().optional(),
    produto_id: vine.string().trim().escape().uuid().optional(),

    // Data de registro (ranges)
    data_registro_start: vine.date({ formats: ['iso8601'] }).optional(),
    data_registro_end: vine
      .date({ formats: ['iso8601'] })
      .afterField('data_registro_start')
      .optional(),

    // Quantidade (ranges)
    quantidade_start: vine.number().min(0).optional(),
    quantidade_end: vine.number().min(0).optional(),
  })
)
