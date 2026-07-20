import vine from '@vinejs/vine'
import { commonQueryFields } from './common_query_fields.js'
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
    ...commonQueryFields,
    nome: vine.string().trim().escape().optional(),
    descricao: vine.string().trim().escape().optional(),
  })
)
