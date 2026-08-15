export interface CreatevendapagamentoDTO{
  valor: number,
  /** Referência do comprovativo (transferência, TPA). Opcional. */
  referencia?: string,
  metodo_pagamento_id: string,
  venda_id: string,}
export interface UpdatevendapagamentoDTO{
  valor?: number,
  referencia?: string,
  metodo_pagamento_id?: string,
  venda_id?: string,}