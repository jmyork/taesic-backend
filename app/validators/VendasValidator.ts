import vine from '@vinejs/vine'

export const VendasCreateValidator = vine.compile(
  vine.object({
    vendedor_id: vine.number().exists(async (db, value) => { return await db.from('users').where('id', value).first() }).optional(),
    // data_venda: vine.date(),
    // total: vine.number().optional(),
    // fechado: vine.boolean().optional()
  })
)

// export const VendasUpdateValidator = vine.compile(
//   vine.object({
//     vendedor_id: vine.number().exists(async (db, value) => { return await db.from('users').where('id', value).first() }).optional(),
//     // data_venda: vine.date().optional(),
//     // total: vine.number().optional(),
//     // fechado: vine.boolean().optional()
//   })
// )
