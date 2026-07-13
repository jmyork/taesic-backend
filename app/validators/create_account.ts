import vine from '@vinejs/vine'

export const CreateAccountValidator = vine.compile(
  vine.object({
    user: vine.object({
      email: vine.string().trim().email(),
      username: vine.string().trim(),
      pwd: vine.string().trim(),
    }),
    empresa: vine.object({
      nome: vine.string().trim(),
      regime_iva: vine.boolean(),
      nif: vine.string().trim(),
      localizacao: vine.string().trim(),
      contacto: vine.string().trim(),
      company_alias: vine
        .string()
        .trim()
        .regex(/^(?!.*--)[a-z]+(?:-[a-z]+)*$/),
    }),
  })
)
