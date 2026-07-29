/**
 * Filtro único partilhado por todos os métodos de `relatorios_repository.ts` — cada
 * método só usa o subconjunto de campos que faz sentido para si (mesmo padrão de
 * `MetricasPeriodoDTO`/`MetricasResumoDTO`, alargado aos filtros pedidos: loja/pos,
 * caixa, cliente, vendedor/utilizador, produto, categoria, fornecedor, estado e método
 * de pagamento). `company_alias` é sempre preenchido pelo controller a partir da rota,
 * nunca vem do cliente.
 */
export interface RelatoriosFilterDTO {
  company_alias: string

  data_inicio?: Date
  data_fim?: Date

  pos_id?: string
  caixa_id?: string
  cliente_id?: string
  /** Vendedor/utilizador — quem tinha a caixa aberta na venda. */
  user_id?: string
  produto_id?: string
  produto_categoria_id?: string
  fornecedor_id?: string
  marca_id?: string
  /** Estado da venda ('aberta'|'fechada'|'cancelada'|'reembolsada'). */
  status?: string
  metodo_pagamento_id?: string

  /** Granularidade da evolução de vendas. */
  granularidade?: 'dia' | 'semana' | 'mes' | 'ano'
  /** Nº de linhas nos relatórios "top N" (omissão: 10). */
  limit?: number
  page?: number

  /** Tipo de comparação nos relatórios comparativos. */
  tipo_comparativo?: 'hoje_ontem' | 'mes_atual_anterior' | 'ano_atual_anterior'
}
