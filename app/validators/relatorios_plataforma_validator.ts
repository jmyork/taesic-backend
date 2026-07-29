import vine from '@vinejs/vine'

export const RelatoriosPlataformaFiltroValidator = vine.compile(
  vine.object({
    data_inicio: vine.date({ formats: ['iso8601'] }).optional(),
    data_fim: vine.date({ formats: ['iso8601'] }).optional(),
    status: vine.string().trim().escape().optional(),
    event: vine.string().trim().escape().optional(),
    page: vine.number().positive().optional(),
    limit: vine.number().positive().optional(),
  })
)
