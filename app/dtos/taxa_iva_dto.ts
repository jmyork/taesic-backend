export interface CreatetaxaivaDTO {
  nome: string
  percentual: number
  ativo?: boolean
}
export interface UpdatetaxaivaDTO {
  nome?: string
  percentual?: number
  ativo?: boolean
}
