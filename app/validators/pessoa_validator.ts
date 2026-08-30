import { emailUtilizavel } from '../helpers/email_valido.js'
import { pertenceAEmpresa } from './pertence_a_empresa.js'
import vine from '@vinejs/vine'
export const createpessoaValidator = vine.compile(
  vine.object({
    // Só nome/tipo são realmente indispensáveis — os restantes campos (incluindo user_id, que
    // exigia uma referência a um user já existente) eram obrigatórios só por faltar
    // `.optional()`, ao contrário do updatepessoaValidator que já os tem todos opcionais.
    nome: vine.string().trim().escape(),
    // Os únicos valores que a coluna aceita — o model tipa-os assim e o DTO também.
    tipo: vine.enum(['Cliente', 'Funcionario', 'Promotor']),
    email: vine.string().trim().email().use(emailUtilizavel()).optional(),
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
      // `pessoa` é recurso de inquilino (`router.resource('pessoa', ...)` sob
      // `api/:company_alias`), mas o `user_id` não era verificado contra empresa
      // nenhuma — dava para ligar uma ficha de pessoa a um funcionário de outra
      // empresa. Mesma falha do `caixa.user_id`; ver pertence_a_empresa.ts.
      .exists(pertenceAEmpresa({ tabela: 'user' }))
      .optional(),
  })
)
export const updatepessoaValidator = vine.compile(
  vine.object({
    nome: vine.string().trim().escape().optional(),
    email: vine.string().trim().email().use(emailUtilizavel()).optional(),
    telefone: vine.string().trim().escape().optional(),
    nif: vine.string().trim().escape().optional(),
    data_nascimento: vine.date({ formats: ['iso8601'] }).optional(),
    genero: vine.string().trim().escape().optional(),
    endereco: vine.string().trim().escape().optional(),
    cidade: vine.string().trim().escape().optional(),
    pais: vine.string().trim().escape().optional(),
    ativo: vine.boolean().optional(),
    tipo: vine.enum(['Cliente', 'Funcionario', 'Promotor']).optional(),
    user_id: vine
      .string()
      .trim()
      .escape()
      // `pessoa` é recurso de inquilino (`router.resource('pessoa', ...)` sob
      // `api/:company_alias`), mas o `user_id` não era verificado contra empresa
      // nenhuma — dava para ligar uma ficha de pessoa a um funcionário de outra
      // empresa. Mesma falha do `caixa.user_id`; ver pertence_a_empresa.ts.
      .exists(pertenceAEmpresa({ tabela: 'user' }))
      .optional(),
  })
)
