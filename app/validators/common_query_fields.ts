import vine from '@vinejs/vine'

/**
 * Fragmentos de VineJS partilhados por quase todos os `*QueryValidator` deste projecto —
 * antes cada um repetia estes mesmos campos, campo a campo (ver `caixa_validator.ts`,
 * `estoque_validator.ts`, `userpos_validator.ts`, etc.). Espalhar (`...`) o que for preciso
 * dentro de `vine.object({...campo_especifico})`.
 */

/** Paginação + filtro de soft-delete. */
export const paginationFields = {
  page: vine.number().positive().optional(),
  limit: vine.number().positive().optional(),
  deleted: vine.enum(['deleted', 'all'] as const).optional(),
}

/** Intervalo de datas de auditoria (created_at/updated_at). */
export const auditDateRangeFields = {
  createdDtStart: vine.date({ formats: ['iso8601'] }).optional(),
  createdDtEnd: vine.date({ formats: ['iso8601'] }).optional(),
  updatedDtStart: vine.date({ formats: ['iso8601'] }).optional(),
  updatedDtEnd: vine.date({ formats: ['iso8601'] }).optional(),
}

/** Isolamento por tenant — recursos por-empresa aceitam um dos dois (nunca inventar um terceiro nome). */
export const tenantFilterFields = {
  empresa_id: vine.string().trim().uuid().optional(),
  company_alias: vine.string().trim().escape().optional(),
}

/** Combinação das três acima — o conjunto que aparece na maioria dos `*QueryValidator`. */
export const commonQueryFields = {
  ...paginationFields,
  ...auditDateRangeFields,
  ...tenantFilterFields,
}
