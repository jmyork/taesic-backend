export interface CreatePromotorDTO {
  nome: string
  email: string
  telefone?: string | null
  company_alias?: string
}

export interface UpdatePromotorDTO {
  nome?: string
  telefone?: string | null
  ativo?: boolean
}

export interface PromotorQueryDTO {
  deleted?: 'deleted' | 'all'
  company_alias?: string
  /** Inclui também promotores de plataforma (empresa_id null) na listagem — usado só por
   * quem precisa de os poder ESCOLHER (ex.: o picker de promotor ao criar um cupão), nunca
   * pela página de gestão de promotores em si, cujo Ver/Editar/Eliminar continuam scoped
   * exclusivamente aos promotores desta empresa. */
  incluir_plataforma?: boolean
}
