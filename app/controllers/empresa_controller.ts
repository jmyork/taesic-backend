import type { HttpContext } from '@adonisjs/core/http'
import empresaService from '#services/empresa_service'
import {
  createempresaValidator,
  updateempresaValidator,
  CreateCompanyWithUserAndStartACompany,
  CreateCompanyWithUserAndStartACompanyDetalhes,
  ResendVerificationEmailValidator,
} from '#validators/empresa_validator'
import authService from '#services/auth_service'
import { getCompanyDetails } from '../helpers/Utils.js'
import mail from '@adonisjs/mail/services/main'
import VerificationTokenHashService from '#services/verification_token_hash_service'
import db from '@adonisjs/lucid/services/db'
import env from '#start/env'

export default class empresasController {
  private service = new empresaService()
  private authService = new authService()
  private verificationAuthTokenService = new VerificationTokenHashService()
  // ==================== INDEX ====================
  async index({ request, response }: HttpContext) {
    try {
      const page = request.input('page', 1)
      const limit = request.input('limit', 20)

      // const deleted = request.input('deleted', null)

      const data = await this.service.list(page, limit)

      return response.ok({
        data,
        message: 'Listagem realizada com sucesso',
        status: 200,
      })
    } catch (error) {
      console.error('Erro ao listar empresa:', error)
      return response.internalServerError({
        data: null,
        message: 'Erro interno do servidor',
        status: 500,
      })
    }
  }

  // ==================== STORE ====================
  // async store({ request, response, auth }: HttpContext) {
  //   try {
  //     const payload = await request.validateUsing(createempresaValidator)
  //     const data = await this.service.create({ ...payload, user_id: auth.user?.id! })

  //     return response.created({
  //       data,
  //       message: 'Registro criado com sucesso',
  //       status: 201,
  //     })
  //   } catch (error: any) {
  //     // Erro de validação do Vine
  //     if (error.messages) {
  //       return response.badRequest({
  //         data: null,
  //         message: 'Dados inválidos',
  //         errors: error.messages,
  //         status: 400,
  //       })
  //     }

  //     console.error('Erro ao criar empresa:', error)
  //     return response.internalServerError({
  //       data: null,
  //       message: 'Erro interno do servidor',
  //       status: 500,
  //     })
  //   }
  // }

  // ==================== SHOW ====================
  async show({ params, response }: HttpContext) {
    try {
      const data = await this.service.show(params.id)

      return response.ok({
        data,
        message: 'Registro encontrado',
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

      console.error('Erro ao buscar empresa:', error)
      return response.internalServerError({
        data: null,
        message: 'Erro interno do servidor',
        status: 500,
      })
    }
  }

  // ==================== UPDATE ====================
  // async update({ params, request, response, auth }: HttpContext) {
  //   try {
  //     const payload = await request.validateUsing(updateempresaValidator)
  //     const data = await this.service.update(params.id, { ...payload, user_id: auth.user?.id! })

  //     return response.ok({
  //       data,
  //       message: 'Registro atualizado com sucesso',
  //       status: 200,
  //     })
  //   } catch (error: any) {
  //     // Erro de validação
  //     if (error.messages) {
  //       return response.badRequest({
  //         data: null,
  //         message: 'Dados inválidos',
  //         errors: error.messages,
  //         status: 400,
  //       })
  //     }

  //     // Registro não encontrado
  //     if (error.code === 'E_ROW_NOT_FOUND') {
  //       return response.notFound({
  //         data: null,
  //         message: 'Registro não encontrado para atualização',
  //         status: 404,
  //       })
  //     }

  //     console.error('Erro ao atualizar empresa:', error)
  //     return response.internalServerError({
  //       data: null,
  //       message: 'Erro interno do servidor',
  //       status: 500,
  //     })
  //   }
  // }

  // ==================== DESTROY ====================
  async destroy({ params, response }: HttpContext) {
    try {
      await this.service.delete(params.id)

      return response.ok({
        data: null,
        message: 'Registro removido/recuperado com sucesso',
        status: 200,
      })
    } catch (error: any) {
      // Registro não encontrado
      if (error.code === 'E_ROW_NOT_FOUND') {
        return response.notFound({
          data: null,
          message: 'Registro não encontrado para remoção',
          status: 404,
        })
      }

      console.error('Erro ao remover empresa:', error)
      return response.internalServerError({
        data: null,
        message: 'Erro interno do servidor',
        status: 500,
      })
    }
  }

  // ===================== CREATE COMPANY AND USER ================
  // async create_account({ response, request }: HttpContext) {
  //   try {
  //     const payload = await request.validateUsing(CreateCompanyWithUserAndStartACompany)

  //     const companyDetails = await getCompanyDetails(payload.empresa.nif)
  //     const requestMessage: string = companyDetails.message

  //     if (
  //       requestMessage.toLowerCase().includes('demorou') ||
  //       requestMessage.toLowerCase().includes('tente novamente') ||
  //       !requestMessage
  //     ) {
  //       return response.badRequest({
  //         data: null,
  //         message: 'Não foi possível validar o NIF no momento. Tente novamente.',
  //       })
  //     }

  //     if (!companyDetails || !companyDetails.name) {
  //       return response.badRequest({
  //         data: null,
  //         message: 'NIF inválido ou empresa não encontrada',
  //       })
  //     }

  //     // 🔒 TRANSAÇÃO
  //     const result = await db.transaction(async (trx) => {
  //       const user = await this.authService.register(payload.user, trx)

  //       const empresa = await this.service.create(
  //         {
  //           nome: companyDetails.nome,
  //           nif: payload.empresa.nif,
  //           user_id: user.id,
  //           tipo: payload.empresa.tipo, // não esquece isso

  //           localizacao: payload.empresa.localizacao,
  //           contacto: payload.empresa.contacto,
  //           company_alias: payload.empresa.company_alias,

  //           status: false,
  //           inadiplente: companyDetails?.data?.inadimplente ?? false,
  //           regime_iva: !!companyDetails?.data?.regime_iva,
  //         },
  //         trx
  //       )

  //       const token = await this.verificationAuthTokenService.createToken(
  //         {
  //           user_id: user.id,
  //           empresa_id: empresa.id,
  //           purpose: 'account_activation',
  //         },
  //         trx
  //       )

  //       return { user, empresa, token }
  //     })

  //     const verifyUrl = `${
  //       process.env.APP_URL || 'http://localhost:3333'
  //     }/verify/${result.token.token}`

  //     // 📧 email fora da transaction
  //     try {
  //       await mail.send((message) => {
  //         message
  //           .to(result.user.email)
  //           .from('noreply.alaragest@bknkv.com')
  //           .subject('Welcome to our app | Activation Email')
  //           .htmlView('emails/welcome', {
  //             user: result.user,
  //             verifyUrl,
  //           })
  //       })
  //     } catch (err) {
  //       console.error('Erro ao enviar email:', err)
  //     }

  //     return response.created({
  //       data: {
  //         user: result.user,
  //         empresa: result.empresa,
  //       },
  //       message: 'Conta criada com sucesso',
  //       status: 201,
  //     })
  //   } catch (error: any) {
  //     if (error.messages) {
  //       return response.badRequest({
  //         data: null,
  //         message: 'Dados inválidos',
  //         errors: error.messages,
  //       })
  //     }

  //     console.error('Erro ao criar conta:', error)

  //     return response.internalServerError({
  //       data: null,
  //       message: 'Erro interno do servidor',
  //     })
  //   }
  // }

  async create_account_with_detalhes({ response, request }: HttpContext) {
    try {
      const payload = await request.validateUsing(CreateCompanyWithUserAndStartACompanyDetalhes)
      const result = await this.service.create_account_with_detalhes(payload)

      const verifyUrl = `${process.env.APP_URL || 'http://localhost:3333'}/api/verify/${result?.token?.token}`
      // 📧 email fora da transaction
      try {
        await mail.send((message) => {
          message
            .to(result?.user?.email!)
            .from('noreply.alaragest@bknkv.com')
            .subject('Welcome to our app | Activation Email')
            .htmlView('emails/account_activation', {
              user: {
                firstName: payload.dados_nome,
                email: payload.user_email,
                companyName: payload.empresa_nome,
              },
              verifyUrl,
            })
        })
      } catch (err) {
        console.error('Erro ao enviar email:', err)
      }

      return response.created({
        data: {
          user: result?.user,
          empresa: result?.empresa,
        },
        message: 'Conta criada com sucesso',
        status: 201,
      })
    } catch (error: any) {
      if (error.messages) {
        return response.badRequest({
          data: null,
          message: 'Dados inválidos',
          errors: error.messages,
        })
      }

      console.error('Erro ao criar conta:', error)

      return response.internalServerError({
        data: null,
        message: 'Erro interno do servidor',
      })
    }
  }

  // ===================== ACTIVATE COMPANY ================
  async activate_company({ params, response }: HttpContext) {
    try {
      const token = params.token

      const result = await this.service.activateCompany(token)
      const frontend = env.get('FRONTEND_URL', 'http://localhost:5173')
      if (result.success) {
        return response.redirect(`${frontend}/onboarding/verified?status=success`)
      } else if (result.message !== 'Token expirado') {
        return response.redirect(`${frontend}/onboarding/verified?status=invalid`)
      } else return response.redirect(`${frontend}/onboarding/verified?status=expired`)
    } catch (error: any) {
      console.error('Erro ao ativar empresa:', error)

      return response.badRequest({
        data: null,
        message: error.message || 'Erro ao ativar empresa',
        status: 400,
      })
    }
  }
  // ===================== ACTIVATE COMPANY ================
  async resend_verification_email({ request, response }: HttpContext) {
    try {
      const payload = await request.validateUsing(ResendVerificationEmailValidator)
      const result = await this.service.ResendVerificationEmail(payload)

      // Conta já verificada
      if (result === false || result === null) {
        return response.badRequest({
          data: null,
          message:
            'Company already activated. In case of password lost, please recover your password.',
        })
      }

      const verifyUrl = `${process.env.APP_URL || 'http://localhost:3333'}/api/verify/${result.token.token}`

      console.log(result)
      // Envio de email fora de transação
      try {
        await mail.send((message) => {
          message
            .to(result.user_email)
            .from('noreply.alaragest@bknkv.com')
            .subject('Welcome to our app | Activation Email')
            .htmlView('emails/account_activation', {
              user: {
                firstName: result.user_nome,
                email: result.user_email,
                companyName: result.empresa_nome,
              },
              verifyUrl,
            })
        })
      } catch (err) {
        console.error('Erro ao enviar email:', err)
      }

      return response.created({
        data: {
          user: result.user_nome,
          empresa: result.empresa_nome,
        },
        message: 'Token de verificação enviado com sucesso',
        status: 200,
      })
    } catch (error: any) {
      if (error.messages) {
        return response.badRequest({
          data: null,
          message: 'Dados inválidos',
          errors: error.messages,
        })
      }

      console.error('Erro ao reenviar token:', error)
      return response.internalServerError({
        data: null,
        message: 'Erro interno do servidor',
      })
    }
  }
}
