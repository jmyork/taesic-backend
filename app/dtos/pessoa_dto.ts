export interface CreatepessoaDTO {
  user_id?: string
  tipo: string
  ativo?: boolean
  pais?: string
  cidade?: string
  endereco?: string
  genero?: string
  data_nascimento?: Date
  nif?: string
  telefone?: string
  email?: string
  nome: string
}
export interface UpdatepessoaDTO {
  user_id?: string
  tipo?: string
  ativo?: boolean
  pais?: string
  cidade?: string
  endereco?: string
  genero?: string
  data_nascimento?: Date
  nif?: string
  telefone?: string
  email?: string
  nome?: string
}
