import vine from '@vinejs/vine'

export const createPromotorValidator = vine.compile(
  vine.object({
    nome: vine.string().trim().minLength(2).maxLength(255),
    email: vine
      .string()
      .trim()
      .email()
      .unique(async (db, value) => !(await db.from('promotor').where('email', value).first())),
    telefone: vine.string().trim().maxLength(255).optional(),
  })
)

export const updatePromotorValidator = vine.compile(
  vine.object({
    nome: vine.string().trim().minLength(2).maxLength(255).optional(),
    telefone: vine.string().trim().maxLength(255).optional(),
    ativo: vine.boolean().optional(),
  })
)

export const pedirOtpValidator = vine.compile(
  vine.object({
    email: vine.string().trim().email(),
  })
)

export const confirmarOtpValidator = vine.compile(
  vine.object({
    email: vine.string().trim().email(),
    codigo: vine.string().trim().fixedLength(6),
  })
)
