import { emailUtilizavel } from '../helpers/email_valido.js'
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
    // Só relevante quando `regime_iva` — decide a taxa usada no cálculo de "IVA
    // liquidado" nos relatórios (relatorios_repository.ts).
    taxa_iva_id: vine
      .string()
      .trim()
      .uuid()
      .exists(async (db, value, __) => {
        const exists = await db.from('taxa_iva').where('id', value).whereNull('deleted_at').first()
        return !!exists
      })
      .optional(),
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
        .use(emailUtilizavel())
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
    // Email do dono da empresa: é por ele que se activa a conta e se recupera o acesso,
    // e é o que sai nas facturas — não pode ser temporário.
    user_email: vine.string().email().escape().trim().use(emailUtilizavel()),
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
    // O `.trim()` NÃO é cosmético: sem ele, `' 5000000000'` é uma string diferente de
    // `'5000000000'` para o MySQL e passava o `.unique()` aqui em baixo, ficando gravada
    // como um NIF distinto. Verificado contra a coluna real — a versão com espaço
    // devolvia 0 linhas. A unicidade a sério passou a estar também na base de dados
    // (`empresa_nif_unique`), porque uma regra que só vive no validador é uma corrida
    // entre dois registos simultâneos e não cobre caminho nenhum que não passe por aqui.
    //
    // Maiúsculas não precisam de normalização: a coluna é `utf8mb4_0900_ai_ci`, portanto
    // esta consulta e o índice único concordam a ignorá-las.
    //
    // O formato fica-se por "letras e dígitos", o mesmo alfabeto que a rota de consulta
    // aceita (`api/nif/:nif`). Um NIF de empresa em Angola tem 10 dígitos, mas o de um
    // particular é o número do BI (dígitos + duas letras + dígitos) — fixar um formato
    // exacto arriscava recusar NIFs válidos, e recusar um NIF válido é pior do que
    // aceitar um mal formado, que a consulta ao portal apanha.
    //
    // ATENÇÃO ao que isto NÃO faz: nada aqui verifica que o NIF existe, e muito menos
    // que é de quem o está a escrever. Ver CLAUDE.md §7.16.
    empresa_nif: vine
      .string()
      .trim()
      .minLength(5)
      .maxLength(20)
      .regex(/^[A-Za-z0-9]+$/)
      .unique(async (db, value) => {
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

/**
 * Suspender uma empresa exige um motivo escrito.
 *
 * Não é burocracia: a suspensão corta o acesso a um cliente inteiro e revoga as
 * sessões de todos os seus utilizadores. Quem for atender o telefonema que se
 * segue precisa de saber porquê, e quem reactivar precisa de saber o que tinha de
 * ficar resolvido antes. O CHECK da base de dados impõe o mesmo invariante do
 * lado de lá (`empresa_suspensao_chk`), para que nenhum outro caminho de código
 * consiga gravar uma suspensão muda.
 *
 * `minLength(10)` é o suficiente para excluir o "x" e o "teste" sem obrigar a
 * escrever um relatório: "Fraude NIF" passa.
 */
export const SuspenderEmpresaValidator = vine.compile(
  vine.object({
    motivo: vine.string().trim().minLength(10).maxLength(255),
  })
)

export const ResendVerificationEmailValidator = vine.compile(
  vine.object({
    nif_ou_company_alias: vine.string().exists(async (db, value) => {
      return !!(await db.from('empresa').where('nif', value).orWhere("company_alias",value).first())
    })
  })
)
