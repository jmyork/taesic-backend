import vine from '@vinejs/vine'
import { randomUUID } from 'crypto';
export const createempresa_conta_bancariaValidator = vine.compile(vine.object({ empresa_id: vine.string().trim().escape(),
    conta: vine.string().trim().escape(),
    iban: vine.string().trim().escape(),}))
export const updateempresa_conta_bancariaValidator = vine.compile(vine.object({ empresa_id: vine.string().trim().escape().optional(),
    conta: vine.string().trim().escape().optional(),
    iban: vine.string().trim().escape().optional(),}))