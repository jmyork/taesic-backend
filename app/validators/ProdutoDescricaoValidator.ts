import vine from '@vinejs/vine'

export const ProdutoDescricaoCreateValidator = vine.compile(
  vine.object({
        produto_id:vine.number().exists(async (db,value)=>{return await db.from('produtos').where('id',value).first()}).optional(),
		descricao_detalhada:vine.string().escape().trim()
  })
)

export const ProdutoDescricaoUpdateValidator =  vine.compile(
  vine.object({
        produto_id:vine.number().exists(async (db,value)=>{return await db.from('produtos').where('id',value).first()}).optional(),
		descricao_detalhada:vine.string().escape().trim().optional()
  })
)
