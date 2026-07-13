import vine from '@vinejs/vine'
export const createpermissaoValidator = vine.compile(
  vine.object({ nome: vine.string().trim(), descricao: vine.string().trim() })
)
export const updatepermissaoValidator = vine.compile(
  vine.object({ nome: vine.string().trim().optional(), descricao: vine.string().trim().optional() })
)
