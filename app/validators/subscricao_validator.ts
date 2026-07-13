import vine from '@vinejs/vine'
export const createsubscricaoValidator = vine.compile(
  vine.object({
    cliente_id: vine
      .string()
      .trim()
      .escape()
      .exists(async (db, value, __) => {
        const exists = await db.from('empresa').where('id', value).first()
        return exists !== undefined
      }),
    plano_id: vine
      .string()
      .trim()
      .escape()
      .exists(async (db, value, __) => {
        const exists = await db.from('plano').where('id', value).first()
        return exists !== undefined
      }),
    status: vine.string().trim().escape(),
    data_inicio: vine.date({ formats: ['iso8601'] }),
    data_fim: vine.date({ formats: ['iso8601'] }),
    renova: vine.boolean(),
    cancelada_em: vine.date({ formats: ['iso8601'] }),
  })
)
export const updatesubscricaoValidator = vine.compile(
  vine.object({
    cliente_id: vine
      .string()
      .trim()
      .escape()
      .exists(async (db, value, __) => {
        const exists = await db.from('empresa').where('id', value).first()
        return exists !== undefined
      })
      .optional(),
    plano_id: vine
      .string()
      .trim()
      .escape()
      .exists(async (db, value, __) => {
        const exists = await db.from('plano').where('id', value).first()
        return exists !== undefined
      })
      .optional(),
    status: vine.string().trim().escape().optional(),
    data_inicio: vine.date({ formats: ['iso8601'] }).optional(),
    data_fim: vine.date({ formats: ['iso8601'] }).optional(),
    renova: vine.boolean().optional(),
    cancelada_em: vine.date({ formats: ['iso8601'] }).optional(),
  })
)
