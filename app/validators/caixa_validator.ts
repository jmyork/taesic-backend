import vine from '@vinejs/vine'
import { userHasRole } from '../helpers/Utils.js'
import { commonQueryFields } from './common_query_fields.js'

export const OpenCaixaValidator = vine.compile(
  vine.object({
    valor_inicial: vine.number().decimal([0, 12]).optional(),

    pos_id: vine
      .string()
      .trim()
      .escape()
      .exists(async (db, value, field) => {
        const companyAlias = field.data.params?.company_alias
        const userId = field.meta?.user_id
        // console.log("User has role:", await userHasRole(userId, ["Admin"]));

        if (!companyAlias || !userId) return false

        const pos = await db
          .from('pos')
          .join('userpos', 'userpos.pos_id', 'pos.id')
          .where('pos.id', value)
          .where('userpos.user_id', userId)
          .whereNull('userpos.deleted_at')
          .limit(1)
          .first()

        return !!pos || (await userHasRole(userId, ['Admin']))
      }),
  })
)

export const ToggleCaixaValidator = vine.compile(
  vine.object({
    observacoes: vine.string().trim().escape().optional(),
  })
)

// CloseCaixaValidator agora reutiliza o mesmo schema
export const CloseCaixaValidator = ToggleCaixaValidator

// export const CloseCaixaValidator = vine.compile(
//   vine.object({
//     observacoes: vine.string().trim().escape().optional(),
//   })
// )

export const createcaixaValidator = vine.compile(
  vine.object({
    user_id: vine
      .string()
      .trim()
      .escape()
      .exists(async (db, value, __) => {
        const exists = await db.from('user').where('id', value).first()
        return exists !== undefined
      }),
    data_abertura: vine.date({ formats: ['iso8601'] }),
    data_fecho: vine.date({ formats: ['iso8601'] }),
    valor_inicial: vine.number().decimal([0, 12]),
    total_vendas: vine.number().decimal([0, 12]),
    status: vine.string().trim().escape(),
    observacoes: vine.string().trim().escape(),
    total_caixa: vine.number().decimal([0, 12]),
  })
)
export const updatecaixaValidator = vine.compile(
  vine.object({
    user_id: vine
      .string()
      .trim()
      .escape()
      .exists(async (db, value, __) => {
        const exists = await db.from('user').where('id', value).first()
        return exists !== undefined
      })
      .optional(),
    data_abertura: vine.date({ formats: ['iso8601'] }).optional(),
    data_fecho: vine.date({ formats: ['iso8601'] }).optional(),
    valor_inicial: vine.number().decimal([0, 12]).optional(),
    total_vendas: vine.number().decimal([0, 12]).optional(),
    status: vine.string().trim().escape().optional(),
    observacoes: vine.string().trim().escape().optional(),
    total_caixa: vine.number().decimal([0, 12]).optional(),
  })
)

export const CaixaQueryValidator = vine.compile(
  vine.object({
    ...commonQueryFields,

    // Campos pesquisáveis específicos de caixa
    observacoes: vine.string().trim().escape().optional(),
    status: vine.string().trim().escape().optional(),
    total_vendas: vine.number().decimal([0, 12]).optional(),
    valor_inicial: vine.number().decimal([0, 12]).optional(),
    data_fecho: vine.date({ formats: ['iso8601'] }).optional(),
    user_id: vine.string().trim().escape().optional(),
    total_caixa: vine.number().decimal([0, 12]).optional(),

    total_vendas_start: vine.number().decimal([0, 12]).optional(),
    total_vendas_end: vine.number().decimal([0, 12]).optional(),
    valor_inicial_start: vine.number().decimal([0, 12]).optional(),
    valor_inicial_end: vine.number().decimal([0, 12]).optional(),

    total_caixa_start: vine.number().decimal([0, 12]).optional(),
    total_caixa_end: vine.number().decimal([0, 12]).optional(),
  })
)
