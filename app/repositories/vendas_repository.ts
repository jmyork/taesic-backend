import { CreateVendasDTO, VendaCloseDTO, VendaShowDTO, VendasQueryDTO } from '#dtos/vendas_dto'
import vendas from '#models/faturacao/vendas'
import Empresa from '#models/empresa'
import caixa from '#models/caixa'
import UserHasNoOpenCaixaException from '#exceptions/user_has_no_open_caixa_exception'
import UserHasAnOpenVendaException from '#exceptions/user_has_an_open_venda_exception'
import venda_itens from '#models/faturacao/venda_itens'
import VendaIsAlreadyOpenOrCloseException from '#exceptions/venda_is_already_open_or_close_exception'
import estoqueRepository from './estoque_repository.js'
import caixaRepository from './caixa_repository.js'
import posRepository from './pos_repository.js'
import cupomRepository from './cupom_repository.js'
import CupomInvalidoException from '#exceptions/cupom_invalido_exception'
import db from '@adonisjs/lucid/services/db'
import env from '#start/env'
import emitter from '@adonisjs/core/services/emitter'
import VendaCanceladaAltoValor from '#events/venda_cancelada_alto_valor'
import { applyCommonFilters, FieldSpec } from '../helpers/query_filters.js'

const VENDAS_FILTER_FIELDS: FieldSpec[] = [
  { kind: 'range', column: 'vendas.total', startKey: 'total_start', endKey: 'total_end', exactKey: 'total' },
  { kind: 'exact', column: 'vendas.venda_tipo', key: 'venda_tipo' },
  { kind: 'exact', column: 'vendas.caixa_id', key: 'caixa_id' },
  { kind: 'exact', column: 'vendas.user_id', key: 'user_id' },
  { kind: 'exact', column: 'vendas.cliente_online_id', key: 'cliente_online_id' },
  { kind: 'exact', column: 'vendas.cliente_presencial_id', key: 'cliente_presencial_id' },
]

export default class vendasRepository {
  baseQuery() {
    return vendas.query()
  }

  async paginate(page = 1, limit = 20, filter?: VendasQueryDTO) {
    const query = applyCommonFilters(this.baseQuery(), filter, {
      table: 'vendas',
      fields: VENDAS_FILTER_FIELDS,
    })

    // `status` cobre os 4 estados directamente; `fechado` é um atalho booleano mais antigo
    // que só distingue aberta/fechada — mantido à parte por não ser um simples match de coluna.
    if (filter?.status) {
      query.where("vendas.status", filter.status)
    } else if (filter?.fechado === true) {
      query.where("vendas.status", "fechada")
    } else if (filter?.fechado === false) {
      query.where("vendas.status", "aberta")
    }

    // Empresa/Company
    if (filter?.company_alias || filter?.empresa_id) {
      query
        .join('caixa', 'caixa.id', 'vendas.caixa_id')
        .join('pos', 'pos.id', 'caixa.pos_id')
        .join('empresa', 'empresa.id', 'pos.empresa_id')

      if (filter?.company_alias) {
        query.where("empresa.company_alias", filter.company_alias)
      }

      if (filter?.empresa_id) {
        query.where("vendas.empresa_id", filter.empresa_id)
      }
    }

    return query
      .select("vendas.*")
      .orderBy("vendas.created_at", "desc")
      .paginate(page, limit)
  }

  async findOrFail(data: VendaShowDTO) {
    return await this.baseQuery()
      .join('caixa', 'caixa.id', 'vendas.caixa_id')
      .join('pos', 'pos.id', 'caixa.pos_id')
      .join('empresa', 'empresa.id', 'pos.empresa_id')
      .where('empresa.company_alias', data.company_alias ?? '')
      .where('vendas.id', data.id)
      // .where('caixa.user_id', data.user_id!)
      .select(['vendas.*'])
      .firstOrFail()
  }

  async create(data: CreateVendasDTO) {
    await Empresa.findByOrFail("company_alias", data.company_alias)

    const { company_alias, user_id, total, empresa_id, ...vendaData } = data
    // buscar o caixa aberto do usuário (se não for venda online) e validar que pertence à empresa
    const Caixa = await caixa.query()
      .join('pos', 'pos.id', 'caixa.pos_id')
      .join('empresa', 'empresa.id', 'pos.empresa_id')
      .where('empresa.company_alias', company_alias ?? '')
      .where('caixa.user_id', user_id!)
      .where('caixa.status', 'aberto')
      .select('caixa.*')
      .first()

    if (!Caixa) {
      throw new UserHasNoOpenCaixaException()
    }

    // checar se tem venda aberta para o user
    const ExistAnOpenVenda = await vendas.query()
      .join('caixa', 'caixa.id', 'vendas.caixa_id')
      .join('pos', 'pos.id', 'caixa.pos_id')
      .join('empresa', 'empresa.id', 'pos.empresa_id')
      // .join('vendas', 'vendas.caixa_id', 'caixa.id')
      .where('empresa.company_alias', company_alias ?? '')
      .where('caixa.user_id', user_id!)
      .where('caixa.status', 'aberto')
      .select('vendas.*')
      .first()

    if (ExistAnOpenVenda && ExistAnOpenVenda.status == 'aberta') {
      throw new UserHasAnOpenVendaException()
    }

    return vendas.create({
      cliente_presencial_id: vendaData.cliente_presencial_id,
      venda_tipo: 'presencial',
      caixa_id: Caixa.id,
      total: 0,
      status: 'aberta',
    })
  }

  // async update(id: string, data: UpdateVendasDTO) {
  //   const venda = await this.findOrFail(id, data.company_alias)
  //   venda.merge(data)
  //   await venda.save()
  //   return venda
  // }

  async close(data: VendaCloseDTO) {
    const venda = await this.findOrFail(data)

    const VendaItens = await venda_itens.query()
      .where('venda_id', venda.id)
      .select('venda_itens.*')

    // Se não tiver itens, simplesmente fecha a venda sem calcular total e deleta.
    if (!VendaItens || VendaItens.length === 0) {
      await venda.delete()
      return venda
    }
    if (venda.status == 'fechada' || venda.status == 'cancelada' || venda.status == 'reembolsada') {
      throw new VendaIsAlreadyOpenOrCloseException()
    }

    const caixaRepo = new caixaRepository()
    const caixa = await caixaRepo.findOrFail(venda.caixa_id!, data.company_alias)

    const posRepo = new posRepository()
    const pos = await posRepo.findOrFail(caixa.pos_id, data.company_alias)

    const estoqueRepo = new estoqueRepository()

    // Calcular o total da venda somando os itens
    const total = VendaItens.reduce((sum, item) => sum + item.preco_unitario * item.quantidade, 0)

    // Resolver o cupão ANTES da transação — se for inválido, a venda não deve avançar de todo.
    let cupomId: string | null = null
    let valorDesconto = 0
    if (data.cupom_codigo) {
      const cupomRepo = new cupomRepository()
      const cupomEncontrado = await cupomRepo.findValidoPorCodigo(data.cupom_codigo, data.company_alias)
      if (!cupomEncontrado) {
        throw new CupomInvalidoException()
      }
      cupomId = cupomEncontrado.id
      valorDesconto = Math.min(Number((total * (cupomEncontrado.desconto / 100)).toFixed(2)), total)
    }

    // Todas as movimentações de stock e a atualização da venda correm na mesma transação:
    // se uma falhar a meio (ex.: stock insuficiente num item), nada fica gravado a metade.
    return db.transaction(async (trx) => {
      for (const item of VendaItens) {
        await estoqueRepo.create({
          pos_id: pos.id,
          registrado_por: data.user_id,
          motivo: `venda`,
          tipo_movimentacao: 'saida',
          quantidade: item.quantidade ?? 0,
          lote_produto_id: item.lote_produto_id,
          company_alias: data.company_alias,
        }, trx)
      }

      venda.total = total - valorDesconto
      venda.valor_desconto = valorDesconto
      venda.cupom_id = cupomId
      venda.status = 'fechada'
      venda.useTransaction(trx)
      await venda.save()
      return venda
    })
  }

  // Cancela uma venda ainda em aberto (nunca chegou a ser fechada). Ao contrário de close(),
  // não há stock a reverter aqui: o stock só é decrementado no momento do fecho da venda.
  async cancel(data: VendaCloseDTO) {
    const venda = await this.findOrFail(data)

    if (venda.status !== 'aberta') {
      throw new VendaIsAlreadyOpenOrCloseException()
    }

    venda.status = 'cancelada'
    await venda.save()

    await this.avisarSeCancelamentoAltoValor(venda.id, data.company_alias)

    return venda
  }

  /** Emite `VendaCanceladaAltoValor` quando o total dos itens de uma venda cancelada (ainda
   * aberta, por isso `vendas.total` nunca foi preenchido) excede o limiar configurado (env
   * `VENDA_CANCELADA_LIMIAR`, por omissão 50000). */
  private async avisarSeCancelamentoAltoValor(vendaId: string, companyAlias?: string) {
    try {
      const limiar = Number(env.get('VENDA_CANCELADA_LIMIAR', '50000'))

      const itens = await venda_itens.query().where('venda_id', vendaId).whereNull('deleted_at')
      const total = itens.reduce((soma, item) => soma + item.preco_unitario * item.quantidade, 0)
      if (total < limiar) return

      await emitter.emit(
        VendaCanceladaAltoValor,
        new VendaCanceladaAltoValor(vendaId, companyAlias ?? '', total, limiar)
      )
    } catch (error) {
      console.error('Falha ao avaliar/emitir alerta de venda cancelada de alto valor:', error)
    }
  }

  // async softDelete(id: string, company_alias?: string, user_id?: string) {
  //   const venda = await this.findOrFail(id, company_alias, user_id)

  //   if (venda.deletedAt) {
  //     venda.deletedAt = null
  //   } else {
  //     venda.deletedAt = DateTime.now()
  //   }

  //   await venda.save()
  //   return venda
  // }
}