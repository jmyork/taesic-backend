import vine from '@vinejs/vine'

export const VendasQueryValidator = vine.compile(
  vine.object({
    deleted: vine.enum(['deleted', 'all']).optional(),

    createdDtStart: vine.date({ formats: ['iso8601'] }).optional(),
    createdDtEnd: vine.date({ formats: ['iso8601'] }).optional(),
    updatedDtStart: vine.date({ formats: ['iso8601'] }).optional(),
    updatedDtEnd: vine.date({ formats: ['iso8601'] }).optional(),

    venda_tipo: vine.enum(['presencial', 'online', 'online_loja']).optional(),
    fechado: vine.boolean().optional(),
    caixa_id: vine.string().uuid().trim().escape().optional(),
    user_id: vine.string().uuid().trim().escape().optional(),
    cliente_online_id: vine.string().uuid().trim().escape().optional(),
    cliente_presencial_id: vine.string().uuid().trim().escape().optional(),

    data_venda: vine.date({ formats: ['iso8601'] }).optional(),
    data_venda_start: vine.date({ formats: ['iso8601'] }).optional(),
    data_venda_end: vine.date({ formats: ['iso8601'] }).afterField('data_venda_start').optional(),

    total: vine.number().min(0).optional(),
    total_start: vine.number().min(0).optional(),
    total_end: vine.number().min(0).optional(),

    empresa_id: vine.string().uuid().trim().escape().optional(),
    company_alias: vine.string().trim().escape().optional(),

    page: vine.number().positive().optional(),
    limit: vine.number().positive().withoutDecimals().max(100).optional()
  })
)

export const CreateVendaValidator = vine.compile(
  vine.object({
    venda_tipo: vine.enum(['presencial', 'online', 'online_loja']).optional(),
    cliente_presencial_id: vine.string().uuid().escape().optional(),
    cliente_online_id: vine.string().uuid().escape().optional(),
    caixa_id: vine.string().uuid().escape().optional(),
    data_venda: vine.date({ formats: ['iso8601'] }).beforeOrEqual('today').optional(),
    total: vine.number().min(0).optional(),
    fechado: vine.boolean().optional(),
    enabled: vine.boolean().optional()
  })
)

export const CloseVendaValidator = vine.compile(
  vine.object({
    id: vine.string().uuid().exists(async (db, value, field) => {
      const venda = await db.from('vendas')
        .join('caixa', 'caixa.id', 'vendas.caixa_id')
        .join('pos', 'pos.id', 'caixa.pos_id')
        .join('empresa', 'empresa.id', 'pos.empresa_id')
        .where('vendas.id', value)
        .where('empresa.company_alias', field.data.company_alias ?? '')
        .first()
      return !!venda
    }),
    // Código de cupão opcional para aplicar um desconto ao fechar a venda — a existência e
    // validade (empresa, expiração) são verificadas no repositório, não aqui, porque dependem
    // do total já calculado da venda.
    cupom_codigo: vine.string().trim().optional(),
  })
)

export const ShowVendaValidator = vine.compile(
  vine.object({
    id: vine.string().uuid().exists(async (db, value, field) => {
      const venda = await db.from('vendas')
        .join('caixa', 'caixa.id', 'vendas.caixa_id')
        .join('pos', 'pos.id', 'caixa.pos_id')
        .join('empresa', 'empresa.id', 'pos.empresa_id')
        .where('vendas.id', value)
        .where('empresa.company_alias', field.data.company_alias ?? '')
        .first()

      return !!venda
    }),
  }))


export const UpdateVendaValidator = vine.compile(
  vine.object({
    total: vine.number().min(0).optional(),
    fechado: vine.boolean().optional(),
    caixa_id: vine.string().uuid().escape().optional(),
    data_venda: vine.date({ formats: ['iso8601'] }).optional(),
    cliente_presencial_id: vine.string().uuid().escape().optional(),
    cliente_online_id: vine.string().uuid().escape().optional(),
    enabled: vine.boolean().optional()
  })
)