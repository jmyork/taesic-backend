import vine from '@vinejs/vine'

export const createmetodopagamentoValidator = vine.compile(
  vine.object({
    nome: vine.string().trim().escape().unique(async (db, value, __) => {
      return !await db.query().from('metodopagamento').where('nome', value).first()
    }),
    descricao: vine.string().trim().escape(),
  })
)

export const updatemetodopagamentoValidator = vine.compile(
  vine.object({
    nome: vine.string().trim().escape().unique(async (db, value, field) => {
      return !await db.query().from('metodopagamento').where('nome', value).whereNot('id', field.meta.id).first()
    }).optional(),
    descricao: vine.string().trim().escape().optional(),
  })
)


export const MetodoPagamentoQueryValidator = vine.compile(
  vine.object({
    nome: vine.string().trim().escape().optional(),
    descricao: vine.string().trim().escape().optional(),

    deleted: vine.enum(['deleted', 'all']).optional(),
    createdDtStart: vine.date({ formats: ['iso8601'] }).optional(),
    createdDtEnd: vine.date({ formats: ['iso8601'] }).optional(),
    updatedDtStart: vine.date({ formats: ['iso8601'] }).optional(),
    updatedDtEnd: vine.date({ formats: ['iso8601'] }).optional(),

    page: vine.number().positive().optional(),
    limit: vine.number().positive().optional(),
  })
)

