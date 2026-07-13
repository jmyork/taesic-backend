import vine from '@vinejs/vine'
// import ValidatorConstraint from '../helpers/Validator.js'
export const createproduto_contraindicacoesValidator = vine.compile(
  vine.object({
    produto_id: vine
      .string()
      .escape()
      .exists(async (db, value, field) => {
        const exists = await db
          .from('produtos')
          .leftJoin('empresa', 'empresa.id', 'produtos.empresa_id')
          .where('empresa.company_alias', field.data.params.company_alias)
          .where('produtos.id', value)
          .first()

        return !!exists
      }),
    contraindicacao: vine.string().trim().escape(),
  })
)
export const updateproduto_contraindicacoesValidator = vine.compile(
  vine.object({
    produto_id: vine
      .string()
      .escape()
      .exists(async (db, value, field) => {
        const exists = await db
          .from('produtos')
          .leftJoin('empresa', 'empresa.id', 'produtos.empresa_id')
          .where('empresa.company_alias', field.data.params.company_alias)
          .where('produtos.id', value)
          .first()

        return !!exists
      })
      .optional(),
    contraindicacao: vine.string().trim().escape().optional(),
  })
)

export const ProdutoContraIndicacaoQueryValidator = vine.compile(
  vine.object({
    deleted: vine.enum(['deleted', 'all']).optional(),
    createdDtStart: vine.date({ formats: ['iso8601'] }).optional(),
    createdDtEnd: vine.date({ formats: ['iso8601'] }).optional(),
    updatedDtStart: vine.date({ formats: ['iso8601'] }).optional(),
    updatedDtEnd: vine.date({ formats: ['iso8601'] }).optional(),
    produto_id: vine.string().trim().escape().uuid().optional(),
    contraindicacao: vine.string().trim().escape().optional(),
    page: vine.number().positive().optional(),
    limit: vine.number().positive().optional(),
  })
)
