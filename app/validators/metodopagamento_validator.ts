import vine from '@vinejs/vine'
import { commonQueryFields } from './common_query_fields.js'

export const createmetodopagamentoValidator = vine.create(
  vine.object({
    nome: vine.string().trim().escape().unique(async (db, value, field) => {
      const companyAlias = field.data.params?.company_alias
      if (!companyAlias) return false

      const exists = await db
        .from('metodopagamento')
        .join('empresa', 'empresa.id', 'metodopagamento.empresa_id')
        .where('empresa.company_alias', companyAlias)
        .where('metodopagamento.nome', value)
        .whereNull('metodopagamento.deleted_at')
        .first()
      return !exists
    }),
    descricao: vine.string().trim().escape(),
  })
)

export const updatemetodopagamentoValidator = vine.compile(
  vine.object({
    nome: vine.string().trim().escape().unique(async (db, value, field) => {
      const companyAlias = field.data.params?.company_alias
      if (!companyAlias) return false

      const exists = await db
        .from('metodopagamento')
        .join('empresa', 'empresa.id', 'metodopagamento.empresa_id')
        .where('empresa.company_alias', companyAlias)
        .where('metodopagamento.nome', value)
        .whereNot('metodopagamento.id', field.meta.id)
        .whereNull('metodopagamento.deleted_at')
        .first()
      return !exists
    }).optional(),
    descricao: vine.string().trim().escape().optional(),
  })
)


export const MetodoPagamentoQueryValidator = vine.compile(
  vine.object({
    ...commonQueryFields,

    nome: vine.string().trim().escape().optional(),
    descricao: vine.string().trim().escape().optional(),
  })
)
