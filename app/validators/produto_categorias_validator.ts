import vine from '@vinejs/vine'
// import { randomUUID } from 'crypto'

export const createproduto_categoriasValidator = vine.compile(
  vine.object({
    nome: vine
      .string()
      .escape()
      .unique(async (db, value, field) => {
        return !(await db
          .from('produto_categorias')
          .join('empresa', 'empresa.id', 'produto_categorias.empresa_id')
          .where('empresa.company_alias', field.data.params.company_alias)
          .where('produto_categorias.nome', value)
          .first())
      }),
    descricao: vine.string().trim().escape(),
  })
)
export const updateproduto_categoriasValidator = vine.compile(
  vine.object({
    nome: vine
      .string()
      .escape()
      .unique(async (db, value, field) => {
        return !(await db
          .from('produto_categorias')
          .join('empresa', 'empresa.id', 'produto_categorias.empresa_id')
          .where('empresa.company_alias', field.data.params.company_alias)
          .where('produto_categorias.nome', value)
          .whereNot('produto_categorias.id', field.meta.id)
          .whereNull('produto_categorias.deleted_at')
          .first())
      })
      .optional(),
    descricao: vine.string().trim().escape().optional(),
  })
)

export const ProdutoCategoriaQueryValidator = vine.compile(
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
