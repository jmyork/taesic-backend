import vine from '@vinejs/vine'

export const createuserposValidator = vine.compile(
  vine.object({
    user_id: vine
      .string()
      .trim()
      .escape()
      .uuid()
      .exists(async (db, value, field) => {
        const exists = await db
          .from('user')
          .join('empresa', 'user.empresa_id', 'empresa.id')
          .where('empresa.company_alias', field.data.params?.company_alias)
          .where('user.id', value)
          .whereNull('user.deleted_at')
          .first()
        return !!exists
      })
      .unique(async (db, value, field) => {
        const exists = await db
          .from('user')
          .join('empresa', 'user.empresa_id', 'empresa.id')
          .where('empresa.company_alias', field.data.params?.company_alias)
          .join('userpos', 'userpos.user_id', 'user.id')
          .where('userpos.user_id', value)
          .whereNull('userpos.deleted_at')
          .first()
        return !exists
      }),
    pos_id: vine
      .string()
      .trim()
      .escape()
      .uuid()
      .exists(async (db, value, field) => {
        const exists = await db
          .from('pos')
          .join('empresa', 'pos.empresa_id', 'empresa.id')
          .where('empresa.company_alias', field.data.params?.company_alias)
          .where('pos.id', value)
          .whereNull('pos.deleted_at')
          .first()
        return !!exists
      })
      .unique(async (db, value, field) => {
        const exists = await db
          .from('pos')
          .join('empresa', 'pos.empresa_id', 'empresa.id')
          .where('empresa.company_alias', field.data.params?.company_alias)
          .join('userpos', 'userpos.pos_id', 'pos.id')
          .where('userpos.pos_id', value)
          .whereNull('userpos.deleted_at')
          .first()
        return !exists
      }),
  })
)

export const UserPosQueryValidator = vine.compile(
  vine.object({
    deleted: vine.enum(['deleted', 'all']).optional(),
    createdDtStart: vine.date({ formats: ['iso8601'] }).optional(),
    createdDtEnd: vine.date({ formats: ['iso8601'] }).optional(),
    updatedDtStart: vine.date({ formats: ['iso8601'] }).optional(),
    updatedDtEnd: vine.date({ formats: ['iso8601'] }).optional(),

    user_id: vine.string().trim().escape().uuid().optional(),
    pos_id: vine.string().trim().escape().uuid().optional(),
    empresa_id: vine.string().trim().uuid().optional(),
    page: vine.number().positive().optional(),
    limit: vine.number().positive().optional(),
  })
)
