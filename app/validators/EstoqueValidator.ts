import vine from '@vinejs/vine'

export const EstoqueCreateValidator = vine.compile(
	vine.object({
		produto_validade_id: vine.number().exists(async (db, value) => { return await db.from('produto_validade').where('id', value).first() }),
		quantidade: vine.number().positive(),
		tipo_movimentacao: vine.enum(['entrada', 'retirada']),
		motivo_retirada: vine.string().escape().trim().optional(),
		// registrado_por: vine.number().exists(async (db, value) => { return await db.from('users').where('id', value).first() }).optional()
	})
)