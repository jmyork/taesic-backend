export interface CreateprojectDTO {
  enabled?: boolean
  user_id: string
  descricao: string
  nome: string
}
export interface UpdateprojectDTO {
  enabled?: boolean
  user_id?: string
  descricao?: string
  nome?: string
}
