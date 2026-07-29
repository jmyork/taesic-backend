/**
 * Filtro partilhado pelos relatórios de plataforma (`relatorios_plataforma_repository.ts`)
 * — deliberadamente SEM `company_alias`: são os únicos relatórios cross-tenant deste
 * módulo (mesma excepção documentada em `catalogo_publico_repository.ts`), pensados para
 * o proprietário da plataforma (`Platform_Admin`), não para uma empresa-tenant.
 */
export interface RelatoriosPlataformaFilterDTO {
  data_inicio?: Date
  data_fim?: Date

  /** Estado da cobrança (ex.: 'pendente', 'vencida', 'paga') — usado em contasReceber(). */
  status?: string
  /** Evento de segurança (ex.: 'permission_denied', 'login_failed') — usado em auditoria(). */
  event?: string

  page?: number
  limit?: number
}
