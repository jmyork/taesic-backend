import type { HttpContext } from '@adonisjs/core/http'
import vendapagamentoService from '#services/vendapagamento_service'
import { createvendapagamentoValidator, updatevendapagamentoValidator } from '#validators/vendapagamento_validator'

export default class vendapagamentosController {
    private service = new vendapagamentoService()

    // ==================== INDEX ====================
    async index({ request, params, response }: HttpContext) {
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
    async store({ request, response }: HttpContext) {
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
    async show({ params, response }: HttpContext) {
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
    /**
     * Sem try/catch: o handler global (app/exceptions/handler.ts) já traduz os erros de
     * validação do VineJS (400), o `E_ROW_NOT_FOUND` do Lucid (404) e as excepções de
     * domínio — incluindo `PagamentoVendaNaoAbertaException` (400). Com o try/catch antigo,
     * essa excepção caía no `internalServerError` final e o vendedor via "Erro interno do
     * servidor" em vez de "a venda já está fechada" (mesmo bug já corrigido em
     * `vendas_controller.close`, ver secção 7.4 do CLAUDE.md).
     */
    async update({ params, request, response }: HttpContext) {
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
    }

    // ==================== DESTROY ====================
    /** Sem try/catch, pela mesma razão do `update` acima. */
    async destroy({ params, response }: HttpContext) {
        await this.service.delete(params.id, params.company_alias)

        return response.ok({
            data: null,
            message: 'Registro removido/recuperado com sucesso',
            status: 200
        })
    }
}