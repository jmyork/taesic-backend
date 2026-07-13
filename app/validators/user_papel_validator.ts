import vine from '@vinejs/vine'
export const createuser_papelValidator = vine.compile(
  vine.object({
    user_id: vine
      .string()
      .exists(async (db, value, __) => {
        const exists = await db.from('user').where('id', value).first()
        return exists !== undefined
      })
      .unique(async (db, __, field) => {
        const isUnique = !(await db
          .from('user_papel')
          .where('user_id', field.data.user_id)
          .where('papel_id', field.data.papel_id))
        return isUnique
      }),
    papel_id: vine
      .string()
      .exists(async (db, value, __) => {
        const exists = await db.from('papel').where('id', value).first()
        return exists !== undefined
      })
      .unique(async (db, __, field) => {
        const isUnique = !(await db
          .from('user_papel')
          .where('user_id', field.data.user_id)
          .where('papel_id', field.data.papel_id))
        return isUnique
      }),
  })
)
// export const updateuser_papelValidator = vine.compile(
//   vine.object({
//     user_id: vine.string().trim().exists(async (db, value, __) => {
//       const exists = await db.from('user').where('id', value).first()
//       return exists !== undefined
//     }).optional(),
//     papel_id: vine.string().trim().exists(async (db, value, __) => {
//       const exists = await db.from('papel').where('id', value).first()
//       return exists !== undefined
//     }).optional(),
//   })
// )
