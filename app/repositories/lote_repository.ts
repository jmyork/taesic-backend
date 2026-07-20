import { DateTime } from 'luxon'
import Lote from '#models/faturacao/lote'
import { CreateloteDTO, UpdateloteDTO, LoteQueryDTO } from '#dtos/lote_dto'
import Empresa from '#models/empresa'
import produtos from '#models/faturacao/produtos'
import estoque from '#models/faturacao/estoque'
import env from '#start/env'
import emitter from '@adonisjs/core/services/emitter'
import LoteValidadeProxima from '#events/lote_validade_proxima'

export default class loteRepository {
  baseQuery() {
    return Lote.query()
  }

  async paginate(page = 1, limit = 20, filter?: LoteQueryDTO) {
    let query = this.baseQuery()

    // Deleted filter
    if (filter?.deleted === 'deleted') {
      query.whereNotNull('lote_produto.deleted_at')
    } else if (filter?.deleted !== 'all') {
      query.whereNull('lote_produto.deleted_at')
    }

    // Helper genérico (datas e números)
    const applyRange = (field: string, start?: number | Date, end?: number | Date) => {
      if (start != null && end != null) {
        query.whereBetween(field, [start, end])
      } else if (start != null) {
        query.where(field, '>=', start)
      } else if (end != null) {
        query.where(field, '<=', end)
      }
    }

    // Audit dates (ranges)
    applyRange('lote_produto.created_at', filter?.createdDtStart, filter?.createdDtEnd)
    applyRange('lote_produto.updated_at', filter?.updatedDtStart, filter?.updatedDtEnd)

    // Data de fabrico (exata ou range)
    if (filter?.data_fabrico) {
      query.where('lote_produto.data_fabrico', filter.data_fabrico)
    } else {
      applyRange('lote_produto.data_fabrico', filter?.data_fabrico_start, filter?.data_fabrico_end)
    }

    // Data de validade (exata ou range)
    if (filter?.data_validade) {
      query.where('lote_produto.data_validade', filter.data_validade)
    } else {
      applyRange(
        'lote_produto.data_validade',
        filter?.data_validade_start,
        filter?.data_validade_end
      )
    }

    // Preços (exatos ou ranges)
    if (filter?.preco_compra !== undefined) {
      query.where('lote_produto.preco_compra', filter.preco_compra)
    } else {
      applyRange('lote_produto.preco_compra', filter?.preco_compra_start, filter?.preco_compra_end)
    }

    if (filter?.preco_venda !== undefined) {
      query.where('lote_produto.preco_venda', filter.preco_venda)
    } else {
      applyRange('lote_produto.preco_venda', filter?.preco_venda_start, filter?.preco_venda_end)
    }

    // Quantidade (exata)
    if (filter?.quantidade_em_estoque !== undefined) {
      query.where('lote_produto.quantidade_em_estoque', filter.quantidade_em_estoque)
    }

    // Produto
    if (filter?.produto_id) {
      query.where('lote_produto.produto_id', filter.produto_id)
    }

    // Lote (busca parcial)
    if (filter?.lote) {
      query.where('lote_produto.lote', 'like', `%${filter.lote}%`)
    }

    // Empresa/Company (evita joins duplicados)
    let needsJoin = false

    if (filter?.company_alias || filter?.empresa_id) {
      needsJoin = true
    }

    if (needsJoin) {
      query
        .join('produtos', 'lote_produto.produto_id', 'produtos.id')
        .join('empresa', 'empresa.id', 'produtos.empresa_id')

      if (filter?.company_alias) {
        query.where('empresa.company_alias', filter.company_alias)
      }

      if (filter?.empresa_id) {
        query.where('produtos.empresa_id', filter.empresa_id)
      }
    }

    return query
      .select('lote_produto.*')
      .orderBy('lote_produto.created_at', 'desc')
      .paginate(page, limit)
  }

  async findOrFail(id: string, company_alias?: string) {
    return await this.baseQuery()
      .join('produtos', 'produtos.id', 'lote_produto.produto_id')
      .join('empresa', 'empresa.id', 'produtos.empresa_id')
      .where('empresa.company_alias', company_alias ?? '')
      .where('lote_produto.id', id)
      .select(['lote_produto.*'])
      .firstOrFail()
  }

  async create(data: CreateloteDTO) {
    await Empresa.findByOrFail('company_alias', data.company_alias)

    // Busca o produto para verificar se é serviço
    const produto = await produtos.findOrFail(data.produto_id)

    const { empresa_id, company_alias, user_id, ...loteData } = data

    // Se for serviço, remove os campos específicos de lote
    if (produto.is_service) {
      const {
        data_validade,
        data_fabrico,
        quantidade_em_estoque,
        preco_compra,
        lote,
        ...servicoData
      } = loteData

      const createdLote = await Lote.create({ ...servicoData })
      await estoque.create({
        lote_produto_id: createdLote.id,
        registrado_por: user_id,
      })
      return createdLote
    }

    // Se não for serviço, cria com todos os campos
    return Lote.create({ ...loteData })
  }

  async update(id: string, data: UpdateloteDTO, company_alias?: string) {
    const lote = await this.findOrFail(id, company_alias)

    // Busca o produto atual ou o novo produto caso esteja a ser alterado
    const produto = await produtos.findOrFail(data.produto_id ?? lote.produto_id)

    // Se for serviço, remove campos que não fazem sentido
    if (produto.is_service) {
      const {
        data_validade,
        data_fabrico,
        quantidade_em_estoque,
        preco_compra,
        lote: numero_lote,
        ...servicoData
      } = data

      lote.merge(servicoData)
    } else {
      lote.merge(data)
    }

    await lote.save()

    return lote
  }

  async softDelete(id: string, company_alias?: string) {
    const lote = await this.baseQuery()
      .join('produtos', 'produtos.id', 'lote_produto.produto_id')
      .join('empresa', 'empresa.id', 'produtos.empresa_id')
      .where('empresa.company_alias', company_alias ?? '')
      .where('lote_produto.id', id)
      .select('lote_produto.*')
      .firstOrFail()
    lote.deletedAt = lote.deletedAt ? null : DateTime.now()
    await lote.save()
  }

  /**
   * Emite `LoteValidadeProxima` para lotes com stock > 0 dentro de `diasAlerta` da validade
   * (ou já expirados). Usado por `node ace estoque:check-alertas` — correr periodicamente
   * via cron externo, mesmo padrão de agendamento que `empresa:clean:expired`.
   *
   * @returns número de lotes para os quais um alerta foi emitido.
   */
  async avisarLotesProximosValidade(diasAlerta = Number(env.get('LOTE_VALIDADE_ALERTA_DIAS', '30'))) {
    const limite = DateTime.now().plus({ days: diasAlerta })

    const lotes = await this.baseQuery()
      .join('produtos', 'produtos.id', 'lote_produto.produto_id')
      .join('empresa', 'empresa.id', 'produtos.empresa_id')
      .where('lote_produto.quantidade_em_estoque', '>', 0)
      .whereNull('lote_produto.deleted_at')
      .where('lote_produto.data_validade', '<=', limite.toSQLDate()!)
      .select('lote_produto.*', 'produtos.nome as produto_nome', 'empresa.company_alias as company_alias_alerta')

    for (const lote of lotes) {
      const dataValidade = DateTime.fromJSDate(new Date(lote.data_validade))
      const diasRestantes = Math.ceil(dataValidade.diff(DateTime.now(), 'days').days)

      await emitter.emit(
        LoteValidadeProxima,
        new LoteValidadeProxima(
          lote.id,
          lote.$extras.produto_nome ?? 'desconhecido',
          lote.$extras.company_alias_alerta ?? '',
          dataValidade,
          diasRestantes
        )
      )
    }

    return lotes.length
  }
}
