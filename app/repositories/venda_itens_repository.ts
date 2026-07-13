import venda_itens from '#models/faturacao/venda_itens'
import { Createvenda_itensDTO, VendaItensQueryDTO } from '#dtos/venda_itens_dto'
import Empresa from '#models/empresa'
import loteRepository from './lote_repository.js'
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

    return await query
      .select('venda_itens.*')
      .orderBy('created_at', 'desc')
      .paginate(page, limit)
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
