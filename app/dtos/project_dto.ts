export interface CreateprojectDTO {
  user_id: string
  descricao: string
  nome: string
}
export interface UpdateprojectDTO {
  user_id?: string
  descricao?: string
  nome?: string
}
