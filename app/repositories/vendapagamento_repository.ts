import vendapagamento from '#models/vendapagamento'
import { CreatevendapagamentoDTO, UpdatevendapagamentoDTO } from '#dtos/vendapagamento_dto'
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
}
