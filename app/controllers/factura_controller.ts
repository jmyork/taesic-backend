import type { HttpContext } from '@adonisjs/core/http'
import FacturaService from '#services/factura_service'
import {
  AnularFacturaValidator,
  EmitirFacturaValidator,
  FacturaQueryValidator,
} from '#validators/factura_validator'

/**
 * Emissão de facturas e demais documentos fiscalmente relevantes.
 *
 * ── Sem try/catch por acção ───────────────────────────────────────────────────
 *
 * As acções deixaram de reclassificar `error.messages` / `error.code` à mão.
 * `app/exceptions/handler.ts` já trata qualquer excepção que estenda `Exception`
 * de forma genérica e consistente, e é a convenção escrita da secção 6.
 *
 * Não é arrumação: com os tipos de documento todos, `emitir()` passou a poder
 * recusar por mais razões — valor em falta, período de facturação inválido,
 * documento de origem inexistente. Nenhuma delas constava da lista que cada
 * `catch` verificava, e todas teriam saído como «Erro interno do servidor»,
 * apagando a mensagem que dizia ao utilizador o que corrigir.
 */
export default class FacturaController {
  private service = new FacturaService()

  // ==================== INDEX ====================
  async index({ request, response, params }: HttpContext) {
    const qs = await FacturaQueryValidator.validate(request.qs())
    const data = await this.service.list({ ...qs, company_alias: params.company_alias })

    return response.ok({ data, message: 'Listagem realizada com sucesso', status: 200 })
  }

  // ==================== SHOW ====================
  async show({ params, response }: HttpContext) {
    const data = await this.service.show({ id: params.id, company_alias: params.company_alias })

    return response.ok({ data, message: 'Registro encontrado', status: 200 })
  }

  // ==================== STORE (emitir) ====================
  async store({ request, response, params }: HttpContext) {
    const payload = await request.validateUsing(EmitirFacturaValidator)
    const data = await this.service.emitir({ ...payload, company_alias: params.company_alias })

    /*
     * A mensagem nomeia o documento pela sua designação legal e pela referência
     * completa — `Factura-Recibo FR FR2026/12` e não «Factura emitida com
     * sucesso». Com catorze tipos a sair do mesmo endpoint, uma confirmação que
     * não diz o que foi emitido deixa de confirmar seja o que for.
     */
    return response.created({
      data,
      message: `${data.designacao} ${data.referencia} emitida com sucesso`,
      status: 201,
    })
  }

  // ==================== PRÓXIMOS ====================
  /**
   * O que se pode emitir a seguir a este documento, e se ele ainda pode ser
   * anulado. É daqui que o ecrã de detalhe tira as acções que oferece — em vez de
   * oferecer os catorze tipos e deixar o utilizador descobrir pelo erro.
   */
  async proximos({ params, response }: HttpContext) {
    const data = await this.service.proximos({
      id: params.id,
      company_alias: params.company_alias,
    })

    return response.ok({ data, message: 'Acções disponíveis', status: 200 })
  }

  // ==================== VENDAS COBERTAS ====================
  /**
   * As vendas que este documento titula.
   *
   * Uma factura normal devolve a sua própria venda; uma factura global devolve
   * todas as que cobre. É daqui que o impresso tira os artigos — sem isto, uma
   * factura global saía com uma linha única onde deviam estar as compras do
   * período.
   */
  async vendasCobertas({ params, response }: HttpContext) {
    const data = await this.service.vendasCobertas({
      id: params.id,
      company_alias: params.company_alias,
    })

    return response.ok({ data, message: 'Vendas cobertas', status: 200 })
  }

  // ==================== VENDAS POR FACTURAR ====================
  /**
   * As vendas fechadas que ainda não foram tituladas.
   *
   * O ecrã de emissão listava todas as vendas fechadas, incluindo as já
   * facturadas — e escolher uma dessas passou a ser um 409 garantido.
   */
  async vendasPorFacturar({ params, response }: HttpContext) {
    const data = await this.service.vendasPorFacturar(params.company_alias)

    return response.ok({ data, message: 'Listagem realizada com sucesso', status: 200 })
  }

  // ==================== ANULAR ====================
  async anular({ request, params, response }: HttpContext) {
    // O motivo é obrigatório — ver `AnularFacturaValidator`. Sem ele o documento
    // anulado fica impossível de comunicar à AGT.
    const { motivo_anulacao } = await request.validateUsing(AnularFacturaValidator)

    const data = await this.service.anular({
      id: params.id,
      company_alias: params.company_alias,
      motivo_anulacao,
    })

    return response.ok({
      data,
      message: `${data.designacao} ${data.referencia} anulada com sucesso`,
      status: 200,
    })
  }
}
