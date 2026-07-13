import vine from '@vinejs/vine'

export const ProdutoContraindicacoesCreateValidator = vine.compile(
  vine.object({
        produto_id:vine.number().exists(async (db,value)=>{return await db.from('produtos').where('id',value).first()}).optional(),
		contraindicacao:vine.string().escape().trim()
  })
)

export const ProdutoContraindicacoesUpdateValidator =  vine.compile(
  vine.object({
        produto_id:vine.number().exists(async (db,value)=>{return await db.from('produtos').where('id',value).first()}).optional(),
		contraindicacao:vine.string().escape().trim().optional()
  })
)
