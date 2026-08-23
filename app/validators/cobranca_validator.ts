import vine from '@vinejs/vine'
export const createcobrancaValidator = vine.compile(
  vine.object({
    subscricao_id: vine
      .string()
      .trim()
      .escape()
      .exists(async (db, value, __) => {
        const exists = await db.from('subscricao').where('id', value).first()
        return !!exists
      }),
    valor: vine.number().decimal([0, 12]),
    moeda: vine.string().trim().escape(),
    status: vine.string().trim().escape(),
    data_emissao: vine.date({ formats: ['iso8601'] }),
    data_vencimento: vine.date({ formats: ['iso8601'] }),
    pago: vine.boolean(),
    referencia: vine.string().trim().escape(),
  })
)
export const updatecobrancaValidator = vine.compile(
  vine.object({
    subscricao_id: vine
      .string()
      .trim()
      .escape()
      .exists(async (db, value, __) => {
        const exists = await db.from('subscricao').where('id', value).first()
        return !!exists
      })
      .optional(),
    valor: vine.number().decimal([0, 12]).optional(),
    moeda: vine.string().trim().escape().optional(),
    status: vine.string().trim().escape().optional(),
    data_emissao: vine.date({ formats: ['iso8601'] }).optional(),
    data_vencimento: vine.date({ formats: ['iso8601'] }).optional(),
    pago: vine.boolean().optional(),
    referencia: vine.string().trim().escape().optional(),
  })
)
