import vine from '@vinejs/vine'

// `venda_id`/`metodo_pagamento_id` têm de pertencer ao mesmo tenant (company_alias da rota) —
// sem isto, um vendapagamento podia referenciar uma venda ou um método de pagamento de outra
// empresa, bastando adivinhar/conhecer o UUID (falha de isolamento multi-tenant). Nota: `.first()`
// devolve `null` (não `undefined`) quando não há linha — `exists !== undefined` seria sempre
// verdadeiro e a verificação nunca rejeitaria nada; usa-se `!!exists`.
export const createvendapagamentoValidator=vine.compile(vine.object({venda_id: vine.string().trim().escape().exists(async (db,value,field)=>{
      const exists = await db.from('vendas')
        .join('caixa', 'caixa.id', 'vendas.caixa_id')
        .join('pos', 'pos.id', 'caixa.pos_id')
        .join('empresa', 'empresa.id', 'pos.empresa_id')
        .where('empresa.company_alias', field.data.params?.company_alias ?? '')
        .where('vendas.id', value)
        .first();
      return !!exists;
    }),
    metodo_pagamento_id: vine.string().trim().escape().exists(async (db,value,field)=>{
      const exists = await db.from('metodopagamento')
        .join('empresa', 'empresa.id', 'metodopagamento.empresa_id')
        .where('empresa.company_alias', field.data.params?.company_alias ?? '')
        .where('metodopagamento.id', value)
        .whereNull('metodopagamento.deleted_at')
        .first();
      return !!exists;
    }),
    valor: vine.number().decimal([0, 12]),
    // Referência do comprovativo — ver a migration alter_vendapagamento_add_referencia.
    referencia: vine.string().trim().escape().maxLength(120).optional(),}))
export const updatevendapagamentoValidator=vine.compile(vine.object({venda_id: vine.string().trim().escape().exists(async (db,value,field)=>{
      const exists = await db.from('vendas')
        .join('caixa', 'caixa.id', 'vendas.caixa_id')
        .join('pos', 'pos.id', 'caixa.pos_id')
        .join('empresa', 'empresa.id', 'pos.empresa_id')
        .where('empresa.company_alias', field.data.params?.company_alias ?? '')
        .where('vendas.id', value)
        .first();
      return !!exists;
    }).optional(),
    metodo_pagamento_id: vine.string().trim().escape().exists(async (db,value,field)=>{
      const exists = await db.from('metodopagamento')
        .join('empresa', 'empresa.id', 'metodopagamento.empresa_id')
        .where('empresa.company_alias', field.data.params?.company_alias ?? '')
        .where('metodopagamento.id', value)
        .whereNull('metodopagamento.deleted_at')
        .first();
      return !!exists;
    }).optional(),
    valor: vine.number().decimal([0, 12]).optional(),}))
