export type DeletedValue = 'deleted' | 'all' | null | undefined
export interface UniqueValidatorOptions {
  table: string
  column: string
  idColumn?: string
  softDeleteColumn?: string
  tenantColumn?: string
  uniques?: string[]
}
