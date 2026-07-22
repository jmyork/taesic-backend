import type { HttpContext } from '@adonisjs/core/http'
import authService from '#services/auth_service'
import {
  UserLoginValidator,
  UsersCreateValidator,
  UserForgotPasswordValidator,
  UserResetPasswordValidator,
  QsValidator,
} from '#validators/auth_validator'
import User from '#models/user'
import InvalidTokenException from '#exceptions/invalid_token_exception'
import { logSecurityEvent } from '../helpers/security_logger.js'

export default class AuthController {
  private service = new authService()

  async login(ctx: HttpContext) {
    const { request, response } = ctx
    try {
      const data = await request.validateUsing(UserLoginValidator)
      const loginData = await this.service.login(data)
      logSecurityEvent('login_succeeded', { uid: data.uid, company_alias: data.company_alias }, ctx)
      return response.ok({ data: loginData, message: 'Login realizado com sucesso' })
    } catch (error: any) {
      if (error.message === 'Credenciais inválidas') {
        logSecurityEvent(
          'login_failed',
          { uid: request.input('uid'), company_alias: request.input('company_alias') },
          ctx
        )
        return response.unauthorized({ message: 'Credenciais inválidas' })
      }

      if (error.messages) {
        return response.badRequest({
          data: null,
          message: 'Dados inválidos',
          errors: error.messages,
          status: 400,
        })
      }
      return response.badRequest({ message: error.message }) // Retorna uma mensagem de erro detalhada
    }
  }

  async logout({ response, auth }: HttpContext) {
    try {
      const user = await User.find(auth.user?.id)

      await this.service.logout({
        userId: auth.user?.id!,
        token_identifier: Number(
          (await User.accessTokens.find(user!, Number(auth.user?.currentAccessToken?.identifier)))
            ?.identifier
        ),
      })
      return response.noContent() // Retorna uma resposta sem conteúdo (logout bem-sucedido)
    } catch (error: any) {
      return response.badRequest({ message: error.message }) // Retorna uma mensagem de erro detalhada
    }
  }

  async register({ request, response, params }: HttpContext) {
    try {
      const payload = await request.validateUsing(UsersCreateValidator)
      const data = await this.service.register({ ...payload, company_alias: params.company_alias })
      return response.created({
        data,
        message: 'Registro criado com sucesso',
        status: 201,
      })
    } catch (error: any) {
      if (error.messages) {
        return response.badRequest({
          data: null,
          message: 'Dados inválidos',
          errors: error.messages,
          status: 400,
        })
      }
      console.error('Erro ao realizar registro:', error)
      return response.internalServerError({
        data: null,
        message: 'Erro interno do servidor',
        status: 500,
      })
    }
  }

  async reset_password({ request, response, params }: HttpContext) {
    try {
      const payload = await request.validateUsing(UserResetPasswordValidator)
      const user = await this.service.resetPassword({ ...payload, token: params.token })
      return response.ok({
        data: user,
        message: 'Password Reseted Successfully!',
      })
    } catch (error: any) {
      if (error instanceof InvalidTokenException) {
        return response.status(error.status || 400).send({
          data: null,
          message: error.message,
          status: error.status,
        })
      }

      if (error.messages) {
        return response.badRequest({
          data: null,
          message: 'Dados inválidos',
          errors: error.messages,
          status: 400,
        })
      }

      console.error('Erro ao solicitar recuperação de senha:', error)
      return response.internalServerError({
        data: null,
        message: 'Erro interno do servidor',
        status: 500,
      })
    }
  }

  async forgot_password({ request, response, params }: HttpContext) {
    try {
      const payload = await request.validateUsing(UserForgotPasswordValidator)
      await this.service.forgot_password({ ...payload, company_alias: params.company_alias })
      return response.ok({
        data: null,
        message: 'Verifique o seu email para recuperação.',
        status: 200,
      })
    } catch (error: any) {
      if (error.messages) {
        return response.badRequest({
          data: null,
          message: 'Dados inválidos',
          errors: error.messages,
          status: 400,
        })
      }
      console.error('Erro ao resetar senha:', error)
      return response.internalServerError({
        data: null,
        message: 'Erro interno do servidor',
        status: 500,
      })
    }
  }

  // listar todos os users
  async index({ request, response, params }: HttpContext) {
    try {
      const qs = await QsValidator.validate(request.qs())
      const users = await this.service.list({ ...qs, company_alias: params.company_alias })
      return response.ok({
        data: users,
        message: 'Lista de usuários retornada com sucesso!',
        status: 200,
      })
    } catch (error) {
      //console.log(error)
      return response.internalServerError({
        data: null,
        message: 'Erro interno do servidor',
        status: 500,
      })
    }
  }
  // desabilitar todos os users
  async show({ response, params }: HttpContext) {
    try {
      const users = await this.service.show({
        company_alias: params.company_alias,
        user_id: params.user_id!,
      })

      return response.ok({
        data: users,
        message: 'Lista de usuários retornada com sucesso!',
        status: 200,
      })
    } catch (error: any) {
      // Captura erro de registro não encontrado (Lucid)
      if (error.code === 'E_ROW_NOT_FOUND') {
        return response.notFound({
          data: null,
          message: 'Registro não encontrado',
          status: 404,
        })
      }
      return response.internalServerError({
        data: null,
        message: 'Erro interno do servidor',
        status: 500,
      })
    }
  }
  // ver os detalhes de um user
  async details({ response, auth }: HttpContext) {
    try {
      const user_id = auth.user?.id!
      const user = await this.service.details({ user_id })
      return response.ok({
        data: user,
        message: 'Detalhes do usuário retornado com sucesso!',
        status: 200,
      })
    } catch (error) {
      console.log(error)
      return response.internalServerError({
        data: null,
        message: 'Erro interno do servidor',
        status: 500,
      })
    }
  }
}
