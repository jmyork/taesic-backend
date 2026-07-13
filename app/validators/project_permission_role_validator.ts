import vine from '@vinejs/vine'
export const createproject_permission_roleValidator = vine.compile(
  vine.object({
    project_permission_id: vine
      .string()
      .trim()
      .exists(async (db, value, __) => {
        const exists = await db.from('project_permission').where('id', value).first()
        return exists !== undefined
      }),
    project_role_id: vine
      .string()
      .trim()
      .exists(async (db, value, __) => {
        const exists = await db.from('project_role').where('id', value).first()
        return exists !== undefined
      }),
  })
)
export const updateproject_permission_roleValidator = vine.compile(
  vine.object({
    project_permission_id: vine
      .string()
      .exists(async (db, value, __) => {
        const exists = await db.from('project_permission').where('id', value).first()
        return exists !== undefined
      })
      .optional(),
    project_role_id: vine
      .string()
      .exists(async (db, value, __) => {
        const exists = await db.from('project_role').where('id', value).first()
        return exists !== undefined
      })
      .optional(),
  })
)
