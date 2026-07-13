import vine from '@vinejs/vine'

/**
 * Validador para criar token de verificação
 * Requer pelo menos user_id OU empresa_id
 */
export const createVerificationTokenValidator = vine.compile(
  vine.object({
    user_id: vine.string().trim().uuid().optional(),
    empresa_id: vine.string().trim().uuid().optional(),
  })
)

/**
 * Validador para verificar um token
 * Requer o token público
 */
export const verifyTokenValidator = vine.compile(
  vine.object({
    token: vine.string().trim().trim(),
  })
)
