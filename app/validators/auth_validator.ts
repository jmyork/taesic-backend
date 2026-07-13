import vine from '@vinejs/vine'
import ValidatorConstraint from '../helpers/Validator.js'

export const UsersCreateValidator = vine.compile(
  vine.object({
    username: vine
      .string()
      .escape()
      .trim()
      .unique(async (db, value) => {
        return !(await db.from('user').where('username', value).first())
      })
      .maxLength(255),
    email: vine
      .string()
      .email()
      .escape()
      .trim()
      .maxLength(255)
      .unique(async (db, value) => {
        return !(await db.from('user').where('email', value).first())
      }),
    papel: vine
      .array(
        vine.enum([
          'Estoquista',
          'EstoquistaVisualizador',
          'Vendedor',
          'VendedorVisualizador',
          'AdminVisualizador',
          'AdminUserManager',
          'AdminUserVisualizador',
        ])
      )
      .distinct(),
    // password: vine.string().trim().escape().minLength(6),
  })
)

export const UsersUpdateValidator = vine.compile(
  vine.object({
    username: vine
      .string()
      .escape()
      .trim()
      .maxLength(255)
      .unique(async (db, value, field) => {
        return !(await db
          .from('user')
          .where('username', value)
          .whereNot('id', field.meta._id)
          .first())
      })
      .optional(),
    password: vine.string().trim().escape().minLength(6), //.regex(/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{6,}$/).optional(),
  })
)

export const UserLoginValidator = vine.compile(
  vine.object({
    uid: vine.string().trim().trim().escape(),
    password: vine.string().trim().minLength(6).escape(),
    company_alias: vine
      .string()
      .trim()
      .escape()
      .exists(
        new ValidatorConstraint({
          table: 'empresa',
          column: 'company_alias',
          idColumn: 'company_alias',
        }).existsRule()
      ).optional(),
  })
)

export const UserForgotPasswordValidator = vine.compile(
  vine.object({
    email: vine
      .string()
      .trim()
      .email()
      .exists(async (db, value, field) => {
        return await db
          .from('user')
          .where('email', value)
          .join('empresa', 'empresa.id', 'user.empresa_id')
          .where('empresa.company_alias', field.parent.params.company_alias)
          .where('user.email', value)
          .first()
      }),
  })
)

export const UserResetPasswordValidator = vine.compile(
  vine.object({
    email: vine
      .string()
      .trim()
      .email()
      .exists(async (db, value, field) => {
        return await db
          .from('user')
          .where('email', value)
          .join('empresa', 'empresa.id', 'user.empresa_id')
          .where('empresa.company_alias', field.parent.params.company_alias)
          .where('user.email', value)
          .first()
      }),
    password: vine.string().trim().escape().minLength(6),
  })
)

export const QsValidator = vine.compile(
  vine.object({
    page: vine.number().positive().min(1).optional(),
    limit: vine.number().positive().min(1).optional(),
    created_at: vine.date({ formats: ['iso8601'] }).optional(),
    query: vine.string().trim().escape().maxLength(150).optional(),
    updated_at: vine.date({ formats: ['iso8601'] }).optional(),
  })
)
