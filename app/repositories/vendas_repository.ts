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

export default class vendasRepository {
  baseQuery() {
    return vendas.query()
  }

  async paginate(page = 1, limit = 20, filter?: VendasQueryDTO) {
    let query = this.baseQuery()

    // Deleted filter
    if (filter?.deleted === "deleted") {
      query.whereNotNull("vendas.deleted_at")
    } else if (filter?.deleted !== "all") {
      query.whereNull("vendas.deleted_at")
    }

    // Helper genérico (datas e números)
    const applyRange = (
      field: string,
      start?: number | Date,
      end?: number | Date
    ) => {
      if (start != null && end != null) {
        query.whereBetween(field, [start, end])
      } else if (start != null) {
        query.where(field, ">=", start)
      } else if (end != null) {
        query.where(field, "<=", end)
      }
    }

    // Audit dates (ranges)
    applyRange("vendas.created_at", filter?.createdDtStart, filter?.createdDtEnd)
    applyRange("vendas.updated_at", filter?.updatedDtStart, filter?.updatedDtEnd)


    // Total (exato ou range)
    if (filter?.total !== undefined) {
      query.where("vendas.total", filter.total)
    } else {
      applyRange("vendas.total", filter?.total_start, filter?.total_end)
    }

    // Filtros exatos
    if (filter?.venda_tipo) {
      query.where("vendas.venda_tipo", filter.venda_tipo)
    }

    if (filter?.status) {
      query.where("vendas.status", filter.status)
    }

    if (filter?.caixa_id) {
      query.where("vendas.caixa_id", filter.caixa_id)
    }

    if (filter?.user_id) {
      query.where("vendas.user_id", filter.user_id)
    }

    if (filter?.cliente_online_id) {
      query.where("vendas.cliente_online_id", filter.cliente_online_id)
    }

    if (filter?.cliente_presencial_id) {
      query.where("vendas.cliente_presencial_id", filter.cliente_presencial_id)
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
    return venda
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