import vine from '@vinejs/vine'

export const ProdutosCreateValidator = vine.compile(
  vine.object({
    nome: vine
      .string()
      .escape()
      .trim()
      .maxLength(255)
      .unique(async (db, value) => {
        const produto = await db.from('produtos').where('nome', value).first()
        return !produto
      }),
    descricao: vine.string().escape().trim().maxLength(1000).optional(),
    fabricante_id: vine
      .number()
      .exists(async (db, value) => {
        const fabricante = await db
          .from('produto_fabricantes')
          .where('id', value)
          .first()
        return !!fabricante
      })
      .exists(async (db, value, __) => {
        // Verifica se o fabricante existe
        const fabricante = await db.from('produto_fabricantes').where('id', value).first()
        return !!fabricante
      }),
    formato_id: vine
      .number()
      .exists(async (db, value) => {
        const formato = await db
          .from('produto_formatos')
          .where('id', value)
          .first()
        return !!formato
      })
      .exists(async (db, value, __) => {
        // Verifica se o formato existe
        const formato = await db.from('produto_formatos').where('id', value).first()
        return !!formato
      }),
  })
)

export const ProdutosUpdateValidator = vine.compile(
  vine.object({
    nome: vine
      .string()
      .escape()
      .trim()
      .maxLength(255)
      .unique(async (db, value, field) => {
        if (!value) return true // Se for vazio, não verifica
        const produto = await db
          .from('produtos')
          .where('nome', value)
          .whereNot('id', field.meta._id)
          .first()
        return !produto
      })
      .optional(),
    descricao: vine.string().escape().trim().maxLength(1000).optional(),
    fabricante_id: vine
      .number()
      .exists(async (db, value) => {
        const fabricante = await db
          .from('produto_fabricantes')
          .where('id', value)
          .first()
        return !!fabricante
      })
      .optional(),
    formato_id: vine
      .number()
      .exists(async (db, value) => {
        const formato = await db
          .from('produto_formatos')
          .where('id', value)
          .first()
        return !!formato
      })
      .optional(),
  })
)