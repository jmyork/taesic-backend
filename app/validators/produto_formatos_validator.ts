import vine from '@vinejs/vine'
// import ValidatorConstraint from '../helpers/Validator.js'
// const uniqueValidator = new ValidatorConstraint({ table: 'produto_formatos', column: 'nome' })

// export const createproduto_formatosValidator = vine.compile(
//   vine.object({
//     nome: vine.string().trim().escape().unique(uniqueValidator.createRule()),
//     descricao: vine.string().trim().escape(),
//   })
// )
// export const updateproduto_formatosValidator = vine.compile(
//   vine.object({
//     nome: vine.string().trim().escape().unique(uniqueValidator.updateRule()).optional(),
//     descricao: vine.string().trim().escape().optional(),
//   })
// )

export const createproduto_formatosValidator = vine.compile(
  vine.object({
    nome: vine
      .string()
      .trim()
      .trim()
      .escape()
      .unique(async (db, value, field) => {
        return !(await db
          .from('produto_formatos')
          .join('empresa', 'empresa.id', 'produto_formatos.empresa_id')
          .where('empresa.company_alias', field.data.params.company_alias)
          .where('produto_formatos.nome', value)
          .first())
      }),
    descricao: vine.string().trim().escape().optional(),
  })
)

export const updateproduto_formatosValidator = vine.compile(
  vine.object({
    nome: vine
      .string()
      .trim()
      .escape()
      .unique(async (db, value, field) => {
        return !(await db
          .from('produto_formatos')
          .join('empresa', 'empresa.id', 'produto_formatos.empresa_id')
          .where('empresa.company_alias', field.data.params.company_alias)
          .where('produto_formatos.nome', value)
          .whereNot('produto_formatos.id', field.meta.id)
          .whereNull('produto_formatos.deleted_at')
          .first())
      })
      .optional(),
    descricao: vine.string().trim().trim().escape().optional(),
  })
)

export const ProdutoFormatoQueryValidator = vine.compile(
  vine.object({
    deleted: vine.enum(['deleted', 'all']).optional(),
    createdDtStart: vine.date({ formats: ['iso8601'] }).optional(),
    createdDtEnd: vine.date({ formats: ['iso8601'] }).optional(),
    updatedDtStart: vine.date({ formats: ['iso8601'] }).optional(),
    updatedDtEnd: vine.date({ formats: ['iso8601'] }).optional(),
    nome: vine.string().trim().escape().optional(),
    descricao: vine.string().trim().escape().optional(),
    empresa_id: vine.string().trim().uuid().optional(),
    page: vine.number().positive().optional(),
    limit: vine.number().positive().optional(),
  })
)
