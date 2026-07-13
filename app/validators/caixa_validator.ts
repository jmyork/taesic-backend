import vine from '@vinejs/vine'
import { userHasRole } from '../helpers/Utils.js'

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
    valor_inicial: vine.number().decimal(30).optional(),
    total_vendas: vine.number().decimal(30).optional(),
    status: vine.string().trim().escape().optional(),
    observacoes: vine.string().trim().escape().optional(),
    total_caixa: vine.number().decimal(30).optional(),
  })
)

export const CaixaQueryValidator = vine.compile(
  vine.object({
    // Datas genéricas
    createdDtStart: vine
      .date({
        formats: ['iso8601'],
      })
      .optional(),
    createdDtEnd: vine.date({ formats: ['iso8601'] }).optional(),
    updatedDtStart: vine.date({ formats: ['iso8601'] }).optional(),
    updatedDtEnd: vine.date({ formats: ['iso8601'] }).optional(),
    deleted: vine.enum(['deleted', 'all']).optional(),

    // Campos pesquisáveis
    observacoes: vine.string().trim().escape().optional(),
    status: vine.string().trim().escape().optional(),
    total_vendas: vine.number().decimal(30).optional(),
    valor_inicial: vine.number().decimal(30).optional(),
    data_fecho: vine.date({ formats: ['iso8601'] }).optional(),
    user_id: vine.string().trim().escape().optional(),
    total_caixa: vine.number().decimal(30).optional(),

    total_vendas_start: vine.number().decimal(30).optional(),
    total_vendas_end: vine.number().decimal(30).optional(),
    valor_inicial_start: vine.number().decimal(30).optional(),
    valor_inicial_end: vine.number().decimal(30).optional(),

    total_caixa_start: vine.number().decimal(30).optional(),
    total_caixa_end: vine.number().decimal(30).optional(),

    empresa_id: vine.string().trim().uuid().optional(),
    company_alias: vine.string().trim().escape().optional(),
    page: vine.number().positive().optional(),
    limit: vine.number().positive().optional(),
  })
)
