import vine from '@vinejs/vine'
import { randomUUID } from 'crypto'

export const createproduto_mediaValidator = vine.compile(
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
        return !!exists
      }),
    // .minLength(2) impedia o envio de uma única imagem — o pedido era explicitamente
    // "uma ou mais imagens de uma vez". O limite de 30 por produto é aplicado no
    // repository (soma o que já está registado com o que vem neste pedido).
    media: vine.array(
      vine.file({ size: '25mb', extnames: ['jpg', 'jpeg', 'png', 'gif', 'mkv', 'mp4', 'webm'] })
    ).minLength(1).maxLength(10),
  })
)
export const updateproduto_mediaValidator = vine.compile(
  vine.object({
    produto_id: vine
      .string()
      .escape()
      .exists(async (db, value, __) => {
        const exists = await db.from('produtos').where('id', value).first()
        return exists !== undefined
      })
      .optional(),
    imagem_url: vine
      .file({ size: '25mb', extnames: ['jpg', 'jpeg', 'png', 'gif'] })
      .transform((file) => {
        const fileName = `${randomUUID()}.${file.extname}`
        file.move('uploads', { name: fileName, overwrite: true })
        return fileName
      })
      .optional(),
  })
)

export const ProdutoImagemQueryValidator = vine.compile(
  vine.object({
    deleted: vine.enum(['deleted', 'all']).optional(),
    createdDtStart: vine.date({ formats: ['iso8601'] }).optional(),
    createdDtEnd: vine.date({ formats: ['iso8601'] }).optional(),
    updatedDtStart: vine.date({ formats: ['iso8601'] }).optional(),
    updatedDtEnd: vine.date({ formats: ['iso8601'] }).optional(),
    empresa_id: vine.string().trim().uuid().optional(),
    produto_id: vine.string().trim().uuid().optional(),
    page: vine.number().positive().optional(),
    limit: vine.number().positive().optional(),
  })
)
