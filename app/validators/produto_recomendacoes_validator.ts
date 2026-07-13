import vine from '@vinejs/vine'
import ValidatorConstraint from '../helpers/Validator.js'
export const createproduto_recomendacoesValidator = vine.compile(
  vine.object({
    produto_id: vine
      .string()
      .escape()
      .exists(new ValidatorConstraint({ table: 'produtos', column: 'id' }).existsRule()),
    recomendacao: vine.string().trim().escape(),
  })
)
export const updateproduto_recomendacoesValidator = vine.compile(
  vine.object({
    produto_id: vine
      .string()
      .escape()
      .exists(new ValidatorConstraint({ table: 'produtos', column: 'id' }).existsRule())
      .optional(),
    recomendacao: vine.string().trim().escape().optional(),
  })
)

export const ProdutoRecomendacaoQueryValidator = vine.compile(
  vine.object({
    deleted: vine.enum(['deleted', 'all']).optional(),
    createdDtStart: vine.date({ formats: ['iso8601'] }).optional(),
    createdDtEnd: vine.date({ formats: ['iso8601'] }).optional(),
    updatedDtStart: vine.date({ formats: ['iso8601'] }).optional(),
    updatedDtEnd: vine.date({ formats: ['iso8601'] }).optional(),
    produto_id: vine.string().trim().escape().uuid().optional(),
    recomendacao: vine.string().trim().escape().optional(),
    page: vine.number().positive().optional(),
    limit: vine.number().positive().optional(),
  })
)
