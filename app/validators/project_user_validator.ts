import { emailUtilizavel } from '../helpers/email_valido.js'
import vine from '@vinejs/vine'
export const createproject_userValidator = vine.compile(
  vine.object({
    username: vine.string().trim(),
    email: vine.string().trim().email().use(emailUtilizavel()),
    password: vine.string().trim().minLength(6),
    project_id: vine
      .string()
      .trim()
      .exists(async (db, value, __) => {
        const exists = await db.from('project').where('id', value).first()
        return exists !== undefined
      }),
  })
)
export const updateproject_userValidator = vine.compile(
  vine.object({
    username: vine.string().trim().optional(),
    email: vine.string().trim().email().use(emailUtilizavel()).optional(),
    password: vine.string().trim().minLength(6).optional(),
    // project_id: vine.string().trim().exists(async (db, value, __) => {
    //   const exists = await db.from('project').where('id', value).first()
    //   return exists !== undefined
    // }),
  })
)
