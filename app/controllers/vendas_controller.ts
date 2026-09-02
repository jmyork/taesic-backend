import type { HttpContext } from '@adonisjs/core/http'
import vendasService from '#services/vendas_service'
import { AjustarVendaValidator, CloseVendaValidator, CreateVendaValidator, ShowVendaValidator, VendasQueryValidator } from '#validators/vendas_validator'
import { VendasQueryDTO } from '#dtos/vendas_dto'
import { userHasRole } from '../helpers/Utils.js'
import posRepository from '#repositories/pos_repository'

// Papéis que só podem ver/pesquisar vendas do(s) seu(s) próprio(s) posto(s) — nunca da
// empresa toda. Admin/Gerente/Supervisor/*Visualizador de Admin continuam a ver tudo.
const PAPEIS_RESTRITOS_A_POS = ['Vendedor', 'VendedorVisualizador', 'Estoquista', 'EstoquistaVisualizador']

export default class vendassController {
    private service = new vendasService()
    // ==================== INDEX ====================
    async index({ request, response, params, auth }: HttpContext) {
        try {
            const querySantized = await VendasQueryValidator.validate(request.qs())
            const { page, limit, ...sanitezed } = querySantized

            const filter: VendasQueryDTO = {
                ...sanitezed,
                empresa_id: params.company_alias ? null : request.input('empresa_id'),
                company_alias: params.company_alias,
            }

            // Restrição aplicada aqui (não só na UI) — não depende do frontend respeitar isto.
            if (auth.user && (await userHasRole(auth.user, PAPEIS_RESTRITOS_A_POS))) {
                const posRepo = new posRepository()
                const meusPos = await posRepo.listByUser(auth.user.id, { limit: 100 })
                const meusPosIds = meusPos.all().map((p) => p.id)
                const posPedido = typeof filter.pos_id === 'string' ? filter.pos_id : undefined
                filter.pos_id = posPedido && meusPosIds.includes(posPedido) ? posPedido : meusPosIds
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

            // A caixa estava aberta, mas era de um dia anterior: foi fechada agora. É um
            // caso à parte do anterior porque quem está a vender viu a caixa aberta há um
            // instante — sem esta mensagem parecia que a venda falhou sem razão.
            if (error.code === 'CAIXA_DIA_ANTERIOR_FECHADA') {
                return response.unprocessableEntity({
                    data: null,
                    message: error.message,
                    code: 'CAIXA_DIA_ANTERIOR_FECHADA',
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
    async close({ request, response, params, auth }: HttpContext) {
        const payload = await CloseVendaValidator.validate({ ...params, ...request.body() })
        const venda = await this.service.close({
            ...payload,
            company_alias: params.company_alias,
            user_id: auth.user?.id,
        })

        /*
         * A resposta passou a trazer a venda — e, com ela, o DOCUMENTO FISCAL emitido
         * no fecho (em `$extras.documento`).
         *
         * Antes devolvia `data: null`, e podia: não havia documento nenhum a emitir. O
         * ponto de venda precisa dele imediatamente — é o que imprime e o que mostra no
         * ecrã de sucesso —, e obrigá-lo a ir buscá-lo num segundo pedido significaria
         * adivinhar por que critério, com o utilizador a olhar para uma venda concluída
         * sem saber que documento saiu.
         *
         * `user_id` passou a ir também: as saídas de armazém do fecho são registadas em
         * nome de quem as fez, e sem ele a movimentação ficava sem responsável.
         */
        return response.ok({
            data: venda,
            message: 'Venda fechada com sucesso',
            status: 200,
        })
    }

    // ==================== ENTREGAR (adiantamento) ====================
    /**
     * Registar a entrega do produto de uma venda por adiantamento.
     *
     * É o passo que fecha o ciclo: dá baixa no armazém (que não saiu no fecho, porque
     * não houve entrega), marca a venda como entregue — é a partir daqui que ela conta
     * como receita — e emite o documento que a titula.
     *
     * Sem try/catch: o handler global traduz `VendaNaoEAdiantamento` (409),
     * `VendaJaEntregue` (409) e o resto. Um catch genérico devolveria 500 a todos, que
     * é o erro que este projecto já cometeu quatro vezes (§7.4, §7.17, §7.21, §7.22).
     */
    async entregar({ response, params, auth }: HttpContext) {
        const payload = await ShowVendaValidator.validate(params)

        const venda = await this.service.entregar({
            ...payload,
            company_alias: params.company_alias,
            user_id: auth.user?.id,
        })

        return response.ok({
            data: venda,
            message: 'Entrega registada e documento emitido',
            status: 200,
        })
    }

    // ==================== AJUSTAR (nota de débito) ====================
    /**
     * Ajustar uma venda fechada para cima — emite a nota de débito.
     *
     * A venda não é reescrita: já há um documento fiscal a dizer quanto ela valia, e
     * um documento fiscal emitido não se reescreve. O acréscimo vive na nota, que é o
     * documento que a lei tem para isto. Devolve a NOTA, que é o que há de novo.
     */
    async ajustar({ request, response, params, auth }: HttpContext) {
        const { id } = await ShowVendaValidator.validate(params)
        const payload = await request.validateUsing(AjustarVendaValidator)

        const nota = await this.service.ajustar({
            id,
            company_alias: params.company_alias,
            user_id: auth.user?.id,
            ...payload,
        })

        return response.created({
            data: nota,
            message: `${nota.designacao} ${nota.referencia} emitida com sucesso`,
            status: 201,
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
