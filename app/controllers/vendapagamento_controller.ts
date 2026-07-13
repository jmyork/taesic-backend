import type { HttpContext } from '@adonisjs/core/http'
import vendapagamentoService from '#services/vendapagamento_service'
import { createvendapagamentoValidator, updatevendapagamentoValidator } from '#validators/vendapagamento_validator'

export default class vendapagamentosController {
    private service = new vendapagamentoService()

    // ==================== INDEX ====================
    async index({ request, params, response,route }: HttpContext) {
        try {
            const page = request.input('page', 1)
            const limit = request.input('limit', 20)
            const deleted = request.input('deleted', null)
            const data = await this.service.list(page, limit, deleted, params.company_alias)
            return response.ok({
                data,
                message: 'Listagem realizada com sucesso',
                status: 200
            })
        } catch (error) {
            console.error('Erro ao listar vendapagamento:', error)
            return response.internalServerError({
                data: null,
                message: 'Erro interno do servidor',
                status: 500
            })
        }
    }

    // ==================== STORE ====================
    async store({ request, response,route }: HttpContext) {
        try {
            const payload = await request.validateUsing(createvendapagamentoValidator)
            const data = await this.service.create(payload)

            return response.created({
                data,
                message: 'Registro criado com sucesso',
                status: 201
            })
        } catch (error: any) {
            // Erro de validação do Vine
            if (error.messages) {
                return response.badRequest({
                    data: null,
                    message: 'Dados inválidos',
                    errors: error.messages,
                    status: 400
                })
            }

            console.error('Erro ao criar vendapagamento:', error)
            return response.internalServerError({
                data: null,
                message: 'Erro interno do servidor',
                status: 500
            })
        }
    }

    // ==================== SHOW ====================
    async show({ params, response,route }: HttpContext) {
        try {
            const data = await this.service.show(params.id, params.company_alias)

            return response.ok({
                data,
                message: 'Registro encontrado',
                status: 200
            })
        } catch (error: any) {
            // Captura erro de registro não encontrado (Lucid)
            if (error.code === 'E_ROW_NOT_FOUND') {
                return response.notFound({
                    data: null,
                    message: 'Registro não encontrado',
                    status: 404
                })
            }

            console.error('Erro ao buscar vendapagamento:', error)
            return response.internalServerError({
                data: null,
                message: 'Erro interno do servidor',
                status: 500
            })
        }
    }

    // ==================== UPDATE ====================
    async update({ params, request, response,route }: HttpContext) {
        try {
            const payload = await request.validateUsing(updatevendapagamentoValidator,{
                meta:{
                id:params.id
                }
            })
            const data = await this.service.update(params.id, payload, params.company_alias)

            return response.ok({
                data,
                message: 'Registro atualizado com sucesso',
                status: 200
            })
        } catch (error: any) {
            // Erro de validação
            if (error.messages) {
                return response.badRequest({
                    data: null,
                    message: 'Dados inválidos',
                    errors: error.messages,
                    status: 400
                })
            }

            // Registro não encontrado
            if (error.code === 'E_ROW_NOT_FOUND') {
                return response.notFound({
                    data: null,
                    message: 'Registro não encontrado para atualização',
                    status: 404
                })
            }

            console.error('Erro ao atualizar vendapagamento:', error)
            return response.internalServerError({
                data: null,
                message: 'Erro interno do servidor',
                status: 500
            })
        }
    }

    // ==================== DESTROY ====================
    async destroy({ params, response,route }: HttpContext) {
        try {
            await this.service.delete(params.id, params.company_alias)

            return response.ok({
                data: null,
                message: 'Registro removido/recuperado com sucesso',
                status: 200
            })
        } catch (error: any) {
            // Registro não encontrado
            if (error.code === 'E_ROW_NOT_FOUND') {
                return response.notFound({
                    data: null,
                    message: 'Registro não encontrado para remoção',
                    status: 404
                })
            }

            console.error('Erro ao remover vendapagamento:', error)
            return response.internalServerError({
                data: null,
                message: 'Erro interno do servidor',
                status: 500
            })
        }
    }
}