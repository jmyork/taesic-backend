import vine from '@vinejs/vine'

export const ProdutoRecomendacoesCreateValidator = vine.compile(
  vine.object({
        produto_id:vine.number().exists(async (db,value)=>{return await db.from('produtos').where('id',value).first()}).optional(),
		recomendacao:vine.string().escape().trim()
  })
)

export const ProdutoRecomendacoesUpdateValidator =  vine.compile(
  vine.object({
        produto_id:vine.number().exists(async (db,value)=>{return await db.from('produtos').where('id',value).first()}).optional(),
		recomendacao:vine.string().escape().trim().optional()
  })
)
