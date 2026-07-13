import vine from '@vinejs/vine'

export const ProdutoImagensCreateValidator = vine.compile(
  vine.object({
        produto_id:vine.number().exists(async (db,value)=>{return await db.from('produtos').where('id',value).first()}).optional(),
		imagem_url:vine.file({ extnames:['png','jpg','jpeg'], size:'24mb'})
  })
)

export const ProdutoImagensUpdateValidator =  vine.compile(
  vine.object({
        produto_id:vine.number().exists(async (db,value)=>{return await db.from('produtos').where('id',value).first()}).optional(),
		imagem_url:vine.file({ extnames:['png','jpg','jpeg'], size:'24mb'}).optional()
  })
)
