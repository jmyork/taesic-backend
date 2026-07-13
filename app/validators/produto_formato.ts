import vine from '@vinejs/vine'

export const createProdutoFormatoValidator = vine.compile(
  vine.object({
    nome: vine
      .string()
      .trim()
      .minLength(2)
      .maxLength(100)
      .unique(async (db, value) => {
        const formato = await db.from('produto_formatos').where('nome', value).first()
        return !formato
      }),
    descricao: vine.string().trim().minLength(3).maxLength(500),
  })
)

export const updateProdutoFormatoValidator = vine.compile(
  vine.object({
    nome: vine
      .string()
      .trim()
      .minLength(2)
      .maxLength(100)
      .unique(async (db, value, field) => {
        const formato = await db
          .from('produto_formatos')
          .where('nome', value)
          .whereNot('id', field.meta.id)
          .first()
        return !formato
      })
      .optional(),
    descricao: vine.string().trim().minLength(3).maxLength(500).optional(),
  })
)