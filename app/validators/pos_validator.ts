import vine from '@vinejs/vine'
export const createposValidator = vine.compile(
  vine.object({
    nome: vine
      .string()
      .escape()
      .unique(async (db, value, field) => {
        return !(await db
          .from('pos')
          .join('empresa', 'empresa.id', 'pos.empresa_id')
          .where('empresa.company_alias', field.data.params.company_alias)
          .where('pos.nome', value)
          .first())
      }),
    email: vine
      .string()
      .trim()
      .email()
      .unique(async (db, value, field) => {
        return !(await db
          .from('pos')
          .join('empresa', 'empresa.id', 'pos.empresa_id')
          .where('empresa.company_alias', field.data.params.company_alias)
          .where('pos.email', value)
          .first())
      }),
    contacto: vine
      .string()
      .trim()
      .escape()
      .unique(async (db, value, field) => {
        return !(await db
          .from('pos')
          .join('empresa', 'empresa.id', 'pos.empresa_id')
          .where('empresa.company_alias', field.data.params.company_alias)
          .where('pos.contacto', value)
          .first())
      }),
    localizacao: vine.string().trim().escape(),
  })
)
export const updateposValidator = vine.compile(
  vine.object({
    nome: vine
      .string()
      .unique(async (db, value, field) => {
        return !(await db
          .from('pos')
          .join('empresa', 'empresa.id', 'pos.empresa_id')
          .where('empresa.company_alias', field.data.params.company_alias)
          .where('pos.nome', value)
          .whereNot('pos.id', field.meta.id)
          .whereNotNull('pos.deleted_at')
          .first())
      })
      .escape()
      .optional(),
    email: vine
      .string()
      .trim()
      .email()
      .unique(async (db, value, field) => {
        return !(await db
          .from('pos')
          .join('empresa', 'empresa.id', 'pos.empresa_id')
          .where('empresa.company_alias', field.data.params.company_alias)
          .where('pos.email', value)
          .whereNot('pos.id', field.meta.id)
          .whereNotNull('pos.deleted_at')
          .first())
      })
      .optional(),
    contacto: vine
      .string()
      .trim()
      .escape()
      .unique(async (db, value, field) => {
        return !(await db
          .from('pos')
          .join('empresa', 'empresa.id', 'pos.empresa_id')
          .where('empresa.company_alias', field.data.params.company_alias)
          .where('pos.contacto', value)
          .whereNot('pos.id', field.meta.id)
          .whereNotNull('pos.deleted_at')
          .first())
      })
      .optional(),
    localizacao: vine.string().trim().escape().optional(),
  })
)

export const PosQueryValidator = vine.compile(
  vine.object({
    deleted: vine.enum(['deleted', 'all']).optional(),
    createdDtStart: vine.date({ formats: ['iso8601'] }).optional(),
    createdDtEnd: vine.date({ formats: ['iso8601'] }).optional(),
    updatedDtStart: vine.date({ formats: ['iso8601'] }).optional(),
    updatedDtEnd: vine.date({ formats: ['iso8601'] }).optional(),
    nome: vine.string().trim().escape().optional(),
    localizacao: vine.string().trim().escape().optional(),
    contacto: vine.string().trim().optional(),
    email: vine.string().trim().optional(),
    empresa_id: vine.string().trim().uuid().optional(),

    page: vine.number().positive().optional(),
    limit: vine.number().positive().optional(),
  })
)
