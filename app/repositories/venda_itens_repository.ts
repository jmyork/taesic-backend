import venda_itens from '#models/faturacao/venda_itens'
import { Createvenda_itensDTO, VendaItensQueryDTO } from '#dtos/venda_itens_dto'
import Empresa from '#models/empresa'
import loteRepository from './lote_repository.js'
import vendasRepository from './vendas_repository.js'
import VendaIsAlreadyOpenOrCloseException from '#exceptions/venda_is_already_open_or_close_exception'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

export default class venda_itensRepository {
  baseQuery(trx?: TransactionClientContract) {
    return venda_itens.query({ client: trx })
  }

  async paginate(page = 1, limit = 20, filter?: VendaItensQueryDTO, trx?: TransactionClientContract) {
    let query = this.baseQuery(trx)

    // deleted at filter
    if (filter?.deleted === 'deleted') {
      query = query.whereNotNull('venda_itens.deleted_at')
    } else if (filter?.deleted === 'all') {
      query = query
    } else {
      query = query.whereNull('venda_itens.deleted_at')
    }

    // created_at filter
    if (filter?.createdDtStart && filter?.createdDtEnd) {
      query = query.whereBetween('venda_itens.created_at', [
        new Date(filter.createdDtStart).toISOString(),
        new Date(filter.createdDtEnd).toISOString(),
      ])
    } else if (filter?.createdDtStart) {
      query = query.where(
        'venda_itens.created_at',
        '>=',
        new Date(filter.createdDtStart).toISOString()
      )
    } else if (filter?.createdDtEnd) {
      query = query.where(
        'venda_itens.created_at',
        '<=',
        new Date(filter.createdDtEnd).toISOString()
      )
    }

    // updated_at filter
    if (filter?.updatedDtStart && filter?.updatedDtEnd) {
      query = query.whereBetween('venda_itens.updated_at', [
        new Date(filter.updatedDtStart).toISOString(),
        new Date(filter.updatedDtEnd).toISOString(),
      ])
    } else if (filter?.updatedDtStart) {
      query = query.where(
        'venda_itens.updated_at',
        '>=',
        new Date(filter.updatedDtStart).toISOString()
      )
    } else if (filter?.updatedDtEnd) {
      query = query.where(
        'venda_itens.updated_at',
        '<=',
        new Date(filter.updatedDtEnd).toISOString()
      )
    }

    // nome filter
    if (filter?.preco_unitario) {
      query = query.where('venda_itens.preco_unitario', filter.preco_unitario)
    }

    if (filter?.quantidade) {
      query = query.where('venda_itens.quantidade', filter.quantidade)
    }

    if (filter?.lote_produto_id) {
      query = query.where('venda_itens.lote_produto_id', filter.lote_produto_id)
    }

    if (filter?.venda_id) {
      query = query.where('venda_itens.venda_id', filter.venda_id)
    }

    // empresa filters
    if (filter?.company_alias) {
      query = query
        .join('vendas', 'vendas.id', 'venda_itens.venda_id')
        .join('caixa', 'caixa.id', 'vendas.caixa_id')
        .join('pos', 'pos.id', 'caixa.pos_id')
        .join('empresa', 'empresa.id', 'pos.empresa_id')
        .where('empresa.company_alias', filter.company_alias)
    }

    if (filter?.empresa_id) {
      query = query.where('venda_itens.empresa_id', filter.empresa_id)
    }

    // Nome do produto — venda_itens só guarda lote_produto_id, sem isto o chamador
    // (ex.: ecrã de reembolso) só teria o id do lote para mostrar ao utilizador.
    query = query
      .join('lote_produto', 'lote_produto.id', 'venda_itens.lote_produto_id')
      .join('produtos', 'produtos.id', 'lote_produto.produto_id')

    const paginator = await query
      .select('venda_itens.*', 'produtos.nome as produto_nome')
      .orderBy('created_at', 'desc')
      .paginate(page, limit)

    // Coluna extra vinda de join ("as produto_nome") fica em $extras — sem isto o
    // Lucid não a serializa para JSON (mesmo padrão documentado no catálogo de produtos).
    for (const item of paginator.all()) {
      (item as any).serializeExtras = () => item.$extras
    }

    return paginator
  }

  async findOrFail(id: string, company_alias?: string) {
    // //console.log(reaching query)
    return await this.baseQuery()
      .join('vendas', 'vendas.id', 'venda_itens.venda_id')
      .join('caixa', 'caixa.id', 'vendas.caixa_id')
      .join('pos', 'pos.id', 'caixa.pos_id')
      .join('empresa', 'empresa.id', 'pos.empresa_id')
      .where('empresa.company_alias', company_alias ?? '')
      .where('venda_itens.id', id)
      .select(['venda_itens.*'])
      .firstOrFail()
  }

  async create(data: Createvenda_itensDTO) {
    await Empresa.findByOrFail('company_alias', data.company_alias)

    // A venda tem de pertencer a este tenant (isolamento — `findOrFail` escopa por
    // company_alias através de caixa->pos->empresa) e estar aberta OU proforma. Sem isto,
    // o repositório confiava inteiramente no validator HTTP para barrar um venda_id de
    // outra empresa ou já fechada — qualquer chamador directo do repositório (outro
    // repositório, um teste) não tinha essa proteção.
    const vendasRepo = new vendasRepository()
    const venda = await vendasRepo.findOrFail({ id: data.venda_id, company_alias: data.company_alias! })
    if (venda.status !== 'aberta' && venda.status !== 'proforma') {
      throw new VendaIsAlreadyOpenOrCloseException()
    }

    // se já existir um item para a venda_id e lote_produto_id, atualiza a quantidade e preço_unitario, caso contrário cria um novo item
    const existingItem = await this.baseQuery()
      .where('venda_id', data.venda_id)
      .where('lote_produto_id', data.lote_produto_id)
      .first()

    if (existingItem) {
      // se a diferença entre a quantidade existente e a actual for menor que zero, então deve-se manter a quantidade existente, caso contrário, subtrair a quantidade existente da nova quantidade
      existingItem.quantidade = data.operation_type === 'sub'
        ? Math.max(existingItem.quantidade - data.quantidade, 0)
        : existingItem.quantidade + data.quantidade

      // se a quantidade for reduzida para zero, o item deve ser excluído
      if (existingItem.quantidade === 0) {
        await existingItem.delete()
        return null
      }

      if (data.preco_unitario) {
        existingItem.preco_unitario = data.preco_unitario
      }
      // `total` é uma coluna obrigatória (sem default) que o modelo nunca preenchia —
      // recalcular sempre que a quantidade ou o preço unitário mudam.
      existingItem.total = existingItem.quantidade * existingItem.preco_unitario
      await existingItem.save()
      return existingItem
    }

    // pegar o preço unitário, pois não é fornecido na criação do item, e o preço unitário é necessário para calcular o total da venda
    const loteRepo = new loteRepository()
    const lote = await loteRepo.findOrFail(data.lote_produto_id, data.company_alias!)
    const preco_unitario = lote.preco_venda

    const { empresa_id, company_alias, operation_type, ...vendaItensData } = data
    return venda_itens.create({
      ...vendaItensData,
      preco_unitario,
      total: vendaItensData.quantidade * preco_unitario,
    })
  }

  // async update(id: string, data: Updatevenda_itensDTO, company_alias?: string) {
  //   const r = await this.findOrFail(id, company_alias)
  //   r.merge(data)
  //   await r.save()
  //   return r
  // }

  async softDelete(id: string, company_alias?: string) {
    return await this.baseQuery()
      .join('vendas', 'vendas.id', 'venda_itens.venda_id')
      .join('caixa', 'caixa.id', 'vendas.caixa_id')
      .join('pos', 'pos.id', 'caixa.pos_id')
      .join('empresa', 'empresa.id', 'pos.empresa_id')
      .where('empresa.company_alias', company_alias ?? '')
      .where('venda_itens.id', id)
      .delete()
  }

}
