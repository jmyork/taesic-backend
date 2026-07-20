import User from '#models/user'
import {
  ForgotPasswordDTO,
  ListUserDTO,
  LoginDTO,
  logoutDTO,
  RegisterDTO,
  resetPasswordDTO,
  ShowUserDetailsDTO,
  ShowUserDTO,
} from '#dtos/auth_dto'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import hash from '@adonisjs/core/services/hash'
import Empresa from '#models/empresa'
import {
  buildPasswordDefinitionUrl,
  generateSecurePassword,
  getUserPermissions,
  getUserRoles,
  giveRoleToUser,
} from '../helpers/Utils.js'
import mail from '@adonisjs/mail/services/main'
import PasswordDefinitionMail from '#mails/password_definition_mail'
import ForgotPasswordMail from '#mails/forgot_password_mail'
import { Exception } from '@adonisjs/core/exceptions'
import db from '@adonisjs/lucid/services/db'
import VerificationTokenHash from '#models/verification_token_hash'
import InvalidTokenException from '#exceptions/invalid_token_exception'

export default class authRepository {
  baseQuery(trx?: TransactionClientContract) {
    const query = User.query({ client: trx })
    return query
  }

  async login(data: LoginDTO) {
    const user = await db
      .from('user')
      .where((query) => {
        query.where('user.email', data.uid).orWhere('user.username', data.uid)
      })
      .join('verification_token_hash', 'verification_token_hash.user_id', 'user.id')
      .if(data.company_alias, (query) => {
        if (data.company_alias) {
          query.join('empresa', 'empresa.id', 'user.empresa_id')
          query.where('empresa.company_alias', data.company_alias)
            .select('empresa.company_alias as company_alias')
        }
      })
      // .where('empresa.company_alias', data.company_alias ?? '')
      .where('verification_token_hash.verified', true)
      .whereNull('user.deleted_at')
      .select(['user.id', 'user.password'])
      .first()

    if (!user) {
      throw new Error('Credenciais inválidas')
    }

    const isValidPassword = await hash.verify(user.password, data.password)

    if (!isValidPassword) {
      throw new Error('Credenciais inválidas')
    }
    const userModel = await User.findOrFail(user.id)
    const token = await User.accessTokens.create(userModel)

    return {
      type: 'bearer',
      value: token.value!.release(),
      company_alias: user.company_alias,
    }
  }

  async logout(auth: logoutDTO) {
    const user = await User.findOrFail(auth.userId)
    const token = auth.token_identifier
    await User.accessTokens.delete(user, token)
    return { message: 'Logout realizado com sucesso' }
  }

  async create(data: RegisterDTO) {
    try {
      // 1. Validar empresa
      const empresa = await Empresa.findBy('company_alias', data.company_alias)

      if (!empresa) {
        throw new Error(`Empresa com alias "${data.company_alias}" não encontrada`)
      }

      // 2. Separar dados
      const { company_alias, papel, ...dataSemAlias } = data

      // 3. Gerar senha temporária segura
      const temporaryPassword = generateSecurePassword()

      // 4. Criar usuário
      const user = await User.create({
        ...dataSemAlias,
        empresa_id: empresa.id,
        password: temporaryPassword,
      })
      // 5. Atribuir papel/role
      await giveRoleToUser(user, papel)
      // 6. Enviar email
      try {
        const password_definition_url = await buildPasswordDefinitionUrl(company_alias, user.id)

        await mail.send(
          new PasswordDefinitionMail(
            user.email!,
            user.username!,
            empresa.nome || empresa.company_alias,
            temporaryPassword,
            password_definition_url
          )
        )
      } catch (emailErr) {
        throw new Exception('Erro ao criar conta')
      }

      return user
    } catch (error) {
      throw new Exception('Erro ao criar conta')
    }
  }

  async findByEmail(email: string) {
    return await this.baseQuery().where('email', email).first()
  }

  // async sendResetPasswordEmail(user: User) {
  //   // Aqui você pode implementar a lógica para enviar um email de recuperação de senha
  // }

  // async verifyResetToken(user: User, token: string) {
  //   // Aqui você pode implementar a lógica para verificar se o token de recuperação é válido
  //   return token === 'valid-reset-token'
  // }

  async updatePassword(user: User, newPassword: string) {
    user.password = newPassword
    await user.save()
  }

  findById(id: string) {
    return this.baseQuery().where('id', id).first()
  }

  async resetPassword(data: resetPasswordDTO) {
    // 1. Procurar o token e já carregar o utilizador (se possível) para evitar múltiplas queries
    const token = await VerificationTokenHash.query()
      .where('verification_token_public', data.token)
      .first()

    // 2. Validações iniciais (Token existe e é válido)
    if (!token || token.verified || token.deletedAt) {
      throw new InvalidTokenException('Token inválido ou expirado', { code: '400' })
    }

    // 3. Buscar o utilizador
    const user = await User.find(token.user_id)
    if (!user) {
      throw new InvalidTokenException('Utilizador não encontrado', { code: '404' })
    }
    // 4. (Opcional) Validar se o e-mail enviado no DTO coincide com o e-mail do utilizador do token
    // Isso evita que alguém use um token de um e-mail para resetar a senha de outro.
    if (data.email && user.email !== data.email) {
      throw new InvalidTokenException('Este token não pertence a este e-mail', { code: '400' })
    }

    // 5. Atualizar dados numa transação (opcional, mas recomendado)
    user.password = data.password
    token.verified = true

    await user.save()
    await token.save()

    return user
  }

  async forgot_password(data: ForgotPasswordDTO) {
    const user = await User.findBy('email', data.email)
    const empresa = await Empresa.findBy('company_alias', data.company_alias)

    // Enviar o email de recuperação
    const password_definition_url = await buildPasswordDefinitionUrl(
      empresa?.company_alias!,
      user?.id!
    )
    await mail.send(new ForgotPasswordMail(user?.email!, user?.username!, password_definition_url))

    await VerificationTokenHash.create({
      user_id: user?.id!,
      purpose: 'password_recovery',
    })
    return user
  }

  async list(data: ListUserDTO) {
    // Começa com a query base
    const query = this.baseQuery()
      .join('empresa', 'empresa.id', 'user.empresa_id')
      .where('empresa.company_alias', data.company_alias ?? '')
    // Filtro de pesquisa textual (OR entre username e email)
    if (data.query) {
      const search = `%${data.query}%`
      query.where((q) => {
        q.where('username', 'like', search).orWhere('email', 'like', search)
      })
    }
    // Filtros de data (tratados como data de criação, exclusão, atualização)
    // NOTA: se precisar de intervalos, adapte para '>=', '<='
    if (data.created_at) {
      query.where('created_at', '>=', data.created_at)
    }
    if (data.updated_at) {
      query.where('updated_at', '>=', data.updated_at)
    }
    if (data.deleted_at !== undefined) {
      // Se quiser buscar registos onde deleted_at tem um valor específico
      // ou usar isNull/notNull, ajuste conforme a necessidade
      query.where('deleted_at', data.deleted_at)
    }

    // Executa e retorna os resultados
    return await query
      .select([
        'user.id',
        'user.username',
        'user.email',
        'user.empresa_id',
        'user.created_at',
        'user.updated_at',
        'user.deleted_at',
      ])
      .paginate(data.page ?? 1, data.limit ?? 10)
  }

  // mostrar dados de um user
  async show(data: ShowUserDTO) {
    const query = this.baseQuery()
      .join('empresa', 'empresa.id', 'user.empresa_id')
      .where('user.id', data.user_id)

    if (data.company_alias) {
      query.where('empresa.company_alias', data.company_alias)
    }

    await query.firstOrFail()

    const user = await User.findOrFail(data.user_id)

    const roles = await getUserRoles(user)
    const permissions = await getUserPermissions(user)

    return {
      id: user.id,
      nome: user.username,
      email: user.email,

      roles: roles.map((r) => ({
        id: r.id,
        nome: r.nome,
      })),

      permissions: permissions.map((p) => ({
        id: p.id,
        nome: p.nome,
      })),
    }
  }

  async details(data: ShowUserDetailsDTO) {
    const user = await User.findOrFail(data.user_id)

    const roles = await getUserRoles(user)
    const permissions = await getUserPermissions(user)

    return {
      id: user.id,
      nome: user.username,
      email: user.email,
      roles: roles.map((r) => ({
        id: r.id,
        nome: r.nome,
      })),

      permissions: permissions.map((p) => ({
        id: p.id,
        nome: p.nome,
      })),
    }
  }
}
