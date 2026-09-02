import type { HttpContext } from '@adonisjs/core/http'
import FacturaService from '#services/factura_service'
import {
  AnularFacturaValidator,
  ConfirmarRecebimentoValidator,
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
  async store({ auth, request, response, params }: HttpContext) {
    const payload = await request.validateUsing(EmitirFacturaValidator)

    const data = await this.service.emitir({
      ...payload,
      company_alias: params.company_alias,
      /*
       * Quem emite vem da SESSÃO, e é acrescentado depois do payload de propósito.
       *
       * O validator não aceita este campo, e mesmo que o pedido o trouxesse ficaria
       * aqui esmagado: deixar o corpo do pedido escolher o emissor permitiria
       * assinar um documento fiscal em nome de outra pessoa, que é exactamente o
       * que a identificação do emissor existe para impedir.
       */
      emitido_por_user_id: auth.user?.id ?? null,
    })

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

  // ==================== DOCUMENTOS DA OPERAÇÃO ====================
  /**
   * Todos os documentos que compõem esta operação.
   *
   * Uma venda a prazo produz uma factura e, quando o dinheiro entra, um recibo;
   * um reembolso produz uma nota de crédito sobre a factura. Quem pede o impresso
   * quer a operação inteira — imprimir só o documento em que se clicou entrega
   * metade dos papéis e obriga a procurar os outros à mão.
   */
  async documentosDaOperacao({ params, response }: HttpContext) {
    const data = await this.service.documentosDaOperacao({
      id: params.id,
      company_alias: params.company_alias,
    })

    return response.ok({ data, message: 'Documentos da operação', status: 200 })
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

  // ==================== CONTAS A RECEBER ====================
  /**
   * O que a empresa tem por receber.
   *
   * Devolve a lista (para se poder confirmar documento a documento) e os totais —
   * o que está vencido e o que ainda está dentro do prazo, separados, porque são
   * coisas diferentes para quem gere tesouraria: uma é dinheiro em risco, a outra é
   * dinheiro esperado.
   *
   * Registada ANTES do resource em `companydomainroutes.ts`, pela mesma razão de
   * sempre: `GET facturas/:id` interceptaria `facturas/contas-a-receber`.
   */
  async contasAReceber({ request, params, response }: HttpContext) {
    const qs = await FacturaQueryValidator.validate(request.qs())

    const data = await this.service.contasAReceber({
      company_alias: params.company_alias,
      page: qs.page,
      limit: qs.limit,
    })

    return response.ok({ data, message: 'Contas a receber', status: 200 })
  }

  // ==================== CONFIRMAR RECEBIMENTO ====================
  /**
   * Confirmar que o dinheiro entrou — e emitir o recibo.
   *
   * Devolve o RECIBO, não a factura: é o documento novo, é o que se imprime e o que
   * o cliente leva. A factura sai do mapa de cobranças sozinha por passar a ter um
   * recibo por cima; nada mais é escrito nela.
   */
  async confirmarRecebimento({ auth, request, params, response }: HttpContext) {
    const payload = await request.validateUsing(ConfirmarRecebimentoValidator)

    const data = await this.service.confirmarRecebimento({
      id: params.id,
      company_alias: params.company_alias,
      ...payload,
      // Quem confirma que o dinheiro entrou é quem assina o recibo.
      emitido_por_user_id: auth.user?.id ?? null,
    })

    return response.created({
      data,
      message: `Recebimento confirmado. ${data.designacao} ${data.referencia} emitido.`,
      status: 201,
    })
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
