import vine from '@vinejs/vine'

export const createProdutoFabricanteValidator = vine.compile(
  vine.object({
    nome: vine.string().trim().minLength(2).maxLength(100),
    email: vine.string().trim().email().maxLength(100),
    telefone: vine.string().trim().mobile().maxLength(20),
    endereco: vine.string().trim().maxLength(200),
  })
)

export const updateProdutoFabricanteValidator = vine.compile(
  vine.object({
    nome: vine.string().trim().minLength(2).maxLength(100).optional(),
    email: vine.string().trim().email().maxLength(100).optional(),
    telefone: vine.string().trim().mobile().maxLength(20).optional(),
    endereco: vine.string().trim().maxLength(200).optional(),
  })
)