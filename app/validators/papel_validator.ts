import vine from '@vinejs/vine'
export const createpapelValidator = vine.compile(
  vine.object({
    nome: vine
      .string()
      .trim()
      .unique(async (db, value, _) => {
        const existing = await db.from('papel').where('nome', value).first()
        return !existing
      }),
    descricao: vine.string().trim(),
  })
)
export const updatepapelValidator = vine.compile(
  vine.object({
    nome: vine
      .string()
      .unique(async (db, value, field) => {
        const existing = await db.from('papel').where('nome', value).first()
        return !existing || existing.id === field.meta._id
      })
      .optional(),
    descricao: vine.string().trim().optional(),
  })
)
