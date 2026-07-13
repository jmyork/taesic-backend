import vine from '@vinejs/vine'
import { randomUUID } from 'crypto'
import UniqueValidator from '../helpers/Validator.js'
export const createplanoValidator = vine.compile(
  vine.object({
    nome: vine.string().trim().escape(),
    descricao: vine.string().trim().escape(),
    preco: vine.number().decimal(30),
    moeda: vine.string().trim().escape(),
    periodo: vine.string().trim().escape(),
    ativo: vine.boolean(),
    limite_uso: vine.number().decimal(30),
  })
)
export const updateplanoValidator = vine.compile(
  vine.object({
    nome: vine.string().trim().escape().optional(),
    descricao: vine.string().trim().escape().optional(),
    preco: vine.number().decimal(30).optional(),
    moeda: vine.string().trim().escape().optional(),
    periodo: vine.string().trim().escape().optional(),
    ativo: vine.boolean().optional(),
    limite_uso: vine.number().decimal(30).optional(),
  })
)
