import type { HttpContext } from '@adonisjs/core/http'
import cupomService from '#services/cupom_service'
import { createcupomValidator, updatecupomValidator } from '#validators/cupom_validator'
import { CupomQueryDTO } from '#dtos/cupom_dto'

export default class cupomsController {
    private service = new cupomService()

    // ==================== INDEX ====================
    async index({ request, response, params }: HttpContext) {
        try {
            const page = request.input('page', 1)
            const limit = request.input('limit', 20)
            const filter: CupomQueryDTO = {
                deleted: request.input('deleted') ?? undefined,
                promotor_id: request.input('promotor_id') ?? undefined,
                company_alias: params.company_alias,
            }
            const data = await this.service.list(page, limit, filter)
            return response.ok({
                data,
                message: 'Listagem realizada com sucesso',
                status: 200
            })
        } catch (error) {
            console.error('Erro ao listar cupom:', error)
            return response.internalServerError({
                data: null,
                message: 'Erro interno do servidor',
                status: 500
            })
        }
    }

    // ==================== STORE ====================
    async store({ request, response, params }: HttpContext) {
        try {
            const payload = await request.validateUsing(createcupomValidator)
            const data = await this.service.create({ ...payload, company_alias: params.company_alias })

            return response.created({
                data,
                message: 'Registro criado com sucesso',
                status: 201
            })
        } catch (error: any) {
            if (error.code === 'PROMOTOR_EMPRESA_MISMATCH') {
                return response.unprocessableEntity({
                    data: null,
                    message: error.message,
                    code: 'PROMOTOR_EMPRESA_MISMATCH',
                    status: 422
                })
            }

            if (error.messages) {
                return response.badRequest({
                    data: null,
                    message: 'Dados inválidos',
                    errors: error.messages,
                    status: 400
                })
            }

            console.error('Erro ao criar cupom:', error)
            return response.internalServerError({
                data: null,
                message: 'Erro interno do servidor',
                status: 500
            })
        }
    }

    // ==================== SHOW ====================
    async show({ params, response }: HttpContext) {
        try {
            const data = await this.service.show(params.id, params.company_alias)

            return response.ok({
                data,
                message: 'Registro encontrado',
                status: 200
            })
        } catch (error: any) {
            if (error.code === 'E_ROW_NOT_FOUND') {
                return response.notFound({
                    data: null,
                    message: 'Registro não encontrado',
                    status: 404
                })
            }

            console.error('Erro ao buscar cupom:', error)
            return response.internalServerError({
                data: null,
                message: 'Erro interno do servidor',
                status: 500
            })
        }
    }

    // ==================== UPDATE ====================
    async update({ params, request, response }: HttpContext) {
        try {
            const payload = await request.validateUsing(updatecupomValidator)
            const data = await this.service.update(params.id, payload, params.company_alias)

            return response.ok({
                data,
                message: 'Registro atualizado com sucesso',
                status: 200
            })
        } catch (error: any) {
            if (error.messages) {
                return response.badRequest({
                    data: null,
                    message: 'Dados inválidos',
                    errors: error.messages,
                    status: 400
                })
            }

            if (error.code === 'E_ROW_NOT_FOUND') {
                return response.notFound({
                    data: null,
                    message: 'Registro não encontrado para atualização',
                    status: 404
                })
            }

            console.error('Erro ao atualizar cupom:', error)
            return response.internalServerError({
                data: null,
                message: 'Erro interno do servidor',
                status: 500
            })
        }
    }

    // ==================== DESTROY ====================
    async destroy({ params, response }: HttpContext) {
        try {
            await this.service.delete(params.id, params.company_alias)

            return response.ok({
                data: null,
                message: 'Registro removido/recuperado com sucesso',
                status: 200
            })
        } catch (error: any) {
            if (error.code === 'E_ROW_NOT_FOUND') {
                return response.notFound({
                    data: null,
                    message: 'Registro não encontrado para remoção',
                    status: 404
                })
            }

            console.error('Erro ao remover cupom:', error)
            return response.internalServerError({
                data: null,
                message: 'Erro interno do servidor',
                status: 500
            })
        }
    }
}
