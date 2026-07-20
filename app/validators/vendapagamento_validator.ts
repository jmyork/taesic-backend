import vine from '@vinejs/vine'
import { randomUUID } from 'crypto';
import UniqueValidator from '../helpers/Validator.js'
export const createvendapagamentoValidator=vine.compile(vine.object({venda_id: vine.string().trim().escape().exists(async (db,value,__)=>{ const exists = await db.from('vendas').where('id', value).first(); return exists !== undefined; }),
    metodo_pagamento_id: vine.string().trim().escape().exists(async (db,value,__)=>{ const exists = await db.from('metodopagamento').where('id', value).first(); return exists !== undefined; }),
    valor: vine.number().decimal([0, 12]),}))
export const updatevendapagamentoValidator=vine.compile(vine.object({venda_id: vine.string().trim().escape().exists(async (db,value,__)=>{ const exists = await db.from('vendas').where('id', value).first(); return exists !== undefined; }).optional(),
    metodo_pagamento_id: vine.string().trim().escape().exists(async (db,value,__)=>{ const exists = await db.from('metodopagamento').where('id', value).first(); return exists !== undefined; }).optional(),
    valor: vine.number().decimal([0, 12]).optional(),}))