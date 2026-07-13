import vine from '@vinejs/vine'

export const MetricasPeriodoValidator = vine.compile(
  vine.object({
    data_inicio: vine.date({ formats: ['iso8601'] }).optional(),
    data_fim: vine.date({ formats: ['iso8601'] }).optional(),
  })
)
