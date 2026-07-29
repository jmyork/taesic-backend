import vine from '@vinejs/vine'

/**
 * Filtros de query string partilhados por todas as rotas de `relatorios_controller.ts` —
 * cada acção só usa o subconjunto que faz sentido (mesmo padrão de `MetricasPeriodoValidator`,
 * alargado aos filtros pedidos). `company_alias` nunca vem daqui — é sempre resolvido a
 * partir do parâmetro da rota, como em todos os outros `*QueryValidator` deste projecto.
 */
export const RelatoriosFiltroValidator = vine.compile(
  vine.object({
    data_inicio: vine.date({ formats: ['iso8601'] }).optional(),
    data_fim: vine.date({ formats: ['iso8601'] }).optional(),

    pos_id: vine.string().trim().uuid().optional(),
    caixa_id: vine.string().trim().uuid().optional(),
    cliente_id: vine.string().trim().uuid().optional(),
    user_id: vine.string().trim().uuid().optional(),
    produto_id: vine.string().trim().uuid().optional(),
    produto_categoria_id: vine.string().trim().uuid().optional(),
    fornecedor_id: vine.string().trim().uuid().optional(),
    marca_id: vine.string().trim().uuid().optional(),
    status: vine.string().trim().escape().optional(),
    metodo_pagamento_id: vine.string().trim().uuid().optional(),

    granularidade: vine.enum(['dia', 'semana', 'mes', 'ano'] as const).optional(),
    limit: vine.number().positive().optional(),
    page: vine.number().positive().optional(),

    tipo_comparativo: vine.enum(['hoje_ontem', 'mes_atual_anterior', 'ano_atual_anterior'] as const).optional(),
  })
)
