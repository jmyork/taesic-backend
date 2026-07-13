import vine from '@vinejs/vine'
export const createproject_roleValidator = vine.compile(
  vine.object({
    project_id: vine
      .string()
      .trim()
      .exists(async (db, value, __) => {
        const exists = await db.from('project').where('id', value).first()
        return exists !== undefined
      }),
    name: vine.string().trim(),
    descricao: vine.string().trim(),
  })
)
export const updateproject_roleValidator = vine.compile(
  vine.object({
    project_id: vine
      .string()
      .exists(async (db, value, __) => {
        const exists = await db.from('project').where('id', value).first()
        return exists !== undefined
      })
      .optional(),
    name: vine.string().trim().optional(),
    descricao: vine.string().trim().optional(),
  })
)
