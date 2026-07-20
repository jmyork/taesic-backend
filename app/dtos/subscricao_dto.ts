export interface CreatesubscricaoDTO {
  cancelada_em?: Date
  renova?: boolean
  data_fim?: Date
  data_inicio: Date
  status: string
  plano_id: string
  cliente_id: string
}
export interface UpdatesubscricaoDTO {
  cancelada_em?: Date
  renova?: boolean
  data_fim?: Date
  data_inicio?: Date
  status?: string
  plano_id?: string
  cliente_id?: string
}
