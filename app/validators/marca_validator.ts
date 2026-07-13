import vine from '@vinejs/vine'
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
