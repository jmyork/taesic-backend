import vine from '@vinejs/vine'

export const createtaxaivaValidator = vine.compile(
  vine.object({
    nome: vine.string().trim().escape(),
    percentual: vine.number().decimal([0, 2]).range([0, 100]),
    ativo: vine.boolean().optional(),
  })
)
export const updatetaxaivaValidator = vine.compile(
  vine.object({
    nome: vine.string().trim().escape().optional(),
    percentual: vine.number().decimal([0, 2]).range([0, 100]).optional(),
    ativo: vine.boolean().optional(),
  })
)
