export interface EmitirFacturaDTO {
  company_alias: string
  venda_id: string
  tipo: 'Factura' | 'Factura-Recibo' | 'Nota de Crédito' | 'Nota de Débito'
  observacoes?: string
}

export interface FacturaQueryDTO {
  company_alias: string
  page?: number
  limit?: number
  venda_id?: string
  deleted?: 'deleted' | 'all' | null
}

export interface AnularFacturaDTO {
  id: string
  company_alias: string
}

export interface ShowFacturaDTO {
  id: string
  company_alias: string
}
