import vine from '@vinejs/vine'

export const createproduto_descricaoValidator = vine.compile(
  vine.object({
    produto_id: vine
      .string()
      .escape()
      .exists(async (db, value, field) => {
        const exists = await db
          .from('produtos')
          .leftJoin('empresa', 'empresa.id', 'produtos.empresa_id') // ✅ Corrigido
          .where('empresa.company_alias', field.data.params.company_alias)
          .where('produtos.id', value)
          .first()

        return !!exists // ✅ Converter para boolean
      }),

    propriedade: vine
      .string()
      .trim()
      .escape()
      .unique(async (db, value, field) => {
        const exists = await db
          .from('produto_descricao')
          .leftJoin('produtos', 'produtos.id', 'produto_descricao.produto_id')
          .leftJoin('empresa', 'empresa.id', 'produtos.empresa_id')
          .where('empresa.company_alias', field.data.params.company_alias)
          .where('produto_descricao.produto_id', field.data.produto_id)
          .where('produto_descricao.propriedade', value)
          .first()

        return !exists
      }),

    descricao_detalhada: vine.string().trim().escape(),
  })
)

export const updateproduto_descricaoValidator = vine.compile(
  vine.object({
    // produto_id: vine
    //   .string()
    //   .escape()
    //   .exists(async (db, value, field) => {
    //     const exists = await db
    //       .from('produtos')
    //       .leftJoin('empresa', 'empresa.id', 'produtos.empresa_id')
    //       .where('empresa.company_alias', field.data.params.company_alias)
    //       .where('produtos.id', value)
    //       .first()

    //     return !!exists
    //   })
    //   .optional(),

    propriedade: vine
      .string()
      .trim()
      .escape()
      .unique(async (db, value, field) => {
        // const produtoId = field.data.produto_id || field.meta.produto_id
        const recordId = field.meta.id

        const exists = await db
          .from('produto_descricao')
          .leftJoin('produtos', 'produtos.id', 'produto_descricao.produto_id') // ✅ Adicionado
          .leftJoin('empresa', 'empresa.id', 'produtos.empresa_id') // ✅ Adicionado
          .where('empresa.company_alias', field.data.params.company_alias) // ✅ Adicionado
          // .where('produto_descricao.produto_id', produtoId)
          .where('produto_descricao.propriedade', value)
          .whereNot('produto_descricao.id', recordId)
          .first()
        return !exists
      })
      .optional(),

    descricao_detalhada: vine.string().trim().escape().optional(),
  })
)

export const ProdutoDescricaoValidator = vine.compile(
  vine.object({
    deleted: vine.enum(['deleted', 'all']).optional(),
    createdDtStart: vine.date({ formats: ['iso8601'] }).optional(),
    createdDtEnd: vine.date({ formats: ['iso8601'] }).optional(),
    updatedDtStart: vine.date({ formats: ['iso8601'] }).optional(),
    updatedDtEnd: vine.date({ formats: ['iso8601'] }).optional(),
    produto_id: vine.string().trim().escape().uuid().optional(),
    propriedade: vine.string().trim().escape().optional(),
    descricao_detalhada: vine.string().trim().escape().optional(),
    page: vine.number().positive().optional(),
    limit: vine.number().positive().optional(),
  })
)
