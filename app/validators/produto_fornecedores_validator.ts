import vine from '@vinejs/vine'

export const createproduto_fornecedoresValidator = vine.compile(
  vine.object({
    nome: vine
      .string()
      .escape()
      .unique(async (db, value, field) => {
        return !(await db
          .from('produto_fornecedores')
          .join('empresa', 'empresa.id', 'produto_fornecedores.empresa_id')
          .where('empresa.company_alias', field.data.params.company_alias)
          .where('produto_fornecedores.nome', value)
          .first())
      }),
    email: vine
      .string()
      .trim()
      .email()
      .unique(async (db, value, field) => {
        return !(await db
          .from('produto_fornecedores')
          .join('empresa', 'empresa.id', 'produto_fornecedores.empresa_id')
          .where('empresa.company_alias', field.data.params.company_alias)
          .where('produto_fornecedores.email', value)
          .first())
      }),
    telefone: vine
      .string()
      .trim()
      .escape()
      .unique(async (db, value, field) => {
        return !(await db
          .from('produto_fornecedores')
          .join('empresa', 'empresa.id', 'produto_fornecedores.empresa_id')
          .where('empresa.company_alias', field.data.params.company_alias)
          .where('produto_fornecedores.telefone', value)
          .first())
      }),
    endereco: vine.string().trim().escape(),
  })
)

export const updateproduto_fornecedoresValidator = vine.compile(
  vine.object({
    nome: vine
      .string()
      .unique(async (db, value, field) => {
        return !(await db
          .from('produto_fornecedores')
          .join('empresa', 'empresa.id', 'produto_fornecedores.empresa_id')
          .where('empresa.company_alias', field.data.params.company_alias)
          .where('produto_fornecedores.nome', value)
          .whereNot('produto_fornecedores.id', field.meta.id)
          // .whereNull("produto_fornecedores.deleted_at")
          .first())
      })
      .escape()
      .optional(),

    email: vine
      .string()
      .trim()
      .email()
      .unique(async (db, value, field) => {
        return !(await db
          .from('produto_fornecedores')
          .join('empresa', 'empresa.id', 'produto_fornecedores.empresa_id')
          .where('empresa.company_alias', field.data.params.company_alias)
          .where('produto_fornecedores.email', value) // ✅ CORRIGIDO
          .whereNot('produto_fornecedores.id', field.meta.id)
          .whereNull('produto_fornecedores.deleted_at')
          .first())
      })
      .optional(),

    telefone: vine
      .string()
      .trim()
      .escape()
      .unique(async (db, value, field) => {
        return !(await db
          .from('produto_fornecedores')
          .join('empresa', 'empresa.id', 'produto_fornecedores.empresa_id')
          .where('empresa.company_alias', field.data.params.company_alias)
          .where('produto_fornecedores.telefone', value) // ✅ CORRIGIDO
          .whereNot('produto_fornecedores.id', field.meta.id)
          .whereNull('produto_fornecedores.deleted_at')
          .first())
      })
      .optional(),

    endereco: vine.string().trim().escape().optional(),
  })
)

export const ProdutoFornecedorQueryValidator = vine.compile(
  vine.object({
    deleted: vine.enum(['deleted', 'all']).optional(),
    createdDtStart: vine.date({ formats: ['iso8601'] }).optional(),
    createdDtEnd: vine.date({ formats: ['iso8601'] }).optional(),
    updatedDtStart: vine.date({ formats: ['iso8601'] }).optional(),
    updatedDtEnd: vine.date({ formats: ['iso8601'] }).optional(),
    empresa_id: vine.string().trim().uuid().optional(),
    nome: vine.string().trim().escape().optional(),
    endereço: vine.string().trim().escape().optional(),
    email: vine.string().trim().email().optional(),
    telefone: vine.string().trim().escape().optional(),
    page: vine.number().positive().optional(),
    limit: vine.number().positive().optional(),
  })
)
