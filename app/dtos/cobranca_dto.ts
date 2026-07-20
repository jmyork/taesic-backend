export interface CreatecobrancaDTO {
  referencia?: string
  pago?: boolean
  data_vencimento?: Date
  data_emissao: Date
  status: string
  moeda: string
  valor: number
  subscricao_id: string
}
export interface UpdatecobrancaDTO {
  referencia?: string
  pago?: boolean
  data_vencimento?: Date
  data_emissao?: Date
  status?: string
  moeda?: string
  valor?: number
  subscricao_id?: string
}
