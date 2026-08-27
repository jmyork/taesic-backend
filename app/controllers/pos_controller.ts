import type { HttpContext } from '@adonisjs/core/http'
import posService from '#services/pos_service'
import {
  createposValidator,
  updateposValidator,
  PosQueryValidator,
} from '#validators/pos_validator'
import { PosQueryDTO } from '#dtos/pos_dto'

export default class possController {
  private service = new posService()

  // ==================== INDEX ====================
  async index({ request, response, params }: HttpContext) {
    try {
      const querySantized = await PosQueryValidator.validate(request.qs())
      const { page, limit, ...sanitezed } = querySantized

      const filter: PosQueryDTO = {
        ...sanitezed,
        empresa_id: params.company_alias ? null : request.input('empresa_id'),
        company_alias: params.company_alias,
      }
      const data = await this.service.list(page ?? 1, limit ?? 10, filter)
      return response.ok({
        data,
        message: 'Listagem realizada com sucesso',
        status: 200,
      })
    } catch (error: any) {
      //console.log(error)
      if (error.messages) {
        return response.badRequest({
          data: null,
          message: 'Dados inválidos',
          errors: error.messages,
          status: 400,
        })
      }
      // console.error('Erro ao listar marca:', error)
      return response.internalServerError({
        data: null,
        message: 'Erro interno do servidor',
        status: 500,
      })
    }
  }

  // ==================== STORE ====================
  /**
   * Cria um posto de atendimento.
   *
   * **Sem try/catch**, como o `destroy`. O `catch` genérico devolvia 500 a tudo o que não
   * fosse erro de validação — incluindo a `LimiteDoPlanoException` (402), que diz ao dono
   * quantos postos o plano permite e o que fazer. Verificado por HTTP: era um "Erro
   * interno do servidor" para uma regra de negócio perfeitamente explicável.
   *
   * `app/exceptions/handler.ts` traduz as duas coisas — os erros do VineJS em 400 com os
   * campos, e qualquer `Exception` de domínio no seu próprio status.
   */
  async store({ request, response, params }: HttpContext) {
    const payload = await request.validateUsing(createposValidator)
    const data = await this.service.create({ ...payload, company_alias: params.company_alias })

    return response.created({
      data,
      message: 'Registro criado com sucesso',
      status: 201,
    })
  }
  // ==================== SHOW ====================
  async show({ params, response }: HttpContext) {
    try {
      const data = await this.service.show(params.id, params.company_alias)

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

      console.error('Erro ao buscar marca:', error)
      return response.internalServerError({
        data: null,
        message: 'Erro interno do servidor',
        status: 500,
      })
    }
  }
  // ==================== UPDATE ====================
  async update({ params, request, response }: HttpContext) {
    try {
      const payload = await request.validateUsing(updateposValidator, {
        meta: {
          id: params.id,
        },
      })
      const data = await this.service.update(params.id, payload, params.company_alias)

      return response.ok({
        data,
        message: 'Registro atualizado com sucesso',
        status: 200,
      })
    } catch (error: any) {
      // Erro de validação
      if (error.messages) {
        return response.badRequest({
          data: null,
          message: 'Dados inválidos',
          errors: error.messages,
          status: 400,
        })
      }

      // Registro não encontrado
      if (error.code === 'E_ROW_NOT_FOUND') {
        return response.notFound({
          data: null,
          message: 'Registro não encontrado para atualização',
          status: 404,
        })
      }

      console.error('Erro ao atualizar marca:', error)
      return response.internalServerError({
        data: null,
        message: 'Erro interno do servidor',
        status: 500,
      })
    }
  }
  // ==================== MEU (pos do user logado) ====================
  async meusPos({ auth, request }: HttpContext) {
    const filter = await PosQueryValidator.validate(request.qs())
    const data = await this.service.listByUser(auth.user?.id!, filter)
    return { data, message: 'Listagem realizada com sucesso', status: 200 }
  }

  // ==================== DESTROY ====================
  /**
   * Desactiva/reactiva um posto de atendimento.
   *
   * **Sem try/catch**, ao contrário das outras acções deste controller (que ainda seguem o
   * padrão antigo). O `catch` genérico apanhava tudo o que não fosse `E_ROW_NOT_FOUND` e
   * respondia 500 "Erro interno do servidor" — incluindo a `UltimoPostoException`, que é
   * uma regra de negócio com uma explicação para dar a quem carregou no botão. Quem
   * tentasse desactivar o único posto da empresa via um "a aplicação avariou" em vez de
   * "crie outro posto antes de desactivar este".
   *
   * É a mesma classe de bug já documentada no CLAUDE.md (7.4 e 7.17): um try/catch que
   * devolve sempre 500 não protege nada — apaga a distinção entre "não pode" e "rebentou".
   * `app/exceptions/handler.ts` traduz as duas coisas: `E_ROW_NOT_FOUND` em 404, e
   * qualquer `Exception` de domínio no seu próprio status (409, aqui).
   */
  async destroy({ params }: HttpContext) {
    await this.service.delete(params.id, params.company_alias)

    return {
      data: null,
      message: 'Registro removido/recuperado com sucesso',
      status: 200,
    }
  }
}
