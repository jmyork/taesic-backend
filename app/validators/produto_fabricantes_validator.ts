import vine from '@vinejs/vine'
import { commonQueryFields } from './common_query_fields.js'

export const createproduto_fabricantesValidator = vine.compile(
  vine.object({
    nome: vine
      .string()
      .escape()
      .unique(async (db, value, field) => {
        return !(await db
          .from('produto_fabricantes')
          .join('empresa', 'empresa.id', 'produto_fabricantes.empresa_id')
          .where('empresa.company_alias', field.data.params.company_alias)
          .where('produto_fabricantes.nome', value)
          .first())
      }),
    email: vine
      .string()
      .trim()
      .email()
      .unique(async (db, value, field) => {
        return !(await db
          .from('produto_fabricantes')
          .join('empresa', 'empresa.id', 'produto_fabricantes.empresa_id')
          .where('empresa.company_alias', field.data.params.company_alias)
          .where('produto_fabricantes.email', value)
          .first())
      }),
    telefone: vine
      .string()
      .trim()
      .escape()
      .unique(async (db, value, field) => {
        return !(await db
          .from('produto_fabricantes')
          .join('empresa', 'empresa.id', 'produto_fabricantes.empresa_id')
          .where('empresa.company_alias', field.data.params.company_alias)
          .where('produto_fabricantes.telefone', value)
          .first())
      }),
    endereco: vine.string().trim().escape(),
  })
)
export const updateproduto_fabricantesValidator = vine.compile(
  vine.object({
    nome: vine
      .string()
      .unique(async (db, value, field) => {
        return !(await db
          .from('produto_fabricantes')
          .join('empresa', 'empresa.id', 'produto_fabricantes.empresa_id')
          .where('empresa.company_alias', field.data.params.company_alias)
          .where('produto_fabricantes.nome', value)
          .whereNot('produto_fabricantes.id', field.meta.id)
          .whereNotNull('produto_fabricantes.deleted_at')
          .first())
      })
      .escape()
      .optional(),
    email: vine
      .string()
      .trim()
      .email()
      .unique(async (db, value, field) => {
        return !(await db
          .from('produto_fabricantes')
          .join('empresa', 'empresa.id', 'produto_fabricantes.empresa_id')
          .where('empresa.company_alias', field.data.params.company_alias)
          .where('produto_fabricantes.email', value)
          .whereNot('produto_fabricantes.id', field.meta.id)
          .whereNotNull('produto_fabricantes.deleted_at')
          .first())
      })
      .optional(),
    telefone: vine
      .string()
      .trim()
      .escape()
      .unique(async (db, value, field) => {
        return !(await db
          .from('produto_fabricantes')
          .join('empresa', 'empresa.id', 'produto_fabricantes.empresa_id')
          .where('empresa.company_alias', field.data.params.company_alias)
          .where('produto_fabricantes.telefone', value)
          .whereNot('produto_fabricantes.id', field.meta.id)
          .whereNotNull('produto_fabricantes.deleted_at')
          .first())
      })
      .optional(),
    endereco: vine.string().trim().escape().optional(),
  })
)

export const ProdutoFabricanteQueryValidator = vine.compile(
  vine.object({
    ...commonQueryFields,
    nome: vine.string().trim().escape().optional(),
    endereco: vine.string().trim().escape().optional(),
    email: vine.string().trim().email().optional(),
    telefone: vine.string().trim().escape().optional(),
  })
)
