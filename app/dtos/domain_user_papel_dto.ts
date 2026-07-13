export interface DomainUserPapelQueryDTO {
  company_alias: string
  page?: number
  limit?: number
}

export interface CreateDomainUserPapelDTO {
  company_alias: string
  user_id: string
  papel_id: string
}

export interface DestroyDomainUserPapelDTO {
  company_alias: string
  id: string
}

export interface AssignableRolesQueryDTO {
  company_alias: string
}
