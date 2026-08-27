import type { HttpContext } from '@adonisjs/core/http'
import assinaturaService from '#services/assinatura_service'
import { escolherPlanoValidator } from '#validators/assinatura_validator'

/**
 * A subscrição vista pela própria empresa: que plano tem, quanto está a usar dele, o que
 * deve, e como muda de plano ou paga.
 *
 * Não existia caminho nenhum para isto. `domain_subscricao`/`domain_cobranca` eram dois
 * CRUD genéricos sem ecrã por trás, e o dono de uma empresa não tinha onde ver o seu plano
 * nem como pagar.
 *
 * Sem try/catch a reclassificar erros — ver a secção "Erros/excepções" do CLAUDE.md.
 */
export default class AssinaturaController {
  private service = new assinaturaService()

  /** Plano, consumo, cobranças e catálogo. É o único pedido do ecrã de Subscrição. */
  async estado({ params }: HttpContext) {
    const data = await this.service.estado(params.company_alias)
    return { data, message: 'Subscrição obtida com sucesso', status: 200 }
  }

  /** Só o catálogo de planos. Serve o passo do plano no onboarding. */
  async planos({}: HttpContext) {
    const data = await this.service.planos()
    return { data, message: 'Listagem realizada com sucesso', status: 200 }
  }

  /** Escolhe ou muda de plano. Não cobra nada — ver `assinatura_repository`. */
  async escolherPlano({ params, request }: HttpContext) {
    const payload = await request.validateUsing(escolherPlanoValidator)

    const subscricao = await this.service.escolherPlano(params.company_alias, payload.plano_id)

    return {
      data: subscricao,
      message: 'Plano actualizado com sucesso',
      status: 200,
    }
  }

  /**
   * Emite (ou devolve) a cobrança por pagar da subscrição.
   *
   * É o passo antes do pagamento: o ecrã pede a cobrança, mostra o valor e a referência, e
   * só então o utilizador paga. Idempotente — carregar duas vezes não gera duas dívidas.
   */
  async cobrancaPendente({ params }: HttpContext) {
    const cobranca = await this.service.emitirCobrancaPendente(params.company_alias)

    if (!cobranca) {
      return {
        data: null,
        message: 'Não há nada a pagar de momento.',
        status: 200,
      }
    }

    return { data: cobranca, message: 'Cobrança em aberto', status: 200 }
  }
}
