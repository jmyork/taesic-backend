import type { HttpContext } from '@adonisjs/core/http'
import vendasService from '#services/vendas_service'
import { CloseVendaValidator, CreateVendaValidator, ShowVendaValidator, VendasQueryValidator } from '#validators/vendas_validator'
import { VendasQueryDTO } from '#dtos/vendas_dto'

export default class vendassController {
    private service = new vendasService()
    // ==================== INDEX ====================
    async index({ request, response, params }: HttpContext) {
        try {
            const querySantized = await VendasQueryValidator.validate(request.qs())
            const { page, limit, ...sanitezed } = querySantized

            const filter: VendasQueryDTO = {
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
            console.log(error)
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
    async store({ request, response, params, auth }: HttpContext) {
        try {
            const payload = await request.validateUsing(CreateVendaValidator)
            const data = await this.service.create({
                ...payload,
                venda_tipo: 'presencial',
                company_alias: params.company_alias,
                user_id: auth.user?.id!,
            })

            return response.created({
                data,
                message: 'Registro criado com sucesso',
                status: 201,
            })
        } catch (error: any) {

            if (error.code === 'E_VALIDATION_ERROR') {
                return response.badRequest({
                    data: null,
                    message: 'Dados inválidos',
                    errors: error.messages,
                    status: 400,
                })
            }
            if (error.code === 'USER_HAS_AN_OPEN_VENDA') {
                return response.badRequest({
                    data: null,
                    message: error.message,
                    status: error.status,
                })
            }

            if (error.code === 'USER_HAS_NO_OPEN_CAIXA') {
                return response.unprocessableEntity({
                    data: null,
                    message: 'Precisa de ter uma caixa aberta para iniciar uma venda.',
                    code: 'USER_HAS_NO_OPEN_CAIXA',
                    status: 422,
                })
            }

            // Erro de validação do Vine
            if (error.messages) {
                return response.badRequest({
                    data: null,
                    message: 'Dados inválidos',
                    errors: error.messages,
                    status: 400,
                })
            }

            console.error('Erro ao criar marca:', error)
            return response.internalServerError({
                data: null,
                message: 'Erro interno do servidor',
                status: 500,
            })
        }
    }
    // ==================== SHOW ====================
    async show({ params, response, auth }: HttpContext) {
        try {
            const payload = await ShowVendaValidator.validate(params)
            const data = await this.service.show({ ...payload, company_alias: params.company_alias, user_id: auth.user?.id! })

            return response.ok({
                data,
                message: 'Registro encontrado',
                status: 200,
            })
        } catch (error: any) {

            if (error.code === 'E_VALIDATION_ERROR') {
                return response.badRequest({
                    data: null,
                    message: 'Dados inválidos',
                    errors: error.messages,
                    status: 400,
                })
            }

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

    // ==================== CLOSE ====================
    // Erros de validação (VineJS), excepções de domínio (VendaSemPagamentoException,
    // VendaPagamentoIncompletoException, CupomInvalidoException, etc.) e "registo não
    // encontrado" (Lucid) já são traduzidos de forma consistente pelo handler global
    // (app/exceptions/handler.ts) — repetir `if (error.code === 'X') {...}` aqui só
    // escondia qualquer excepção nova (não listada) atrás de um 500 genérico.
    async close({ request, response, params }: HttpContext) {
        const payload = await CloseVendaValidator.validate({ ...params, ...request.body() })
        await this.service.close({ ...payload, company_alias: params.company_alias })

        return response.ok({
            data: null,
            message: 'Venda fechada com sucesso',
            status: 200,
        })
    }

    // ==================== CANCEL ====================
    async cancel({ response, params }: HttpContext) {
        try {
            const payload = await CloseVendaValidator.validate(params)
            await this.service.cancel({ ...payload, company_alias: params.company_alias })

            return response.ok({
                data: null,
                message: 'Venda anulada com sucesso',
                status: 200,
            })
        } catch (error: any) {

            if (error.code === 'E_VALIDATION_ERROR') {
                return response.badRequest({
                    data: null,
                    message: 'Dados inválidos',
                    errors: error.messages,
                    status: 400,
                })
            }

            if (error.code === 'VENDA_ALREADY_OPEN_OR_CLOSE') {
                return response.badRequest({
                    data: null,
                    message: 'Só é possível anular uma venda que ainda esteja aberta',
                    status: error.status,
                })
            }

            if (error.code === 'E_ROW_NOT_FOUND') {
                return response.notFound({
                    data: null,
                    message: 'Registro não encontrado',
                    status: 404,
                })
            }

            console.error('Erro ao anular venda:', error)
            return response.internalServerError({
                data: null,
                message: 'Erro interno do servidor',
                status: 500,
            })
        }
    }

    // ==================== DESTROY ====================
    // async destroy({ params, response }: HttpContext) {
    //     try {
    //         await this.service.delete(params.id, params.company_alias)

    //         return response.ok({
    //             data: null,
    //             message: 'Registro removido/recuperado com sucesso',
    //             status: 200,
    //         })
    //     } catch (error: any) {
    //         // Registro não encontrado
    //         if (error.code === 'E_ROW_NOT_FOUND') {
    //             return response.notFound({
    //                 data: null,
    //                 message: 'Registro não encontrado para remoção',
    //                 status: 404,
    //             })
    //         }

    //         console.error('Erro ao remover marca:', error)
    //         return response.internalServerError({
    //             data: null,
    //             message: 'Erro interno do servidor',
    //             status: 500,
    //         })
    //     }
    // }
}
