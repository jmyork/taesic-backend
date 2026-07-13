import { UniqueValidatorOptions } from './Types.js'
// import Logger from '@adonisjs/core/services/logger'

export default class ValidatorConstraint {
  private table: string
  private column: string
  private idColumn: string
  private softDeleteColumn?: string
  private tenantColumn?: string
  private uniques?: string[]
  // private logger: typeof Logger

  constructor(options: UniqueValidatorOptions) {
    this.table = options.table
    this.column = options.column
    this.idColumn = options.idColumn ?? 'id'
    this.softDeleteColumn = options.softDeleteColumn ?? 'deleted_at'
    this.tenantColumn = options.tenantColumn
    this.uniques = options.uniques ?? []
    // this.logger = logger || Logger // Default logger
  }

  // ========================
  // PRIVATE: Build query com filtros comuns
  // ========================
  /**
   * Constrói query com soft delete e multi-tenancy
   * Evita repetição de código
   */
  private buildBaseQuery(db: any, field: any) {
    let tenantId = undefined

    if (this.tenantColumn) {
      // ✅ Tentar field.meta primeiro, depois field.data
      tenantId = field.meta?.[this.tenantColumn] ?? field.data?.[this.tenantColumn]
    }

    const query = db.from(this.table)

    if (this.softDeleteColumn) {
      query.whereNull(this.softDeleteColumn)
    }

    if (this.tenantColumn && tenantId) {
      query.where(this.tenantColumn, tenantId)
    }

    return { query, tenantId }
  }

  /**
   * Adiciona filtro de exclusão por ID
   */
  private excludeCurrentId(query: any, id: any) {
    if (id) {
      query.whereNot(this.idColumn, id)
    }
  }

  // ========================
  // CREATE
  // ========================
  async validateCreate(db: any, value: any, field: any) {
    const { query } = this.buildBaseQuery(db, field)
    query.where(this.column, value)

    const row = await query.first()
    return !row
  }

  // ========================
  // UPDATE
  // ========================
  async validateUpdate(db: any, value: any, field: any) {
    const id = field.meta?.id

    // 🚫 Bloquear update se o registro foi deletado
    if (id) {
      const existing = await db
        .from(this.table)
        .where(this.idColumn, id)
        .select(this.idColumn, this.softDeleteColumn)
        .first()

      if (!existing) return false

      // Se foi soft deletado, não permite update
      if (this.softDeleteColumn && existing[this.softDeleteColumn]) {
        return false
      }
    }

    const { query } = this.buildBaseQuery(db, field)
    query.where(this.column, value)

    // Excluir o registro atual da busca de duplicatas
    this.excludeCurrentId(query, id)

    const row = await query.select(this.idColumn).first()
    return !row
  }

  // ========================
  // EXISTS
  // ========================
  /**
   * ✅ CORRIGIDO: Usa this.idColumn ao invés de 'id' hardcoded
   */
  async validateExists(db: any, value: any, field: any) {
    const { query } = this.buildBaseQuery(db, field)

    // ✅ CORRIGIDO: Agora usa this.idColumn
    query.where(this.idColumn, value)

    const row = await query.select(this.idColumn).first()
    return !!row
  }

  // ========================
  // UNIQUE MULTIPLE
  // ========================
  /**
   * Valida múltiplas colunas únicas em conjunto
   * Exemplo: (sku, tamanho) deve ser único
   */
  private async validateUniqueMultiple(db: any, __: any, field: any) {
    const { query } = this.buildBaseQuery(db, field)
    const id = field.meta?.id

    // Construir condições WHERE para cada coluna
    if (this.uniques && this.uniques.length > 0) {
      this.uniques.forEach((col) => {
        query.where(col, field.data[col])
      })
    }

    // Excluir registro atual (para UPDATE)
    this.excludeCurrentId(query, id)

    const row = await query.select(this.idColumn).first()
    return !row
  }

  // private async validateUnicityThorughRelationShip()

  // ========================
  // VINE RULES
  // ========================

  /**
   * Regra para CREATE com coluna única
   * @example
   * .unique({ table: 'users', column: 'email', idColumn: 'id' })
   */
  createRule() {
    return this.validateCreate.bind(this)
  }

  /**
   * Regra para UPDATE com coluna única
   * Bloqueia update se registro foi soft deletado
   * @example
   * .unique({ table: 'users', column: 'email', idColumn: 'id' })
   */
  updateRule() {
    return this.validateUpdate.bind(this)
  }

  /**
   * Regra para validar existência de registro
   * Exemplo: validar que um foreign key existe
   * @example
   * .exists({ table: 'marcas', column: 'id' })
   */
  existsRule() {
    return this.validateExists.bind(this)
  }

  /**
   * ✅ REFATORADO: Método único para unicidade múltipla
   * Funciona tanto para CREATE quanto UPDATE
   * @example
   * .unique({
   *   table: 'sku_variants',
   *   column: 'sku',
   *   uniques: ['sku', 'tamanho', 'cor']
   * })
   */
  uniqueMultipleRule() {
    return this.validateUniqueMultiple.bind(this)
  }
}
