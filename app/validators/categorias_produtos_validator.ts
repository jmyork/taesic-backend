import vine from '@vinejs/vine'

export const createcategorias_produtosValidator = vine.compile(
  vine.object({
    produto_id: vine
      .string()
      .escape()
      .exists(async (db, value, field) => {
        const exists = await db
          .from('produtos')
          .join('empresa', 'empresa.id', 'produtos.empresa_id')
          .where('empresa.company_alias', field.data.params.company_alias)
          .where('produtos.id', value)
          .first()

        return !!exists
      })
      .unique(async (db, value, field) => {
        return !(await db
          .from('categorias_produtos')
          .leftJoin('produtos', 'produtos.id', 'categorias_produtos.produto_id')
          .leftJoin('empresa', 'empresa.id', 'produtos.empresa_id')
          .where('empresa.company_alias', field.data.params.company_alias)
          .where('categorias_produtos.produto_id', value)
          .where('categorias_produtos.produto_categoria_id', field.data.produto_categoria_id)
          .first())
      }),

    produto_categoria_id: vine
      .string()
      .escape()
      .exists(async (db, value, field) => {
        const exists = await db
          .from('produto_categorias')
          .join('empresa', 'empresa.id', 'produto_categorias.empresa_id')
          .where('empresa.company_alias', field.data.params.company_alias)
          .where('produto_categorias.id', value)
          .first()

        return !!exists
      })
      .unique(async (db, value, field) => {
        return !(await db
          .from('categorias_produtos')
          .leftJoin('produtos', 'produtos.id', 'categorias_produtos.produto_id')
          .leftJoin('empresa', 'empresa.id', 'produtos.empresa_id')
          .where('categorias_produtos.produto_id', field.data.produto_id)
          .where('categorias_produtos.produto_categoria_id', value)
          .first())
      }),
  })
)

// export const updatecategorias_produtosValidator = vine.compile(
//   vine.object({
//     produto_id: vine
//       .string()
//       .escape()
//       .exists(new ValidatorConstraint({
//         table: 'produtos',
//         column: 'id',
//       }).existsRule())
//       .unique(new ValidatorConstraint({
//         table: 'categorias_produtos',
//         column: 'produto_id',
//         tenantColumn: 'produto_categoria_id',
//         idColumn: 'id',
//         softDeleteColumn: 'deleted_at',
//         uniques: ['produto_categoria_id', 'produto_id'],
//       }).updateRule())
//       .optional(),
//     produto_categoria_id: vine
//       .string()
//       .escape()
//       .exists(new ValidatorConstraint({
//         table: 'produto_categorias',
//         column: 'id',
//       }).existsRule())
//       .unique(new ValidatorConstraint({
//         table: 'categorias_produtos',
//         column: 'produto_categoria_id',
//         tenantColumn: 'produto_id',
//         idColumn: 'id',
//         softDeleteColumn: 'deleted_at',
//         uniques: ['produto_categoria_id', 'produto_id'],
//       }).updateRule())
//       .optional(),
//   })
// )

export const CategoriaProdutoQueryValidator = vine.compile(
  vine.object({
    deleted: vine.enum(['deleted', 'all']).optional(),
    createdDtStart: vine.date({ formats: ['iso8601'] }).optional(),
    createdDtEnd: vine.date({ formats: ['iso8601'] }).optional(),
    updatedDtStart: vine.date({ formats: ['iso8601'] }).optional(),
    updatedDtEnd: vine.date({ formats: ['iso8601'] }).optional(),
    produto_id: vine.string().trim().escape().uuid().optional(),
    produto_categoria_id: vine.string().trim().escape().uuid().optional(),
    page: vine.number().positive().optional(),
    limit: vine.number().positive().optional(),
  })
)
