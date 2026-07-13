import vine from '@vinejs/vine'
import { randomUUID } from 'crypto'

export const createclienteValidator = vine.compile(
  vine.object({
    // Só tipo/nome são realmente indispensáveis para registar um cliente — os restantes
    // campos eram obrigatórios só por faltar `.optional()` (ao contrário do
    // updateclienteValidator, que já os tem todos opcionais), o que na prática exigia duas
    // fotos e um cliente_pai_id apontando para um cliente já existente só para criar o primeiro.
    tipo: vine.string().trim().escape(),
    nome: vine.string().trim().escape(),
    nome_fantasia: vine.string().trim().escape().optional(),
    razao_social: vine.string().trim().escape().optional(),
    email: vine.string().trim().email().optional(),
    telefone: vine.string().trim().escape().optional(),
    telefone_secundario: vine.string().trim().escape().optional(),
    nif: vine.string().trim().escape().optional(),
    numero_registro: vine.string().trim().escape().optional(),
    data_nascimento: vine.date({ formats: ['iso8601'] }).optional(),
    genero: vine.string().trim().escape().optional(),
    estado_civil: vine.string().trim().escape().optional(),
    profissao: vine.string().trim().escape().optional(),
    website: vine.string().trim().escape().optional(),
    endereco: vine.string().trim().escape().optional(),
    bairro: vine.string().trim().escape().optional(),
    cidade: vine.string().trim().escape().optional(),
    provincia: vine.string().trim().escape().optional(),
    pais: vine.string().trim().escape().optional(),
    codigo_postal: vine.string().trim().escape().optional(),
    ativo: vine.boolean().optional(),
    limite_credito: vine.number().decimal(30).optional(),
    saldo: vine.number().decimal(30).optional(),
    observacao: vine.string().trim().escape().optional(),
    logo: vine
      .file({ size: '25mb', extnames: ['jpg', 'jpeg', 'png', 'gif'] })
      .transform((file) => {
        const fileName = `${randomUUID()}.${file.extname}`
        file.move('uploads', { name: fileName, overwrite: true })
        return fileName
      })
      .optional(),
    foto: vine
      .file({ size: '25mb', extnames: ['jpg', 'jpeg', 'png', 'gif'] })
      .transform((file) => {
        const fileName = `${randomUUID()}.${file.extname}`
        file.move('uploads', { name: fileName, overwrite: true })
        return fileName
      })
      .optional(),
    cliente_pai_id: vine
      .string()
      .trim()
      .escape()
      .exists(async (db, value, __) => {
        const exists = await db.from('cliente').where('id', value).first()
        return exists !== undefined
      })
      .optional(),
  })
)
export const updateclienteValidator = vine.compile(
  vine.object({
    tipo: vine.string().trim().escape().optional(),
    nome: vine.string().trim().escape().optional(),
    nome_fantasia: vine.string().trim().escape().optional(),
    razao_social: vine.string().trim().escape().optional(),
    email: vine.string().trim().email().optional(),
    telefone: vine.string().trim().escape().optional(),
    telefone_secundario: vine.string().trim().escape().optional(),
    nif: vine.string().trim().escape().optional(),
    numero_registro: vine.string().trim().escape().optional(),
    data_nascimento: vine.date({ formats: ['iso8601'] }).optional(),
    genero: vine.string().trim().escape().optional(),
    estado_civil: vine.string().trim().escape().optional(),
    profissao: vine.string().trim().escape().optional(),
    website: vine.string().trim().escape().optional(),
    endereco: vine.string().trim().escape().optional(),
    bairro: vine.string().trim().escape().optional(),
    cidade: vine.string().trim().escape().optional(),
    provincia: vine.string().trim().escape().optional(),
    pais: vine.string().trim().escape().optional(),
    codigo_postal: vine.string().trim().escape().optional(),
    ativo: vine.boolean().optional(),
    limite_credito: vine.number().decimal(30).optional(),
    saldo: vine.number().decimal(30).optional(),
    observacao: vine.string().trim().escape().optional(),
    logo: vine
      .file({ size: '25mb', extnames: ['jpg', 'jpeg', 'png', 'gif'] })
      .transform((file) => {
        const fileName = `${randomUUID()}.${file.extname}`
        file.move('uploads', { name: fileName, overwrite: true })
        return fileName
      })
      .optional(),
    foto: vine
      .file({ size: '25mb', extnames: ['jpg', 'jpeg', 'png', 'gif'] })
      .transform((file) => {
        const fileName = `${randomUUID()}.${file.extname}`
        file.move('uploads', { name: fileName, overwrite: true })
        return fileName
      })
      .optional(),
    cliente_pai_id: vine
      .string()
      .trim()
      .escape()
      .exists(async (db, value, __) => {
        const exists = await db.from('cliente').where('id', value).first()
        return exists !== undefined
      })
      .optional(),
  })
)
