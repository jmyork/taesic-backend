import Papel, { ESCOPO_PAPEL } from '#models/auth/papel'
import papel_permissao from '#models/auth/papel_permissao'
import Permissao from '#models/auth/permissao'
import UserPapel from '#models/auth/user_papel'
import User from '#models/user'
import UserPos from '#models/userpos'
import VerificationTokenHash from '#models/verification_token_hash'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { DateTime } from 'luxon'
import { randomUUID } from 'node:crypto'
import env from '#start/env'
// import cache from '@adonisjs/cache/services/main'
// const CACHE_TTL = '10m'

export const UserGotAdminRole = async (user: User) => {
  //console.log('Getting user papeis for user:', user.id)
  const userPapel = await user.related('papel').query().where('nome', 'admin').first()
  return !!userPapel
}

export const GetUserPapeis = async (user: User) => {
  const userPapeis = await db.from('user_papel').where('user_id', user.id).select('papel_id')
  const papelNome = userPapeis.map(async (papel) =>
    (await db.from('papel').where('id', papel.papel_id).select('nome').first())?.nome?.toLowerCase()
  )
  return await Promise.all(papelNome)
}

export const IsUserAnAdmin = async (user: User) => {
  // Check if the user is the owner of the papel permissao
  const userPapeis = await GetUserPapeis(user)
  if (userPapeis.includes('admin')) {
    return true
  }
  // Otherwise, deny access
  return false
}

export const IsUserResource = async (user: User, resource: any) => {
  return resource.user_id === user.id
}

export const setUserPapeis = async (user_id: string, papeis: string[]) => {
  const getPapeisIds = await db.from('papel').whereIn('nome', papeis).select('id')
  if (getPapeisIds && getPapeisIds.length === 0) {
    //console.log('Não foi/foram encontrado(s) o(s) pape(l,is)', papeis)
    return null
  }
  const papelIds = getPapeisIds.map((papel) => papel.id)
  await db.from('user_papel').where('user_id', user_id).delete()
  const insertData = papelIds.map((papel_id) => ({ user_id: user_id, papel_id, id: randomUUID() }))
  await db.table('user_papel').multiInsert(insertData)
}

export const companyExists = async (nif: string) => {
  try {
    const response = await fetch(`http://consulta.edgarsingui.ao/consultar/${nif}/nif`)
    const body: any = await response.json()

    if (!response.ok || body.error) {
      return false
    }

    return true
  } catch {
    return false
  }
}

export const getCompanyDetails = async (nif: string) => {
  try {
    if (await companyExists(nif)) {
      const response = await fetch(
        `https://bknkv-utils-api-resources.onrender.com/consultar-nif/${nif}`
      )
      return await response.json()
    } else false
  } catch {
    return false
  }
}

/**
 * Restringe uma consulta aos papéis que este utilizador PODE de facto usar.
 *
 * Vale como segunda tranca. A primeira é não criar atribuições erradas; esta
 * garante que, mesmo que uma linha errada exista — deixada por uma migração,
 * escrita à mão na base de dados, sobrevivente de uma empresa apagada —, ela não
 * concede nada. Um papel de outra empresa não conta. Um `modelo` nunca conta:
 * existe para ser clonado, não para ser usado.
 *
 * `papel.deleted_at` entra aqui e não entrava antes: um papel apagado com soft
 * delete continuava a conceder as suas permissões. Não fazia diferença enquanto
 * ninguém podia apagar papéis; passa a fazer no momento em que cada empresa
 * pode apagar os seus.
 */
function apenasPapeisUtilizaveis<T>(consulta: T, user: User): T {
  // Os construtores de consulta do Lucid são mutáveis e encadeáveis: aplicar as
  // cláusulas e devolver o MESMO objecto mantém o tipo de quem chamou — devolver
  // o resultado de `.where()` colapsava tudo para `any` e apagava a verificação de
  // tipos de todos os chamadores (foi o que aconteceu à primeira tentativa).
  const q = consulta as unknown as {
    whereNull(coluna: string): unknown
    where(callback: (sub: any) => void): unknown
  }

  q.whereNull('papel.deleted_at')
  q.where((sub) => {
    sub.where('papel.escopo', ESCOPO_PAPEL.plataforma)
    if (user.empresa_id) {
      sub.orWhere((interno: any) => {
        interno
          .where('papel.escopo', ESCOPO_PAPEL.empresa)
          .where('papel.empresa_id', user.empresa_id!)
      })
    }
  })

  return consulta
}

/**
 * Este utilizador é do dono da plataforma?
 *
 * A resposta vem de `papel.escopo`, nunca do nome. Ver o comentário em
 * `admin_only_middleware.ts` para o porquê — em resumo: com papéis por empresa,
 * qualquer inquilino podia criar um papel chamado `Platform_Admin`.
 */
export async function userHasPlatformRole(user: User): Promise<boolean> {
  const papel = await Papel.query()
    .join('user_papel', 'user_papel.papel_id', 'papel.id')
    .where('user_papel.user_id', user.id)
    .whereNull('user_papel.deleted_at')
    .whereNull('papel.deleted_at')
    .where('papel.escopo', ESCOPO_PAPEL.plataforma)
    .select('papel.id')
    .first()

  return !!papel
}

/**
 * Resolve um papel pelo nome DENTRO de um âmbito. Nunca globalmente.
 *
 * `Papel.findByOrFail('nome', ...)` deixou de ser suficiente: com uma cópia de
 * "Vendedor" por empresa, procurar pelo nome devolve a primeira que aparecer —
 * que pode ser a de outra empresa. Toda a resolução por nome passa por aqui.
 */
export async function encontrarPapel(
  nome: string,
  escopo: (typeof ESCOPO_PAPEL)[keyof typeof ESCOPO_PAPEL],
  empresaId?: string | null,
  trx?: TransactionClientContract
) {
  const consulta = Papel.query({ client: trx })
    .where('nome', nome)
    .where('escopo', escopo)
    .whereNull('deleted_at')

  if (escopo === ESCOPO_PAPEL.empresa) {
    consulta.where('empresa_id', empresaId!)
  } else {
    consulta.whereNull('empresa_id')
  }

  return consulta.first()
}

/**
 * `escopo` explícito, e sem valor por omissão, de propósito: quem chama tem de
 * dizer a que mundo pertence o papel que quer alterar. O seeder trabalha sobre
 * `modelo` e `plataforma`; uma empresa trabalha sobre os seus.
 */
export async function givePermissionsToRole(
  roleName: string,
  permissions: string[],
  escopo: (typeof ESCOPO_PAPEL)[keyof typeof ESCOPO_PAPEL] = ESCOPO_PAPEL.modelo,
  empresaId?: string | null
) {
  const role = await encontrarPapel(roleName, escopo, empresaId)
  if (!role) {
    throw new Error(`Papel "${roleName}" não existe no âmbito "${escopo}".`)
  }

  const perms = await Permissao.query().whereIn('nome', [...new Set(permissions)])

  await papel_permissao.createMany(
    perms.map((p) => ({
      papel_id: role.id,
      permissao_id: p.id,
    }))
  )

  // Alternativamente, se você quiser usar o método sync para manter as permissões atualizadas:
  // await role.related('permissao').sync(perms.map((p) => p.id))
}

export async function removePermissionsFromRole(
  roleName: string,
  permissions: string[],
  escopo: (typeof ESCOPO_PAPEL)[keyof typeof ESCOPO_PAPEL] = ESCOPO_PAPEL.modelo,
  empresaId?: string | null
) {
  const role = await encontrarPapel(roleName, escopo, empresaId)
  if (!role) {
    throw new Error(`Papel "${roleName}" não existe no âmbito "${escopo}".`)
  }

  const perms = await Permissao.query().whereIn('nome', [...new Set(permissions)])

  await papel_permissao
    .query()
    .where('papel_id', role.id)
    .whereIn(
      'permissao_id',
      perms.map((p) => p.id)
    )
    .delete()

  // Alternativamente, se você quiser usar o método sync para manter as permissões atualizadas:
  // await role.related('permissao').sync(perms.map((p) => p.id))

  await role.related('permissao').sync(perms.map((p) => p.id))
}

/**
 * `trx`, quando fornecido, TEM de ser a mesma transação em que `user` foi criado/gravado —
 * caso contrário esta escrita (numa ligação/transação diferente) fica bloqueada à espera do
 * lock de FK sobre a linha `user`, ainda não confirmada, até `trx` fazer commit (o que nunca
 * acontece a tempo, porque o próprio `trx.commit()` espera por esta chamada terminar primeiro)
 * — resultando sempre em "Lock wait timeout exceeded", nunca só ocasionalmente por race.
 */
/**
 * `escopo` explícito só para conceder acesso de PLATAFORMA a alguém que também
 * tem empresa (o caso do fundador, ou de um seeder).
 *
 * Não é o valor por omissão, e a razão é de segurança. Se isto caísse
 * automaticamente para o âmbito de plataforma quando o nome não existisse na
 * empresa, bastaria a alguém conseguir passar "Platform_Admin" como nome de papel
 * para escalar. Hoje o validador de registo de funcionário tem uma lista fixa que
 * exclui os `Platform_*`, mas fazer depender uma fronteira de acesso de um
 * validador HTTP noutro ficheiro é precisamente o padrão que já falhou aqui antes
 * (ver `venda_itens_repository.create()`). Quem quer plataforma, diz que quer.
 */
export interface OpcoesAtribuicaoPapel {
  escopo?: (typeof ESCOPO_PAPEL)[keyof typeof ESCOPO_PAPEL]
}

export async function giveRoleToUser(
  user: User,
  roleName: string | string[],
  trx?: TransactionClientContract,
  opcoes: OpcoesAtribuicaoPapel = {}
) {
  const roleSet = new Set(Array.isArray(roleName) ? roleName : [roleName])

  // O âmbito vem de QUEM é o utilizador, não de quem chama: um utilizador com
  // empresa recebe papéis da sua empresa, um utilizador de plataforma recebe
  // papéis de plataforma. Antes procurava-se `where('nome', role)` sem mais nada
  // — com uma cópia de "Vendedor" por empresa, isso devolvia a primeira que
  // aparecesse na tabela, que podia ser a de OUTRA empresa.
  const escopo =
    opcoes.escopo ?? (user.empresa_id ? ESCOPO_PAPEL.empresa : ESCOPO_PAPEL.plataforma)

  const roleData: { user_id: string; papel_id: string }[] = []

  for (const nome of roleSet) {
    const papel = await encontrarPapel(nome, escopo, user.empresa_id, trx)

    // Antes: `?.id || ''`. Uma string vazia num campo de chave estrangeira faz o
    // MySQL rebentar com um erro de constraint que não diz nada sobre a causa —
    // e, pior, se algum dia essa FK fosse relaxada, a atribuição desaparecia em
    // silêncio e o utilizador ficava sem papel nenhum sem ninguém saber porquê.
    if (!papel) {
      throw new Error(
        `Não existe o papel "${nome}" no âmbito "${escopo}"` +
          (user.empresa_id ? ` da empresa ${user.empresa_id}` : '') +
          `. Nenhum papel foi atribuído.`
      )
    }

    roleData.push({ user_id: user.id, papel_id: papel.id })
  }

  await UserPapel.createMany(roleData, { client: trx })
}

export async function removeRoleFromUser(user: User, roleName: string | string[]) {
  const roleSet = new Set(Array.isArray(roleName) ? roleName : [roleName])
  const escopo = user.empresa_id ? ESCOPO_PAPEL.empresa : ESCOPO_PAPEL.plataforma

  // Mesmo cuidado que em `giveRoleToUser`: sem filtrar por âmbito, revogar
  // "Vendedor" podia revogar o papel homónimo de outra empresa — que, não estando
  // atribuído a este utilizador, não faria nada; mas basta a lista de ids conter
  // o papel certo de outra empresa e um dia atingir alguém.
  const consulta = Papel.query().whereIn('nome', [...roleSet]).where('escopo', escopo)

  if (user.empresa_id) consulta.where('empresa_id', user.empresa_id)
  else consulta.whereNull('empresa_id')

  const roles = await consulta.select('id')

  if (roles.length === 0) return

  await UserPapel.query()
    .where('user_id', user.id)
    .whereIn(
      'papel_id',
      roles.map((r) => r.id)
    )
    .update({ deleted_at: new Date() })
}

/**
 *  Retorna permissões do user
 * @param user
 * @returns
 */
export async function getUserPermissions(user: User) {
  const consulta = Permissao.query()
    .distinct('permissao.id', 'permissao.nome')
    .join('papel_permissao', 'papel_permissao.permissao_id', 'permissao.id')
    .join('papel', 'papel.id', 'papel_permissao.papel_id')
    .join('user_papel', 'user_papel.papel_id', 'papel.id')
    .where('user_papel.user_id', user.id)
    .whereNull('user_papel.deleted_at')
    // Faltava, e é o mesmo problema já corrigido em `userHasPermission`: retirar
    // uma permissão a um papel faz soft delete, portanto sem isto a lista
    // continuava a incluí-la.
    .whereNull('papel_permissao.deleted_at')

  return apenasPapeisUtilizaveis(consulta, user)
}

/**
 * Retorna os papeis do user
 * @param user
 * @returns
 */

export async function getUserRoles(user: User) {
  const consulta = Papel.query()
    .distinct('papel.id', 'papel.nome', 'papel.escopo', 'papel.empresa_id')
    .join('user_papel', 'user_papel.papel_id', 'papel.id')
    .where('user_papel.user_id', user.id)
    .whereNull('user_papel.deleted_at')

  return apenasPapeisUtilizaveis(consulta, user)
}

export async function userHasPermission(user: User, permissionName: string) {
  const consulta = Permissao.query()
    .join('papel_permissao', 'papel_permissao.permissao_id', 'permissao.id')
    .join('papel', 'papel.id', 'papel_permissao.papel_id')
    .join('user_papel', 'user_papel.papel_id', 'papel.id')
    .where('user_papel.user_id', user.id)
    .where('permissao.nome', permissionName)
    .whereNull('user_papel.deleted_at')
    // `papel_permissao.deleted_at` faltava aqui: o recurso `papel_permissao` faz soft
    // delete (é o `destroy` da BaseRepository), portanto retirar uma permissão a um papel
    // pela API marcava a linha como apagada e NÃO revogava nada — a permissão continuava
    // a valer, sem nada a assinalar. Nenhuma linha estava nesse estado quando isto foi
    // corrigido, por isso não muda o acesso de ninguém hoje.
    .whereNull('papel_permissao.deleted_at')

  const permission = await apenasPapeisUtilizaveis(consulta, user).first()

  return !!permission
}

/**
 * Verificação por NOME de papel. Continua a existir, mas nunca para decidir se
 * alguém é da plataforma — para isso é `userHasPlatformRole()`.
 *
 * A diferença importa: com papéis por empresa, os nomes deixaram de ser únicos, e
 * um nome já não identifica um papel. `getUserRoles()` só devolve papéis que este
 * utilizador pode usar (os da sua empresa, ou de plataforma), portanto comparar
 * nomes aqui é seguro — mas é seguro por causa desse filtro, não por si.
 */
export async function userHasRole(user: User | string, roleName: string[]) {
  const roles = await getUserRoles(typeof user === 'string' ? await User.findOrFail(user) : user)
  return roles.some((role) => roleName.includes(role.nome))
}

/**
 * Gera uma senha temporária segura
 * Formato: 12 caracteres com números, letras maiúsculas e símbolos
 */
export const generateSecurePassword = (): string => {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const lowercase = 'abcdefghijklmnopqrstuvwxyz'
  const numbers = '0123456789'
  const symbols = '!@#$%^&*'

  const allChars = uppercase + lowercase + numbers + symbols
  let password = ''

  // Garantir pelo menos um de cada tipo
  password += uppercase[Math.floor(Math.random() * uppercase.length)]
  password += lowercase[Math.floor(Math.random() * lowercase.length)]
  password += numbers[Math.floor(Math.random() * numbers.length)]
  password += symbols[Math.floor(Math.random() * symbols.length)]

  // Preencher o resto aleatoriamente
  for (let i = password.length; i < 12; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)]
  }

  // Embaralhar
  return password
    .split('')
    .sort(() => Math.random() - 0.5)
    .join('')
}

/**
 * Constrói URL para definição de password
 * Idealmente, deveria incluir um token de reset seguro em vez da senha
 */
export const buildPasswordDefinitionUrl = async (companyAlias: string, userId: string) => {
  // Renomeada de `frontendBaseUrl`: o nome colidia com a função exportada com o
  // mesmo nome, mais abaixo neste ficheiro, e impedia reutilizá-la aqui.
  const paginaDeReposicao =
    env.get('APP_PASSWORD_DEFINITION_URL') ?? `${frontendBaseUrl()}/reset-password/:token`

  const resetToken = await generateResetToken(userId)

  const resetUrl = paginaDeReposicao.replace(':token', resetToken)

  // Preserve tenant context for frontend -> backend reset POST flow.
  return resetUrl.includes('?')
    ? `${resetUrl}&company_alias=${encodeURIComponent(companyAlias)}`
    : `${resetUrl}?company_alias=${encodeURIComponent(companyAlias)}`
}

/**
 * Base do frontend (Next), sem barra final.
 *
 * Estava duplicada dentro de `empresa_controller` (função privada `frontendUrl`) — ficou
 * aqui, ao lado de `buildPasswordDefinitionUrl`, porque a alteração de email de um
 * funcionário passou a precisar exactamente do mesmo link de activação.
 */
export const frontendBaseUrl = () => env.get('FRONTEND_URL').replace(/\/+$/, '')

/**
 * Link de activação/confirmação enviado por email.
 *
 * Aponta para a PÁGINA do frontend (`/verify/<token>`), nunca para a API — ver a nota em
 * `empresa_controller.activate_company`: os links antigos apontavam para `${APP_URL}/api/
 * verify/<token>` e o utilizador aterrava numa resposta crua da API.
 */
export const buildActivationUrl = (token?: string) => `${frontendBaseUrl()}/verify/${token ?? ''}`

/**
 * Gera um token de reset seguro (alternativa mais segura)
 * Use isso ao invés de enviar a senha no email
 */
export const generateResetToken = async (userId: string) => {
  const token = randomUUID()
  // Salvar no banco com expiração (ex: 24 horas)
  await VerificationTokenHash.create({
    user_id: userId,
    verification_token_public: token,
    verification_token_expires_at: DateTime.now().plus({ hours: 24 }),
  })
  return token
}



export const userBelongsToPOS = async (userId: string, posId: string) => {
  return await UserPos.query().where('user_id', userId).where('pos_id', posId).first()
}

// checar se o user  pertence a um pos e tem papel de gerente e/ou supervisor do pos
export const userIsGerenteOrSuperVisorOfPOS = async (userId: string, posId: string) => {
  return await userBelongsToPOS(userId, posId) && userHasRole(userId, ["Gerente", "Supervisor"])
}
