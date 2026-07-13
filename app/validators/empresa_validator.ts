import vine from '@vinejs/vine'
import { companyExists } from '../helpers/Utils.js'
import ValidatorConstraint from '../helpers/Validator.js'

/**
 * Validador para criação de empresa
 * Valida NIF (número de identificação fiscal)
 */
export const createempresaValidator = vine.compile(
  vine.object({
    nif: vine
      .string()
      .unique(async (db, value) => {
        return !(await db.from('empresa').where('nif', value).first())
      })
      .exists(async (_, value) => {
        return companyExists(value)
      }),
  })
)

/**
 * Validador para atualização de empresa
 * Permite apenas atualizar informações não sensíveis
 */
export const updateempresaValidator = vine.compile(
  vine.object({
    nome: vine.string().trim().maxLength(255).optional(),
  })
)

/**
 * Validador para criação de empresa com usuário
 * Usado no processo de registro de plataforma
 * Cria empresa e usuário admin de uma vez
 */
export const CreateCompanyWithUserAndStartACompany = vine.compile(
  vine.object({
    user: vine.object({
      username: vine
        .string()
        .escape()
        .trim()
        .unique(async (db, value) => {
          return !(await db.from('user').where('username', value).first())
        })
        .maxLength(255)
        .minLength(3),
      email: vine
        .string()
        .email()
        .escape()
        .trim()
        .maxLength(255)
        .unique(async (db, value) => {
          return !(await db.from('user').where('email', value).first())
        }),
      password: vine.string().trim().escape().minLength(8).maxLength(255),
    }),
    empresa: vine.object({
      nif: vine
        .string()
        .unique(async (db, value) => {
          return !(await db.from('empresa').where('nif', value).first())
        })
        .exists(async (_, value) => {
          return companyExists(value)
        }),
      // Tem de corresponder exactamente ao matcher usado pelas rotas de tenant em
      // start/companydomainroutes.ts (`.where('company_alias', ...)`) — só minúsculas e
      // hífens simples, sem dígitos/underscores, para que o alias registado consiga
      // sempre resolver as rotas api/:company_alias/... depois de criado.
      company_alias: vine
        .string()
        .regex(/^(?!.*--)[a-z]+(?:-[a-z]+)*$/)
        .maxLength(255)
        .optional(),

      nome: vine
        .string()
        .trim()
        .maxLength(255)
        .optional()
        .requiredIfExists(['contacto', 'localizacao', 'regime_iva', 'inadiplente']),
      contacto: vine
        .string()
        .trim()
        .maxLength(255)
        .optional()
        .requiredIfExists(['nome', 'localizacao', 'regime_iva', 'inadiplente']),
      localizacao: vine
        .string()
        .trim()
        .maxLength(255)
        .optional()
        .requiredIfExists(['contacto', 'regime_iva', 'inadiplente']),
      regime_iva: vine
        .boolean()
        .optional()
        .requiredIfExists(['contacto', 'localizacao', 'regime_iva', 'inadiplente']),
      inadiplente: vine
        .boolean()
        .optional()
        .requiredIfExists(['contacto', 'localizacao', 'regime_iva', 'inadiplente']),
    }),
  })
)

export const CreateCompanyWithUserAndStartACompanyDetalhes = vine.compile(
  vine.object({
    // USER
    user_username: vine.string().escape().trim().maxLength(255).minLength(3),
    user_email: vine.string().email().escape().trim(),
    user_password: vine.string().trim().escape().minLength(8).maxLength(255),

    // DADOS PESSOAIS
    dados_nome: vine.string().trim(),
    dados_sobrenome: vine.string().trim(),
    dados_foto: vine
      .file({
        extnames: ['jpg', 'png', 'jpeg', 'gif'],
        size: '30mb',
      })
      .optional(),

    // EMPRESA
    empresa_nif: vine.string().unique(async (db, value) => {
      return !(await db.from('empresa').where('nif', value).first())
    }),
    // Tem de corresponder exactamente ao matcher usado pelas rotas de tenant em
    // start/companydomainroutes.ts (`.where('company_alias', ...)`) — caso contrário uma
    // empresa registada com um alias inválido para essas rotas nunca conseguiria aceder
    // a nenhum endpoint api/:company_alias/... depois de criada.
    empresa_company_alias: vine
      .string()
      .regex(/^(?!.*--)[a-z]+(?:-[a-z]+)*$/)
      .maxLength(255),
    empresa_tamanho: vine.enum(['pequena', 'media', 'grande']).optional(),
    empresa_nome: vine
      .string()
      .trim()
      .unique(new ValidatorConstraint({ table: 'empresa', column: 'nome' }).createRule())
      .maxLength(255),
    empresa_contacto: vine.string().trim().maxLength(255),
    empresa_localizacao: vine.string().trim().maxLength(255).optional(),
    empresa_regime_iva: vine.boolean().optional(),
    empresa_inadiplente: vine
      .boolean()
      .optional()
      .requiredIfExists([
        'empresa_contacto',
        'empresa_localizacao',
        'empresa_regime_iva',
        'empresa_inadiplente',
      ]),
  })
)

export const SetupCompanyValidator = vine.compile(
  vine.object({
    tamanho_empresa: vine.enum(['small', 'medium', 'large']),
    conta_bancaria: vine
      .array(
        vine.object({
          banco: vine.string().trim().optional(),
          numero_conta: vine.string().trim().optional(),
        })
      )
      .optional(),
    ponto_de_venda: vine.string().trim().optional(),
    caixa: vine.string().trim().optional(),
  })
)

export const ResendVerificationEmailValidator = vine.compile(
  vine.object({
    nif_ou_company_alias: vine.string().exists(async (db, value) => {
      return !!(await db.from('empresa').where('nif', value).orWhere("company_alias",value).first())
    })
  })
)
