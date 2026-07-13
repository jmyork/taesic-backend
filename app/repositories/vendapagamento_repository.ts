import { DateTime } from 'luxon'
import vendapagamento from '#models/vendapagamento'
import {CreatevendapagamentoDTO,UpdatevendapagamentoDTO} from '#dtos/vendapagamento_dto'
import { DeletedValue } from '../helpers/Types.js'

export default class vendapagamentoRepository{

 baseQuery(){ return vendapagamento.query() }

 // vendapagamento -> vendas (venda_id) -> caixa (caixa_id) -> pos (pos_id) -> empresa (empresa_id)
 paginate(page = 1, limit = 20, deleted: DeletedValue = null, company_alias?: string){
    let query = this.baseQuery()
    if (deleted === "deleted") {
      query = query.whereNotNull('vendapagamento.deleted_at')
    } else if (deleted === "all") {
      query = query
    } else {
      query = query.whereNull('vendapagamento.deleted_at')
    }
    if (company_alias) {
      query = query
        .join('vendas', 'vendas.id', 'vendapagamento.venda_id')
        .join('caixa', 'caixa.id', 'vendas.caixa_id')
        .join('pos', 'pos.id', 'caixa.pos_id')
        .join('empresa', 'empresa.id', 'pos.empresa_id')
        .where('empresa.company_alias', company_alias)
    }
    return query.select('vendapagamento.*').paginate(page, limit)
 }

 findOrFail(id:string, company_alias?: string){
  let query = this.baseQuery().where('vendapagamento.id', id)
  if (company_alias) {
    query = query
      .join('vendas', 'vendas.id', 'vendapagamento.venda_id')
      .join('caixa', 'caixa.id', 'vendas.caixa_id')
      .join('pos', 'pos.id', 'caixa.pos_id')
      .join('empresa', 'empresa.id', 'pos.empresa_id')
      .where('empresa.company_alias', company_alias)
  }
  return query.select('vendapagamento.*').firstOrFail()
 }

 create(data:CreatevendapagamentoDTO){
  return vendapagamento.create(data)
 }

 async update(id:string,data:UpdatevendapagamentoDTO, company_alias?: string){
  const r=await this.findOrFail(id, company_alias)
  r.merge(data)
  await r.save()
  return r
 }

 async softDelete(id:string, company_alias?: string){
    const r = await this.findOrFail(id, company_alias)
    if (r.deletedAt) r.deletedAt = null
    else r.deletedAt = DateTime.now()
    await r.save()
 }

}
