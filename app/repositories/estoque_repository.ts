import estoque from '#models/faturacao/estoque'
import { CreateestoqueDTO, EstoqueQueryDTO } from '#dtos/estoque_dto'
import Empresa from '#models/empresa'
import loteRepository from './lote_repository.js'
import Lote from '#models/faturacao/lote'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

export default class estoqueRepository {
  baseQuery() {
    return estoque.query()
  }

  async paginate(page = 1, limit = 20, filter?: EstoqueQueryDTO) {
    let query = this.baseQuery()

    // Deleted filter
    if (filter?.deleted === 'deleted') {
      query.whereNotNull('estoque.deleted_at')
    } else if (filter?.deleted !== 'all') {
      query.whereNull('estoque.deleted_at')
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
    applyRange('estoque.created_at', filter?.createdDtStart, filter?.createdDtEnd)
    applyRange('estoque.updated_at', filter?.updatedDtStart, filter?.updatedDtEnd)

    // Filtros exatos
    if (filter?.pos_id) {
      query.where('estoque.pos_id', filter.pos_id)
    }

    if (filter?.registrado_por) {
      query.where('estoque.registrado_por', filter.registrado_por)
    }

    if (filter?.tipo_movimentacao) {
      query.where('estoque.tipo_movimentacao', filter.tipo_movimentacao)
    }

    if (filter?.lote_produto_id) {
      query.where('estoque.lote_produto_id', filter.lote_produto_id)
    }

    if (filter?.produto_id) {
      query.where('estoque.produto_id', filter.produto_id)
    }

    // Quantidade (exata ou range)
    if (filter?.quantidade !== undefined) {
      query.where('estoque.quantidade', filter.quantidade)
    } else {
      applyRange('estoque.quantidade', filter?.quantidade_start, filter?.quantidade_end)
    }

    // Motivo (busca parcial)
    if (filter?.motivo) {
      query.where('estoque.motivo_retirada', 'like', `%${filter.motivo}%`)
    }

    // Empresa/Company (evita joins duplicados)
    let needsJoin = false

    if (filter?.company_alias || filter?.empresa_id) {
      needsJoin = true
    }

    if (needsJoin) {
      query
        .join('lote_produto', 'lote_produto.id', 'estoque.lote_produto_id')
        .join('produtos', 'lote_produto.produto_id', 'produtos.id')
        .join('empresa', 'empresa.id', 'produtos.empresa_id')

      if (filter?.company_alias) {
        query.where('empresa.company_alias', filter.company_alias)
      }

      if (filter?.empresa_id && !filter.company_alias) {
        query.where('produtos.empresa_id', filter.empresa_id)
      }
    }

    return query.select('estoque.*').orderBy('estoque.created_at', 'desc').paginate(page, limit)
  }

  async findOrFail(id: string, company_alias?: string) {
    return await this.baseQuery()
      .join('lote_produto', 'lote_produto.id', 'estoque.lote_produto_id')
      .join('produtos', 'produtos.id', 'lote_produto.produto_id')
      .join('empresa', 'empresa.id', 'produtos.empresa_id')
      .where('empresa.company_alias', company_alias ?? '')
      .where('estoque.id', id)
      .select(['estoque.*'])
      .firstOrFail()
  }

  async create(data: CreateestoqueDTO, trx?: TransactionClientContract) {
    await Empresa.findByOrFail('company_alias', data.company_alias)

    // Define valores padrão
    const tipo_movimentacao = data.tipo_movimentacao || 'entrada'
    const motivo = data.motivo || 'compra'

    const { empresa_id, company_alias, ...estoqueData } = data

    const movimentacoesEntrada = ['entrada', 'ajuste_positivo', 'transferencia_entrada']
    const movimentacoesSaida = ['saida', 'ajuste_negativo', 'transferencia_saida']

    if (!movimentacoesEntrada.includes(tipo_movimentacao) && !movimentacoesSaida.includes(tipo_movimentacao)) {
      // tipos genéricos como "ajuste"/"transferencia" (sem direção) nunca atualizavam o saldo
      // do lote de forma silenciosa — falhar alto em vez de gravar um movimento sem efeito.
      throw new Error(
        `Tipo de movimentação inválido: "${tipo_movimentacao}". Use um dos valores com direção explícita (${[...movimentacoesEntrada, ...movimentacoesSaida].join(', ')}).`
      )
    }

    // Verificação prévia (fora da transação) apenas para devolver um erro amigável cedo no
    // caso comum sem concorrência — a verificação que efetivamente protege contra overselling
    // é a que corre dentro da transação, com a linha do lote bloqueada.
    const loteRepo = new loteRepository()
    const lotePreCheck = await loteRepo.findOrFail(estoqueData.lote_produto_id, company_alias)
    if (movimentacoesSaida.includes(tipo_movimentacao)) {
      const disponivel = lotePreCheck.quantidade_em_estoque || 0
      if (disponivel < estoqueData.quantidade!) {
        throw new Error(
          `Estoque insuficiente. Disponível: ${disponivel}, Solicitado: ${estoqueData.quantidade}`
        )
      }
    }

    // Bloqueia a linha do lote até ao fim da transação (SELECT ... FOR UPDATE), impedindo
    // que duas movimentações concorrentes sobre o mesmo lote leiam o mesmo saldo inicial.
    const runInTransaction = async (client: TransactionClientContract) => {
      const lote = await Lote.query({ client })
        .where('lote_produto.id', estoqueData.lote_produto_id)
        .forUpdate()
        .firstOrFail()

      const quantidadeAtual = lote.quantidade_em_estoque || 0

      if (movimentacoesSaida.includes(tipo_movimentacao) && quantidadeAtual < estoqueData.quantidade!) {
        throw new Error(
          `Estoque insuficiente. Disponível: ${quantidadeAtual}, Solicitado: ${estoqueData.quantidade}`
        )
      }

      const est = await estoque.create(
        {
          ...estoqueData,
          tipo_movimentacao,
          motivo,
        },
        { client }
      )

      if (movimentacoesEntrada.includes(tipo_movimentacao)) {
        lote.quantidade_em_estoque = quantidadeAtual + estoqueData.quantidade!
      } else {
        lote.quantidade_em_estoque = quantidadeAtual - estoqueData.quantidade!
      }

      lote.useTransaction(client)
      await lote.save()

      return est
    }

    // Quando o chamador já tem uma transação aberta (ex.: fecho de venda, reembolso), a
    // movimentação de stock participa nela — se algo falhar a meio, tudo é revertido junto.
    // Caso contrário, gere a sua própria transação como antes.
    if (trx) {
      return runInTransaction(trx)
    }
    return db.transaction(runInTransaction)
  }
}
