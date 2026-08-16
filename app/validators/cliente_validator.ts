import { emailUtilizavel } from '../helpers/email_valido.js'
import vine from '@vinejs/vine'
import { randomUUID } from 'crypto'
import { commonQueryFields } from './common_query_fields.js'

/**
 * Unicidade de NIF/email POR EMPRESA.
 *
 * O problema que resolve: `nif` e `email` eram apenas `.optional()`, sem qualquer regra de
 * unicidade — dava para registar o mesmo contribuinte infinitas vezes. Num sistema de
 * facturação isso parte tudo o que agrega por cliente (histórico, saldo, limite de crédito,
 * relatórios) e produz facturas emitidas a fichas diferentes do mesmo NIF.
 *
 * Porquê no validador e NÃO num índice UNIQUE na base de dados: `cliente` usa soft-delete
 * (`deleted_at`), e um índice UNIQUE cobre também as linhas apagadas — recriar um cliente que
 * tinha sido removido passaria a dar ER_DUP_ENTRY em vez de funcionar. É exactamente a classe
 * de bug que já mordeu em `userpos` e em `user_papel` neste mesmo projecto.
 *
 * Contrapartida, dita com todas as letras: sem constraint na base de dados, dois pedidos
 * concorrentes com o mesmo NIF podem passar ambos. É uma janela estreita, e fechá-la exigiria
 * índice UNIQUE + reviver-em-vez-de-inserir em todos os caminhos de escrita. O problema real
 * relatado é duplicação por engano humano, e essa fica resolvida.
 *
 * O escopo é por empresa e não global de propósito: dois tenants diferentes podem — e vão —
 * ter o mesmo cliente. `cliente` só está exposto em rotas de tenant, por isso
 * `params.company_alias` está sempre presente.
 */
function unicoPorEmpresa(coluna: 'nif' | 'email') {
  return async (db: any, value: unknown, field: any) => {
    // Valor ausente ou vazio nunca colide: o NIF é opcional e muitos particulares não o têm,
    // logo N clientes sem NIF são perfeitamente legítimos.
    const limpo = String(value ?? '').trim()
    if (limpo === '') return true

    const alias = field.data.params?.company_alias
    if (!alias) return true // sem empresa no contexto não há escopo — não inventa um

    const query = db
      .from('cliente')
      .join('empresa', 'empresa.id', 'cliente.empresa_id')
      .where('empresa.company_alias', alias)
      .whereNull('cliente.deleted_at')
      // Comparação insensível a maiúsculas/minúsculas feita explicitamente, para não depender
      // da collation da base de dados (a predefinida do MySQL é CI, mas isso não é garantido
      // e um deploy com collation CS deixaria passar "ABC@x.com" contra "abc@x.com").
      .whereRaw(`LOWER(TRIM(cliente.${coluna})) = ?`, [limpo.toLowerCase()])

    // No update, a própria linha não pode contar como duplicado — senão gravar um cliente sem
    // sequer lhe tocar no NIF passaria a dar erro. O `id` vem do parâmetro de rota /cliente/:id.
    const id = field.data.params?.id
    if (id) query.whereNot('cliente.id', id)

    return !(await query.first())
  }
}

export const createclienteValidator = vine.compile(
  vine.object({
    // Só tipo/nome são realmente indispensáveis para registar um cliente — os restantes
    // campos eram obrigatórios só por faltar `.optional()` (ao contrário do
    // updateclienteValidator, que já os tem todos opcionais), o que na prática exigia duas
    // fotos e um cliente_pai_id apontando para um cliente já existente só para criar o primeiro.
    tipo: vine.enum(['Pessoa Física', 'Pessoa Jurídica']),
    nome: vine.string().trim().escape(),
    razao_social: vine.string().trim().escape().optional(),
    email: vine.string().trim().email().use(emailUtilizavel()).unique(unicoPorEmpresa('email')).optional(),
    telefone: vine.string().trim().escape().optional(),
    telefone_secundario: vine.string().trim().escape().optional(),
    nif: vine.string().trim().escape().unique(unicoPorEmpresa('nif')).optional(),
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
    limite_credito: vine.number().decimal([0, 12]).optional(),
    saldo: vine.number().decimal([0, 12]).optional(),
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

export const ClienteQueryValidator = vine.compile(
  vine.object({
    ...commonQueryFields,

    // Pesquisa livre — nome/nome_fantasia/razao_social/email/telefone/nif ao mesmo tempo.
    q: vine.string().trim().escape().optional(),

    // Numeração sequencial por-empresa — nº do registo, distinto do `id` (UUID).
    numero: vine.number().positive().withoutDecimals().optional(),

    // Filtros por campo específicos de cliente.
    nome: vine.string().trim().escape().optional(),
    nome_fantasia: vine.string().trim().escape().optional(),
    razao_social: vine.string().trim().escape().optional(),
    email: vine.string().trim().escape().optional(),
    telefone: vine.string().trim().escape().optional(),
    telefone_secundario: vine.string().trim().escape().optional(),
    nif: vine.string().trim().escape().optional(),
    numero_registro: vine.string().trim().escape().optional(),
    cidade: vine.string().trim().escape().optional(),
    provincia: vine.string().trim().escape().optional(),
    pais: vine.string().trim().escape().optional(),
    tipo: vine.enum(['Pessoa Física', 'Pessoa Jurídica']).optional(),
    ativo: vine.boolean().optional(),
    cliente_pai_id: vine.string().trim().escape().optional(),
  })
)

export const updateclienteValidator = vine.compile(
  vine.object({
    tipo: vine.enum(['Pessoa Física', 'Pessoa Jurídica']).optional(),
    nome: vine.string().trim().escape().optional(),
    nome_fantasia: vine.string().trim().escape().optional(),
    razao_social: vine.string().trim().escape().optional(),
    email: vine.string().trim().email().use(emailUtilizavel()).unique(unicoPorEmpresa('email')).optional(),
    telefone: vine.string().trim().escape().optional(),
    telefone_secundario: vine.string().trim().escape().optional(),
    nif: vine.string().trim().escape().unique(unicoPorEmpresa('nif')).optional(),
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
    limite_credito: vine.number().decimal([0, 12]).optional(),
    saldo: vine.number().decimal([0, 12]).optional(),
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
