import vine from '@vinejs/vine'
import { commonQueryFields } from './common_query_fields.js'
// import { randomUUID } from 'crypto'
// import UniqueValidator from '../helpers/Validator.js'
// const uniqueValidator = new UniqueValidator({ table: 'marcas', column: 'nome', tenantColumn: 'empresa_id' })

export const createmarcaValidator = vine.compile(
  vine.object({
    nome: vine
      .string()
      .trim()
      .trim()
      .escape()
      .unique(async (db, value, field) => {
        return !(await db
          .from('marcas')
          .join('empresa', 'empresa.id', 'marcas.empresa_id')
          .where('empresa.company_alias', field.data.params.company_alias)
          .where('marcas.nome', value)
          .first())
      }),
    descricao: vine.string().trim().escape().optional(),
  })
)

export const updatemarcaValidator = vine.compile(
  vine.object({
    nome: vine
      .string()
      .trim()
      .escape()
      .unique(async (db, value, field) => {
        return !(await db
          .from('marcas')
          .join('empresa', 'empresa.id', 'marcas.empresa_id')
          .where('empresa.company_alias', field.data.params.company_alias)
          .where('marcas.nome', value)
          .whereNot('marcas.id', field.meta.id)
          .whereNull('marcas.deleted_at')
          .first())
      })
      .optional(),
    descricao: vine.string().trim().trim().escape().optional(),
  })
)

export const MarcaQueryValidator = vine.compile(
  vine.object({
    ...commonQueryFields,
    nome: vine.string().trim().escape().optional(),
    descricao: vine.string().trim().escape().optional(),
  })
)
