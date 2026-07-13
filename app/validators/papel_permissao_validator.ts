import vine from '@vinejs/vine'
export const createpapel_permissaoValidator = vine.compile(
  vine.object({
    papel_id: vine
      .string()
      .exists(async (db, value, __) => {
        const exists = await db.from('papel').where('id', value).first()
        return exists !== undefined
      })
      .unique(async (db, __, field) => {
        const isUnique = !(await db
          .from('user_papel')
          .where('permissao_id', field.data.permissao_id)
          .where('papel_id', field.data.papel_id))
        return isUnique
      }),
    permissao_id: vine
      .string()
      .exists(async (db, value, __) => {
        const exists = await db.from('permissao').where('id', value).first()
        return exists !== undefined
      })
      .unique(async (db, __, field) => {
        const isUnique = !(await db
          .from('user_papel')
          .where('permissao_id', field.data.permissao_id)
          .where('papel_id', field.data.papel_id))
        return isUnique
      }),
  })
)
// export const updatepapel_permissaoValidator = vine.compile(
//   vine.object({
//     papel_id: vine.string().trim().exists(async (db, value, __) => {
//       const exists = await db.from('papel').where('id', value).first()
//       return exists !== undefined
//     }).optional(),
//     permissao_id: vine.string().trim().exists(async (db, value, __) => {
//       const exists = await db.from('permissao').where('id', value).first()
//       return exists !== undefined
//     }).optional(),
//   })
// )
