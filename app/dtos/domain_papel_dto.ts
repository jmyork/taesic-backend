/**
 * Gestão dos papéis DA PRÓPRIA EMPRESA.
 *
 * O recurso `papel` de plataforma (start/routes.ts) continua a existir e serve
 * outra coisa: os modelos e os papéis do dono da plataforma. Este é o que uma
 * empresa usa para gerir os seus — criar "Chefe de Turno", tirar uma permissão ao
 * seu Vendedor — sem tocar em nenhuma outra empresa.
 */

export interface DomainPapelQueryDTO {
  company_alias: string
  page?: number
  limit?: number
  nome?: string
  deleted?: 'all' | 'deleted'
}

export interface ShowDomainPapelDTO {
  company_alias: string
  id: string
}

export interface CreateDomainPapelDTO {
  company_alias: string
  nome: string
  descricao?: string
  /** Nomes de permissões do catálogo global a atribuir logo à criação. */
  permissoes?: string[]
}

export interface UpdateDomainPapelDTO {
  company_alias: string
  id: string
  nome?: string
  descricao?: string
  /**
   * Substitui o conjunto COMPLETO de permissões do papel quando presente.
   * Ausente, as permissões ficam como estão — permite renomear sem mexer no acesso.
   */
  permissoes?: string[]
}

export interface DestroyDomainPapelDTO {
  company_alias: string
  id: string
}
