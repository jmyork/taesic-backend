import vine from '@vinejs/vine'
export const createempresa_token_activacaoValidator = vine.compile(
  vine.object({
    empresa_id: vine
      .string()
      .escape()
      .exists(async (db, value, __) => {
        const exists = await db.from('empresa').where('id', value).first()
        return exists !== undefined
      }),
    token: vine.string().trim().escape(),
  })
)
export const updateempresa_token_activacaoValidator = vine.compile(
  vine.object({
    empresa_id: vine
      .string()
      .escape()
      .exists(async (db, value, __) => {
        const exists = await db.from('empresa').where('id', value).first()
        return exists !== undefined
      })
      .optional(),
    token: vine.string().trim().escape().optional(),
  })
)
