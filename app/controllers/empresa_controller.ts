import type { HttpContext } from '@adonisjs/core/http'
import empresaService from '#services/empresa_service'
import {
  CreateCompanyWithUserAndStartACompanyDetalhes,
  ResendVerificationEmailValidator,
} from '#validators/empresa_validator'
import mail from '@adonisjs/mail/services/main'
import AccountActivationMail from '#mails/account_activation_mail'
import { buildActivationUrl, frontendBaseUrl } from '../helpers/Utils.js'

/**
 * Link de activação enviado por email.
 *
 * Aponta para o FRONTEND (`/verify/<token>`), não para a API. Antes apontava para
 * `${APP_URL}/api/verify/<token>`: o utilizador clicava e caía numa resposta crua da
 * API ou num redireccionamento para uma página que não existia. Agora aterra sempre
 * numa página com a identidade do produto, que trata da activação e mostra o
 * resultado — incluindo a opção de reenviar o email quando o link expirou.
 *
 * A construção do URL vive em `helpers/Utils.ts` (`buildActivationUrl`) desde que a
 * alteração de email de um funcionário passou a enviar o mesmo tipo de link — os dois
 * fluxos têm de gerar exactamente o mesmo formato.
 */
const buildVerifyUrl = buildActivationUrl
const frontendUrl = frontendBaseUrl

export default class empresasController {
  private service = new empresaService()
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
  async create_account_with_detalhes({ response, request }: HttpContext) {
    try {
      const payload = await request.validateUsing(CreateCompanyWithUserAndStartACompanyDetalhes)
      const result = await this.service.create_account_with_detalhes(payload)

      const verifyUrl = buildVerifyUrl(result?.token?.token)
      // 📧 email fora da transaction
      try {
        await mail.send(
          new AccountActivationMail(
            result?.user?.email!,
            payload.dados_nome,
            payload.empresa_nome,
            verifyUrl
          )
        )
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
  /**
   * Activação da conta a partir do token do email.
   *
   * Responde de duas formas, conforme quem chama:
   * - `Accept: application/json` (a página `/verify/<token>` do frontend, por fetch)
   *   → JSON, para a página mostrar o resultado com a identidade do produto.
   * - Navegação directa do browser (links de emails ANTIGOS, que apontavam para a API)
   *   → redirecciona para o frontend, para esses utilizadores não ficarem num beco.
   *
   * O destino do redireccionamento é `/verify` (que existe e já tem o formulário de
   * reenvio) e não `/onboarding/verified`, que nunca chegou a ser criado — era por
   * isso que clicar no link não levava a lado nenhum.
   */
  async activate_company({ params, response, request }: HttpContext) {
    try {
      const token = params.token

      const result = await this.service.activateCompany(token)
      const frontend = frontendUrl()
      const estado = result.success
        ? 'success'
        : result.message !== 'Token expirado'
          ? 'invalid'
          : 'expired'

      if (request.accepts(['html', 'json']) === 'json') {
        const payload = {
          data: { status: estado, empresa: (result as any).empresa ?? null },
          message: result.message,
          status: result.success ? 200 : 400,
        }
        return result.success ? response.ok(payload) : response.badRequest(payload)
      }

      return response.redirect(`${frontend}/verify?status=${estado}`)
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

      const verifyUrl = buildVerifyUrl(result.token.token)

      // Envio de email fora de transação
      try {
        await mail.send(
          new AccountActivationMail(result.user_email, result.user_nome, result.empresa_nome, verifyUrl)
        )
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
  // Suspender/reactivar uma empresa vive agora em `taesic-backoffice-api` — é uma
  // acção de plataforma. A APLICAÇÃO da suspensão fica aqui, que é onde o inquilino
  // vive: `ValidateCompanyAliasMiddleware`, a verificação no `login` e o filtro do
  // catálogo público. Os dois backends lêem e escrevem a mesma `empresa.suspensa_em`.
}
