import vine from '@vinejs/vine'
export const createprojectValidator = vine.compile(
  vine.object({
    nome: vine.string().trim(),
    descricao: vine.string().trim(),
    // user_id: vine.string().trim().exists(async (db, value, __) => {
    //   const exists = await db.from('user').where('id', value).first()
    //   return exists !== undefined
    // }),
  })
)
export const updateprojectValidator = vine.compile(
  vine.object({
    nome: vine.string().trim().optional(),
    descricao: vine.string().trim().optional(),
    // user_id: vine.string().trim().exists(async (db, value, __) => {
    //   const exists = await db.from('user').where('id', value).first()
    //   return exists !== undefined
    // }).optional(),
  })
)
