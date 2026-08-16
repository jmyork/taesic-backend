import vendapagamento from '#models/vendapagamento'
import Vendas from '#models/faturacao/vendas'
import { CreatevendapagamentoDTO, UpdatevendapagamentoDTO } from '#dtos/vendapagamento_dto'
import PagamentoVendaNaoAbertaException from '#exceptions/pagamento_venda_nao_aberta_exception'
import BaseRepository from './base_repository.js'

export default class vendapagamentoRepository extends BaseRepository<
  InstanceType<typeof vendapagamento>,
  CreatevendapagamentoDTO,
  UpdatevendapagamentoDTO
> {
  constructor() {
    super(vendapagamento, 'vendapagamento')
  }

  // vendapagamento -> vendas (venda_id) -> caixa (caixa_id) -> pos (pos_id) -> empresa (empresa_id)
  protected scopeToTenant(query: any, companyAlias: string) {
    return query
      .join('vendas', 'vendas.id', 'vendapagamento.venda_id')
      .join('caixa', 'caixa.id', 'vendas.caixa_id')
      .join('pos', 'pos.id', 'caixa.pos_id')
      .join('empresa', 'empresa.id', 'pos.empresa_id')
      .where('empresa.company_alias', companyAlias)
  }

  /**
   * Uma venda que ainda não fechou aceita correcções aos seus pagamentos; uma fechada,
   * não — ver `PagamentoVendaNaoAbertaException` para o porquê.
   *
   * Isto é o que torna seguro dar `update`/`destroy` de pagamentos ao Vendedor: sem a
   * regra, um valor mal escrito só era corrigível por um Admin (e o vendedor ficava
   * preso, sem conseguir fechar a venda, se se tivesse enganado por excesso); com ela,
   * corrige o seu próprio erro enquanto a venda está aberta e nunca toca em dinheiro já
   * contabilizado pela caixa.
   */
  private async assertVendaAberta(vendaId: string) {
    const venda = await Vendas.findOrFail(vendaId)
    if (venda.status !== 'aberta') {
      throw new PagamentoVendaNaoAbertaException(venda.status)
    }
  }

  async update(id: string, data: UpdatevendapagamentoDTO, companyAlias?: string) {
    const pagamento: any = await this.findOrFail(id, companyAlias)

    await this.assertVendaAberta(pagamento.venda_id)
    // Mover o pagamento para outra venda exige que a venda de DESTINO também esteja
    // aberta — senão bastava reatribuir um pagamento a uma venda já fechada para lhe
    // alterar o valor pago por fora.
    if (data.venda_id && data.venda_id !== pagamento.venda_id) {
      await this.assertVendaAberta(data.venda_id)
    }

    return super.update(id, data, companyAlias)
  }

  /**
   * Soft-delete com toggle (padrão do projecto): também repõe um pagamento apagado. Os
   * dois sentidos alteram a soma que `close()` valida, por isso os dois exigem venda
   * aberta.
   */
  async softDelete(id: string, companyAlias?: string) {
    const pagamento: any = await this.findOrFail(id, companyAlias)
    await this.assertVendaAberta(pagamento.venda_id)

    return super.softDelete(id, companyAlias)
  }
}
