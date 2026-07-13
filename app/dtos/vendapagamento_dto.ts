export interface CreatevendapagamentoDTO{
  valor: number,
  metodo_pagamento_id: string,
  venda_id: string,}
export interface UpdatevendapagamentoDTO{
  valor?: number,
  metodo_pagamento_id?: string,
  venda_id?: string,}