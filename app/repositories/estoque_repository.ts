import estoque from '#models/faturacao/estoque'
import { CreateestoqueDTO, EstoqueQueryDTO } from '#dtos/estoque_dto'
import Empresa from '#models/empresa'
import loteRepository from './lote_repository.js'
import Lote from '#models/faturacao/lote'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import env from '#start/env'
import emitter from '@adonisjs/core/services/emitter'
import EstoqueCritico from '#events/estoque_critico'
import EstoqueInsuficienteException from '#exceptions/estoque_insuficiente_exception'
import TipoMovimentacaoInvalidoException from '#exceptions/tipo_movimentacao_invalido_exception'
import { applyCommonFilters, FieldSpec } from '../helpers/query_filters.js'

const ESTOQUE_FILTER_FIELDS: FieldSpec[] = [
  { kind: 'exact', column: 'estoque.pos_id', key: 'pos_id' },
  { kind: 'exact', column: 'estoque.registrado_por', key: 'registrado_por' },
  { kind: 'exact', column: 'estoque.tipo_movimentacao', key: 'tipo_movimentacao' },
  { kind: 'exact', column: 'estoque.lote_produto_id', key: 'lote_produto_id' },
  { kind: 'exact', column: 'estoque.produto_id', key: 'produto_id' },
  { kind: 'range', column: 'estoque.quantidade', startKey: 'quantidade_start', endKey: 'quantidade_end', exactKey: 'quantidade' },
  // era 'estoque.motivo_retirada' — coluna inexistente (a real chama-se `motivo`); o filtro
  // rebentava sempre com "Unknown column" em vez de simplesmente não combinar nada.
  { kind: 'like', column: 'estoque.motivo', key: 'motivo' },
]

export default class estoqueRepository {
  baseQuery() {
    return estoque.query()
  }

  async paginate(page = 1, limit = 20, filter?: EstoqueQueryDTO) {
    let query = applyCommonFilters(this.baseQuery(), filter, {
      table: 'estoque',
      fields: ESTOQUE_FILTER_FIELDS,
    })

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
      throw new TipoMovimentacaoInvalidoException(tipo_movimentacao, [
        ...movimentacoesEntrada,
        ...movimentacoesSaida,
      ])
    }

    // Verificação prévia (fora da transação) apenas para devolver um erro amigável cedo no
    // caso comum sem concorrência — a verificação que efetivamente protege contra overselling
    // é a que corre dentro da transação, com a linha do lote bloqueada.
    const loteRepo = new loteRepository()
    const lotePreCheck = await loteRepo.findOrFail(estoqueData.lote_produto_id, company_alias)
    if (movimentacoesSaida.includes(tipo_movimentacao)) {
      const disponivel = lotePreCheck.quantidade_em_estoque || 0
      if (disponivel < estoqueData.quantidade!) {
        throw new EstoqueInsuficienteException(disponivel, estoqueData.quantidade!)
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
        throw new EstoqueInsuficienteException(quantidadeAtual, estoqueData.quantidade!)
      }

      const est = await estoque.create(
        {
          ...estoqueData,
          produto_id: lote.produto_id,
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

      return { est, quantidadeRestante: lote.quantidade_em_estoque }
    }

    // Quando o chamador já tem uma transação aberta (ex.: fecho de venda, reembolso), a
    // movimentação de stock participa nela — se algo falhar a meio, tudo é revertido junto.
    // Caso contrário, gere a sua própria transação como antes.
    const resultado = trx ? await runInTransaction(trx) : await db.transaction(runInTransaction)

    // Só depois da transação confirmar — nunca atrasa nem arrisca a movimentação em si.
    if (movimentacoesSaida.includes(tipo_movimentacao)) {
      await this.avisarSeEstoqueCritico(estoqueData.lote_produto_id, resultado.quantidadeRestante, company_alias)
    }

    return resultado.est
  }

  /** Emite `EstoqueCritico` quando uma saída deixa o lote com quantidade <= limiar
   * configurado (env `ESTOQUE_LIMIAR_CRITICO`, por omissão 5). Nunca deixa um erro aqui
   * (na notificação) transformar uma movimentação de stock já confirmada em falha. */
  private async avisarSeEstoqueCritico(loteId: string, quantidadeRestante: number, companyAlias?: string) {
    try {
      const limiar = Number(env.get('ESTOQUE_LIMIAR_CRITICO', '5'))
      if (quantidadeRestante > limiar) return

      const lote = await Lote.query().where('lote_produto.id', loteId).preload('produto').first()
      if (!lote) return

      await emitter.emit(
        EstoqueCritico,
        new EstoqueCritico(
          loteId,
          lote.produto?.nome ?? 'desconhecido',
          companyAlias ?? '',
          quantidadeRestante,
          limiar
        )
      )
    } catch (error) {
      console.error('Falha ao avaliar/emitir alerta de estoque crítico:', error)
    }
  }
}
