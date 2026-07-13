export interface CreatecupomDTO {
  promotor_id: string
  codigo?: string
  desconto: number
  validade?: Date | null
  company_alias?: string
}

export interface UpdatecupomDTO {
  desconto?: number
  validade?: Date | null
}

export interface CupomQueryDTO {
  deleted?: 'deleted' | 'all'
  company_alias?: string
  promotor_id?: string
}
