import vine from '@vinejs/vine'

export const EmitirFacturaValidator = vine.compile(
  vine.object({
    venda_id: vine.string().trim().uuid(),
    tipo: vine.enum(['Factura', 'Factura-Recibo', 'Nota de Crédito', 'Nota de Débito'] as const),
    observacoes: vine.string().trim().optional(),
  })
)

export const FacturaQueryValidator = vine.compile(
  vine.object({
    page: vine.number().optional(),
    limit: vine.number().optional(),
    venda_id: vine.string().trim().uuid().optional(),
    deleted: vine.enum(['deleted', 'all']).optional(),
  })
)
