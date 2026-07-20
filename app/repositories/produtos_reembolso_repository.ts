import produtos_reembolso from '#models/faturacao/produtos_reembolso'
import {
  ShowProdutosReembolsoDTO,
  ProdutosReembolsoQueryDTO,
  ReembolsoParcialDTO,
  ReembolsoTotalDTO,
} from '#dtos/produtos_reembolso_dto'
import venda_itensRepository from './venda_itens_repository.js'
import QuantidadeReembolsoExcedeVendidaException from '#exceptions/quantidade_reembolso_excede_vendida_exception'
import estoqueRepository from './estoque_repository.js'
import vendasRepository from './vendas_repository.js'
import posRepository from './pos_repository.js'
import caixaRepository from './caixa_repository.js'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import Lote from '#models/faturacao/lote'
import emitter from '@adonisjs/core/services/emitter'
import EstoqueRevertido from '#events/estoque_revertido'
import { applyCommonFilters, FieldSpec } from '../helpers/query_filters.js'

const REEMBOLSO_FILTER_FIELDS: FieldSpec[] = [
  { kind: 'range', column: 'produtos_reembolso.quantidade', startKey: 'quantidade_start', endKey: 'quantidade_end', exactKey: 'quantidade' },
  { kind: 'exact', column: 'produtos_reembolso.user_id', key: 'user_id' },
  { kind: 'exact', column: 'produtos_reembolso.venda_item_id', key: 'venda_item_id' },
]

export default class produtos_reembolsoRepository {

  baseQuery() {
    return produtos_reembolso.query()
  }

  async paginate(page = 1, limit = 20, filter?: ProdutosReembolsoQueryDTO) {
    let query = applyCommonFilters(this.baseQuery(), filter, {
      table: 'produtos_reembolso',
      fields: REEMBOLSO_FILTER_FIELDS,
    })

    // empresa filters
    if (filter?.company_alias) {
      query = query
        .join('venda_itens', "venda_itens.id", "produtos_reembolso.venda_item_id")
        .join('vendas', 'vendas.id', 'venda_itens.venda_id')
        .join('caixa', 'caixa.id', 'vendas.caixa_id')
        .join('pos', 'pos.id', 'caixa.pos_id')
        .join('empresa', 'empresa.id', 'pos.empresa_id')
        .where('empresa.company_alias', filter.company_alias)
    }

    // NOTA: filtro por `produtos_reembolso.empresa_id` foi removido — essa coluna não existe
    // nesta tabela (o isolamento de tenant é feito via `company_alias`, acima, através do
    // join até `empresa`). Filtrar por uma coluna inexistente resultava sempre em erro 500.

    return await query.select('produtos_reembolso.*').orderBy('created_at', 'desc').paginate(page, limit)
  }

  /** Lista todos os reembolsos (totais e parciais) associados a uma venda. */
  async listByVenda(data: ShowProdutosReembolsoDTO) {
    return await this.baseQuery()
      .join("venda_itens", "venda_itens.id", "produtos_reembolso.venda_item_id")
      .join("vendas", "vendas.id", "venda_itens.venda_id")
      .join('caixa', 'caixa.id', 'vendas.caixa_id')
      .join('pos', 'pos.id', 'caixa.pos_id')
      .join('empresa', 'empresa.id', 'pos.empresa_id')
      .where('empresa.company_alias', data.company_alias ?? '')
      .where('vendas.id', data.venda_id)
      .select(['produtos_reembolso.*'])
  }

  async reembolsar_total(data: ReembolsoTotalDTO) {
    // obter os itens da venda
    const vendaItemRepo = new venda_itensRepository()

    const venda_itens = await vendaItemRepo.paginate(1, 1000, { venda_id: data.venda_id, company_alias: data.company_alias })
    // obter a venda para pegar o caixa_id para pegar o pos_id para a movimentação do estoque
    const vendaRepo = new vendasRepository()
    const venda = await vendaRepo.findOrFail({ id: venda_itens[0].venda_id, company_alias: data.company_alias })
    const caixaRepo = new caixaRepository()
    const caixa = await caixaRepo.findOrFail(venda.caixa_id!, data.company_alias)

    const posRepo = new posRepository()
    const pos = await posRepo.findOrFail(caixa.pos_id, data.company_alias)
    // registrar movimentação do stock
    const estoqueRepo = new estoqueRepository()

    // Movimentações de stock, criação dos registos de reembolso e atualização da venda correm
    // todas na mesma transação — um item a falhar a meio não pode deixar reembolsos parciais
    // gravados sem a devolução de stock correspondente (ou vice-versa).
    const reembolsosCriados = await db.transaction(async (trx) => {
      for (const item of venda_itens) {
        await estoqueRepo.create({
          pos_id: pos.id,
          registrado_por: data.user_id,
          motivo: `Reajuste por reembolso total - venda_id: ${venda.id}`,
          tipo_movimentacao: 'entrada',
          quantidade: item.quantidade,
          lote_produto_id: item.lote_produto_id,
          company_alias: data.company_alias,
        }, trx)
      }

      // criar os registros de reembolso
      const criados = []
      for (const item of venda_itens) {
        const reembolsoCriado = await produtos_reembolso.create({
          venda_item_id: item.id,
          user_id: data.user_id ?? '',
          quantidade: item.quantidade,
        }, { client: trx })

        item.deletedAt = DateTime.now()
        item.useTransaction(trx)
        await item.save()
        criados.push(reembolsoCriado)
      }

      // um reembolso total esvazia a venda por completo — refletir isso no registo da venda,
      // que anteriormente continuava a mostrar-se "fechada" com o total original.
      venda.status = 'reembolsada'
      venda.total = 0
      venda.useTransaction(trx)
      await venda.save()

      return criados
    })

    // Só depois da transação confirmar — nunca alerta sobre uma reversão que possa ainda
    // vir a ser desfeita.
    for (const item of venda_itens) {
      await this.avisarEstoqueRevertido(
        item.lote_produto_id,
        item.quantidade,
        `Reembolso total da venda ${venda.id}`,
        data.company_alias
      )
    }

    return reembolsosCriados
  }

  /** Emite `EstoqueRevertido` quando um reembolso devolve produtos ao stock. */
  private async avisarEstoqueRevertido(loteId: string, quantidade: number, motivo: string, companyAlias?: string) {
    try {
      const lote = await Lote.query().where('lote_produto.id', loteId).preload('produto').first()
      if (!lote) return

      await emitter.emit(
        EstoqueRevertido,
        new EstoqueRevertido(loteId, lote.produto?.nome ?? 'desconhecido', companyAlias ?? '', quantidade, motivo)
      )
    } catch (error) {
      console.error('Falha ao avaliar/emitir alerta de reversão de estoque:', error)
    }
  }

  async reembolsar_parcial(data: ReembolsoParcialDTO) {
    const vendaItemRepo = new venda_itensRepository()
    const venda_item = await vendaItemRepo.findOrFail(data.venda_item_id, data.company_alias)
    // Lógica para reembolso parcial
    // checar a quantidade a remover vs quantidade do item
    if (data.quantidade && data.quantidade > venda_item.quantidade) {
      throw new QuantidadeReembolsoExcedeVendidaException()
    }

    // pegar o caixa para pegar o pos_id para a movimentação do estoque
    const vendaRepo = new vendasRepository()
    const venda = await vendaRepo.findOrFail({ id: venda_item.venda_id, company_alias: data.company_alias })
    const caixaRepo = new caixaRepository()
    const caixa = await caixaRepo.findOrFail(venda.caixa_id!, data.company_alias)

    const posRepo = new posRepository()
    const pos = await posRepo.findOrFail(caixa.pos_id, data.company_alias)

    const estoqueRepo = new estoqueRepository()

    // A atualização do item, a devolução de stock, o registo do reembolso e o recálculo do
    // total da venda correm todos na mesma transação — caso contrário um erro a meio (ex.:
    // stock insuficiente ao registar a entrada) deixaria o item já reduzido sem o reembolso
    // correspondente ter sido criado.
    return db.transaction(async (trx) => {
      // checar se a diferença entre quantidade vendidas vs a reembolsada é zero. Se for, deletar.
      const quantidadeSobrando = venda_item.quantidade - (data.quantidade ?? 0)
      if (quantidadeSobrando === 0) {
        venda_item.deletedAt = DateTime.now()
      } else {
        venda_item.merge({ quantidade: quantidadeSobrando })
      }
      venda_item.useTransaction(trx)
      await venda_item.save()

      // registrar movimentação do stock
      await estoqueRepo.create({
        pos_id: pos.id,
        registrado_por: data.user_id,
        motivo: `Reajuste por reembolso parcial - venda_item_id: ${venda_item.id}`,
        tipo_movimentacao: 'entrada',
        quantidade: data.quantidade ?? 0,
        lote_produto_id: venda_item.lote_produto_id,
        company_alias: data.company_alias,
      }, trx)

      // criar o registro de reembolso
      const reembolsoCriado = await produtos_reembolso.create({
        venda_item_id: data.venda_item_id,
        user_id: data.user_id ?? '',
        quantidade: data.quantidade ?? 0,
      }, { client: trx })

      // recalcular o total da venda a partir dos itens que restam — anteriormente a venda
      // continuava a mostrar o total original mesmo depois de um reembolso parcial reduzir
      // efetivamente o que foi cobrado. A leitura usa a mesma transação para ver a
      // atualização de venda_item feita acima antes de esta ser confirmada (commit).
      const itensRestantes = await vendaItemRepo.paginate(1, 1000, {
        venda_id: venda.id,
        company_alias: data.company_alias,
      }, trx)
      const novoTotal = itensRestantes.reduce(
        (soma, item) => soma + item.preco_unitario * item.quantidade,
        0
      )
      venda.total = novoTotal
      if (itensRestantes.length === 0) {
        venda.status = 'reembolsada'
      }
      venda.useTransaction(trx)
      await venda.save()

      return reembolsoCriado
    }).then(async (reembolsoCriado) => {
      // Só depois da transação confirmar — nunca alerta sobre uma reversão que possa ainda
      // vir a ser desfeita.
      await this.avisarEstoqueRevertido(
        venda_item.lote_produto_id,
        data.quantidade ?? 0,
        `Reembolso parcial do item ${venda_item.id}`,
        data.company_alias
      )
      return reembolsoCriado
    })
  }

}
