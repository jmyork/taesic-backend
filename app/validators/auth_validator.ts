import vine from '@vinejs/vine'
import type { FieldContext } from '@vinejs/vine/types'
import type { Database } from '@adonisjs/lucid/database'
import ValidatorConstraint from '../helpers/Validator.js'
import { emailUtilizavel } from '../helpers/email_valido.js'

/**
 * Unicidade de `username`/`email` **por domínio (empresa)**, nunca global.
 *
 * É exactamente o que a BD impõe: `create_users_table` declara
 * `unique(['email', 'empresa_id'])` e `unique(['username', 'empresa_id'])` — o
 * `unique()` global do email está comentado nessa migration. Duas empresas diferentes
 * podem ter um funcionário com o mesmo email/username; a mesma empresa não.
 *
 * O alias vem sempre de `params.company_alias` da rota (`api/:company_alias/...`):
 * `request.validateUsing()` injecta `params` no objecto validado (mesmo padrão já usado
 * em `vendapagamento_validator.ts`). Usa-se `field.data`, não `field.parent`, e com
 * optional chaining — assim o validator também é chamável directamente num teste sem
 * rebentar quando não há `params`.
 *
 * @param metaIdKey chave de `meta` com o id do próprio registo, a excluir da procura de
 *   duplicados (indispensável no update: sem isto, gravar sem alterar o campo colidiria
 *   consigo próprio).
 *
 * NÃO exclui utilizadores com soft delete (`deleted_at`): a constraint da BD também não
 * os exclui, por isso aceitar aqui o email de um funcionário desactivado só trocaria um
 * 400 legível por um 500 de chave duplicada no INSERT.
 */
const uniqueNoDominio =
  (coluna: 'username' | 'email', metaIdKey?: string) =>
  async (db: Database, value: string, field: FieldContext) => {
    const companyAlias = (field.data as any)?.params?.company_alias
    const proprioId = metaIdKey ? field.meta?.[metaIdKey] : undefined

    const query = db
      .from('user')
      .join('empresa', 'empresa.id', 'user.empresa_id')
      .where('empresa.company_alias', companyAlias ?? '')
      .where(`user.${coluna}`, value)

    if (proprioId) {
      query.whereNot('user.id', proprioId)
    }

    // `.first()` devolve `null` (não `undefined`) quando não há linha — daí `!linha` e não
    // uma comparação com `undefined`.
    const linha = await query.select('user.id').first()
    return !linha
  }

/**
 * Existência de um `email` **dentro da empresa da rota**, para os fluxos de recuperação
 * de password. Mesma regra de domínio do `uniqueNoDominio` acima, ao contrário.
 */
const existeNoDominio = async (db: Database, value: string, field: FieldContext) => {
  const companyAlias = (field.data as any)?.params?.company_alias

  const linha = await db
    .from('user')
    .join('empresa', 'empresa.id', 'user.empresa_id')
    .where('empresa.company_alias', companyAlias ?? '')
    .where('user.email', value)
    .select('user.id')
    .first()

  return !!linha
}

/**
 * O papel indicado existe NESTA empresa?
 *
 * Isto era uma `vine.enum([...])` com sete nomes escritos no código. Enquanto os
 * papeis eram partilhados por todos os inquilinos, uma lista fixa descrevia mesmo
 * o universo possivel. Deixou de descrever: a empresa passou a poder criar os seus
 * papeis, e um "Chefe de Turno" criado por ela seria recusado no registo do
 * funcionario — a gestao ficaria pela metade.
 *
 * A verificacao passa a ser contra a base de dados, restrita a `escopo = empresa` e
 * a esta empresa. E mais flexivel E mais apertada do que a lista fixa: um nome de
 * papel de outra empresa, um `modelo` ou um `Platform_*` nao passam aqui, e a lista
 * fixa nunca os teria excluido por si — excluia-os por acaso, por serem nomes que
 * nao constavam dela.
 *
 * Nota sobre o que MUDA de facto: a lista fixa nao incluia "Admin", "Gerente" nem
 * "Supervisor". Nao era uma fronteira de seguranca — quem tem `domain_auth.register`
 * tambem tem `domain_user_papel.store`, portanto sempre pode registar o funcionario e
 * atribuir-lhe o papel a seguir, em dois passos. O que a lista fazia era tornar isso
 * incoerente, nao impossivel.
 */
const papelDestaEmpresa = async (db: Database, value: string, field: FieldContext) => {
  const companyAlias = (field.data as any)?.params?.company_alias

  const linha = await db
    .from('papel')
    .join('empresa', 'empresa.id', 'papel.empresa_id')
    .where('empresa.company_alias', companyAlias ?? '')
    .where('papel.escopo', 'empresa')
    .where('papel.nome', value)
    .whereNull('papel.deleted_at')
    .select('papel.id')
    .first()

  return !!linha
}

export const UsersCreateValidator = vine.compile(
  vine.object({
    username: vine.string().escape().trim().unique(uniqueNoDominio('username')).maxLength(255),
    email: vine
      .string()
      .email()
      // O funcionário define a palavra-passe pelo link que recebe por email — um
      // endereço temporário deixa a conta sem forma de ser activada.
      .use(emailUtilizavel())
      .escape()
      .trim()
      .maxLength(255)
      .unique(uniqueNoDominio('email')),
    papel: vine
      .array(vine.string().trim().maxLength(80).exists(papelDestaEmpresa))
      .distinct(),
    // password: vine.string().trim().escape().minLength(6),
  })
)

export const UsersUpdateValidator = vine.compile(
  vine.object({
    username: vine
      .string()
      .escape()
      .trim()
      .maxLength(255)
      .unique(uniqueNoDominio('username', '_id'))
      .optional(),
    password: vine.string().trim().escape().minLength(6), //.regex(/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{6,}$/).optional(),
  })
)

/**
 * Edição de um funcionário no domínio da empresa (`PUT auth/:user_id`).
 *
 * Distinto do `UsersUpdateValidator` acima (que exige `password` e não é usado por
 * nenhuma rota): aqui a password nunca é editável por terceiros — o próprio define-a
 * pelo link enviado no registo. Os papéis também não entram: têm o recurso
 * `user-papeis` para isso.
 *
 * A unicidade de `username`/`email` é por domínio (como no registo), e o
 * `whereNot('user.id', ...)` de `uniqueNoDominio` é indispensável para um utilizador
 * poder gravar sem alterar o próprio campo.
 */
export const DomainUserUpdateValidator = vine.compile(
  vine.object({
    username: vine
      .string()
      .escape()
      .trim()
      .maxLength(255)
      .unique(uniqueNoDominio('username', 'user_id'))
      .optional(),
    email: vine
      .string()
      .email()
      .use(emailUtilizavel())
      .escape()
      .trim()
      .maxLength(255)
      .unique(uniqueNoDominio('email', 'user_id'))
      .optional(),
  })
)

export const UserLoginValidator = vine.compile(
  vine.object({
    uid: vine.string().trim().trim().escape(),
    password: vine.string().trim().minLength(6).escape(),
    company_alias: vine
      .string()
      .trim()
      .escape()
      .exists(
        new ValidatorConstraint({
          table: 'empresa',
          column: 'company_alias',
          idColumn: 'company_alias',
        }).existsRule()
      ).optional(),
  })
)

/**
 * Recuperação de palavra-passe.
 *
 * A regra de email utilizável aplica-se aqui também, por decisão explícita: nenhum
 * endereço temporário ou malformado é aceite em nenhum ponto da aplicação, sem excepções.
 *
 * Consequência a conhecer: uma conta antiga cujo email seja de um domínio descartável
 * deixa de poder pedir recuperação por esta via — o pedido é recusado antes de se
 * procurar a conta. Nesses casos a saída é um administrador da empresa alterar o email do
 * funcionário (`PUT auth/:user_id`), que exige na mesma um endereço permanente.
 */
export const UserForgotPasswordValidator = vine.compile(
  vine.object({
    email: vine.string().trim().email().use(emailUtilizavel()).exists(existeNoDominio),
  })
)

export const UserResetPasswordValidator = vine.compile(
  vine.object({
    email: vine.string().trim().email().use(emailUtilizavel()).exists(existeNoDominio),
    password: vine.string().trim().escape().minLength(6),
  })
)

export const QsValidator = vine.compile(
  vine.object({
    page: vine.number().positive().min(1).optional(),
    limit: vine.number().positive().min(1).optional(),
    created_at: vine.date({ formats: ['iso8601'] }).optional(),
    query: vine.string().trim().escape().maxLength(150).optional(),
    updated_at: vine.date({ formats: ['iso8601'] }).optional(),
  })
)
