import vine from '@vinejs/vine'

export const UsersCreateValidator = vine.compile(
  vine.object({
        nome:vine.string().escape().trim().maxLength(255),
		email:vine.string().escape().trim().maxLength(255).unique(async (db,value)=>{return !await db.from('users').where('email',value).first()}),
		telefone:vine.string().escape().trim().maxLength(255).optional(),
		tipo:vine.enum(['vendedor','administrador','estoquista',]),
		password:vine.string().escape().trim()
  })
)

export const UsersUpdateValidator =  vine.compile(
  vine.object({
        nome:vine.string().escape().trim().maxLength(255).optional(),
		email:vine.string().escape().trim().maxLength(255).unique(async (db,value,field)=>{return !await db.from('users').where('email',value).whereNot('id',field.meta._id).first()}).optional(),
		telefone:vine.string().escape().trim().maxLength(255).optional(),
		tipo:vine.enum(['vendedor','administrador','estoquista',]).optional(),
		password:vine.string().escape().trim().optional(),
		current_password:vine.string().escape().trim().optional()
  })
)

export const UserLoginValidator = vine.compile(vine.object({
  // username: vine.string().trim().escape().minLength(3).maxLength(20).regex(/^[a-zA-Z0-9_]+$/).optional(),
  email: vine.string().trim().escape().email(),
  password: vine.string(),
}))
