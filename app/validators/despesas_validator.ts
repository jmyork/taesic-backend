import vine from '@vinejs/vine'
import { commonQueryFields } from './common_query_fields.js'

export const createdespesasValidator = vine.compile(
  vine.object({
    pos_id: vine
      .string()
      .trim()
      .uuid()
      .exists(async (db, value, field) => {
        const exists = await db
          .from('pos')
          .join('empresa', 'empresa.id', 'pos.empresa_id')
          .where('empresa.company_alias', field.data.params?.company_alias ?? '')
          .where('pos.id', value)
          .first()
        return !!exists
      })
      .optional(),
    categoria: vine.string().trim().escape().maxLength(80),
    descricao: vine.string().trim().escape().optional(),
    valor: vine.number().decimal([0, 12]).positive(),
    data_despesa: vine.date({ formats: ['iso8601'] }),
  })
)

export const updatedespesasValidator = vine.compile(
  vine.object({
    pos_id: vine
      .string()
      .trim()
      .uuid()
      .exists(async (db, value, field) => {
        const exists = await db
          .from('pos')
          .join('empresa', 'empresa.id', 'pos.empresa_id')
          .where('empresa.company_alias', field.data.params?.company_alias ?? '')
          .where('pos.id', value)
          .first()
        return !!exists
      })
      .optional(),
    categoria: vine.string().trim().escape().maxLength(80).optional(),
    descricao: vine.string().trim().escape().optional(),
    valor: vine.number().decimal([0, 12]).positive().optional(),
    data_despesa: vine.date({ formats: ['iso8601'] }).optional(),
  })
)

export const DespesasQueryValidator = vine.compile(
  vine.object({
    ...commonQueryFields,

    pos_id: vine.string().trim().uuid().optional(),
    categoria: vine.string().trim().escape().optional(),
    valor: vine.number().decimal([0, 12]).optional(),
    valor_start: vine.number().decimal([0, 12]).optional(),
    valor_end: vine.number().decimal([0, 12]).optional(),
    data_despesa_start: vine.date({ formats: ['iso8601'] }).optional(),
    data_despesa_end: vine.date({ formats: ['iso8601'] }).optional(),
  })
)
