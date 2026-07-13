import Papel from '#models/auth/papel'
import papel_permissao from '#models/auth/papel_permissao'
import Permissao from '#models/auth/permissao'
import UserPapel from '#models/auth/user_papel'
import User from '#models/user'
import VerificationTokenHash from '#models/verification_token_hash'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { DateTime } from 'luxon'
import { randomUUID } from 'node:crypto'
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

export async function givePermissionsToRole(roleName: string, permissions: string[]) {
  const role = await Papel.findByOrFail('nome', roleName)

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

export async function removePermissionsFromRole(roleName: string, permissions: string[]) {
  const role = await Papel.findByOrFail('nome', roleName)

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
export async function giveRoleToUser(
  user: User,
  roleName: string | string[],
  trx?: TransactionClientContract
) {
  const roleSet = new Set(Array.isArray(roleName) ? roleName : [roleName])

  const roleData = await Promise.all(
    [...roleSet].map(async (role) => ({
      user_id: user.id,
      papel_id:
        (await Papel.query({ client: trx }).where('nome', role).select('id').first())?.id || '',
    }))
  )
  await UserPapel.createMany(roleData, { client: trx })
}

export async function removeRoleFromUser(user: User, roleName: string | string[]) {
  const roleSet = new Set(Array.isArray(roleName) ? roleName : [roleName])
  const roles = await Papel.query()
    .whereIn('nome', [...roleSet])
    .select('id')
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
  const permissions = await Permissao.query()
    .distinct('permissao.id', 'permissao.nome')
    .join('papel_permissao', 'papel_permissao.permissao_id', 'permissao.id')
    .join('papel', 'papel.id', 'papel_permissao.papel_id')
    .join('user_papel', 'user_papel.papel_id', 'papel.id')
    .where('user_papel.user_id', user.id)
    .whereNull('user_papel.deleted_at')

  return permissions
}

/**
 * Retorna os papeis do user
 * @param user
 * @returns
 */

export async function getUserRoles(user: User) {
  const roles = await Papel.query()
    .distinct('papel.id', 'papel.nome')
    .join('user_papel', 'user_papel.papel_id', 'papel.id')
    .where('user_papel.user_id', user.id)
    .whereNull('user_papel.deleted_at')

  return roles
}

export async function userHasPermission(user: User, permissionName: string) {
  const permission = await Permissao.query()
    .join('papel_permissao', 'papel_permissao.permissao_id', 'permissao.id')
    .join('papel', 'papel.id', 'papel_permissao.papel_id')
    .join('user_papel', 'user_papel.papel_id', 'papel.id')
    .where('user_papel.user_id', user.id)
    .where('permissao.nome', permissionName)
    .whereNull('user_papel.deleted_at')
    .first()

  return !!permission
}

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
  const baseUrl =
    process.env.APP_PASSWORD_DEFINITION_URL ||
    `http://localhost:3333/api/companyAlias/auth/reset-password/:token`

  const resetToken = await generateResetToken(userId)

  return baseUrl.replace('companyAlias', companyAlias).replace(':token', resetToken)
}

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
