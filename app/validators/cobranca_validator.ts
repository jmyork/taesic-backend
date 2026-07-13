import vine from '@vinejs/vine'
import { randomUUID } from 'crypto'
import UniqueValidator from '../helpers/Validator.js'
export const createcobrancaValidator = vine.compile(
  vine.object({
    subscricao_id: vine
      .string()
      .trim()
      .escape()
      .exists(async (db, value, __) => {
        const exists = await db.from('subscricao').where('id', value).first()
        return exists !== undefined
      }),
    valor: vine.number().decimal(30),
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
        return exists !== undefined
      })
      .optional(),
    valor: vine.number().decimal(30).optional(),
    moeda: vine.string().trim().escape().optional(),
    status: vine.string().trim().escape().optional(),
    data_emissao: vine.date({ formats: ['iso8601'] }).optional(),
    data_vencimento: vine.date({ formats: ['iso8601'] }).optional(),
    pago: vine.boolean().optional(),
    referencia: vine.string().trim().escape().optional(),
  })
)
