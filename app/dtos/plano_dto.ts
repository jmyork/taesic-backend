export interface CreateplanoDTO {
  limite_uso?: number
  ativo: boolean
  periodo: string
  moeda: string
  preco: number
  descricao?: string
  nome: string
}
export interface UpdateplanoDTO {
  limite_uso?: number
  ativo?: boolean
  periodo?: string
  moeda?: string
  preco?: number
  descricao?: string
  nome?: string
}
