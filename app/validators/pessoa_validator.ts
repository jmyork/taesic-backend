import vine from '@vinejs/vine'
import { randomUUID } from 'crypto'
import UniqueValidator from '../helpers/Validator.js'
export const createpessoaValidator = vine.compile(
  vine.object({
    // Só nome/tipo são realmente indispensáveis — os restantes campos (incluindo user_id, que
    // exigia uma referência a um user já existente) eram obrigatórios só por faltar
    // `.optional()`, ao contrário do updatepessoaValidator que já os tem todos opcionais.
    nome: vine.string().trim().escape(),
    tipo: vine.string().trim().escape(),
    email: vine.string().trim().email().optional(),
    telefone: vine.string().trim().escape().optional(),
    nif: vine.string().trim().escape().optional(),
    data_nascimento: vine.date({ formats: ['iso8601'] }).optional(),
    genero: vine.string().trim().escape().optional(),
    endereco: vine.string().trim().escape().optional(),
    cidade: vine.string().trim().escape().optional(),
    pais: vine.string().trim().escape().optional(),
    ativo: vine.boolean().optional(),
    user_id: vine
      .string()
      .trim()
      .escape()
      .exists(async (db, value, __) => {
        const exists = await db.from('user').where('id', value).first()
        return exists !== undefined
      })
      .optional(),
  })
)
export const updatepessoaValidator = vine.compile(
  vine.object({
    nome: vine.string().trim().escape().optional(),
    email: vine.string().trim().email().optional(),
    telefone: vine.string().trim().escape().optional(),
    nif: vine.string().trim().escape().optional(),
    data_nascimento: vine.date({ formats: ['iso8601'] }).optional(),
    genero: vine.string().trim().escape().optional(),
    endereco: vine.string().trim().escape().optional(),
    cidade: vine.string().trim().escape().optional(),
    pais: vine.string().trim().escape().optional(),
    ativo: vine.boolean().optional(),
    tipo: vine.string().trim().escape().optional(),
    user_id: vine
      .string()
      .trim()
      .escape()
      .exists(async (db, value, __) => {
        const exists = await db.from('user').where('id', value).first()
        return exists !== undefined
      })
      .optional(),
  })
)
