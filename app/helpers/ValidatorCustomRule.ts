import vine from '@vinejs/vine'
import { FieldContext } from '@vinejs/vine/types'
import db from '@adonisjs/lucid/services/db'
import venda_itensRepository from '#repositories/venda_itens_repository'

const requiredIfNotServiceRule = async (value: unknown, _options: any, field: FieldContext) => {
  // Se o valor já existe, não precisa validar obrigatoriedade
  if (value !== null && value !== undefined && value !== '') {
    return
  }

  const produto_id = field.data.produto_id

  // Se não tem produto_id ainda, pula a validação
  // (será validado pelo produto_id required)
  if (!produto_id) {
    return
  }

  try {
    const produto = await db.from('produtos').where('id', produto_id).select('is_service').first()

    // Se não encontrou o produto, pula (será tratado pela validação de exists)
    if (!produto) {
      return
    }

    // Se NÃO é serviço e o campo está vazio, reporta erro
    if (!produto.is_service) {
      field.report(
        'The Field {{ field }} Is Required For Touchable Products',
        'requiredIfNotService',
        field
      )
    }
  } catch (error) {
    console.error('Erro na validação requiredIfNotService:', error)
    // Em caso de erro, não bloqueia a validação
  }
}
/**
 * Custom rule para validar campos obrigatórios quando o produto não é serviço
 */
export const requiredIfNotService = vine.createRule(requiredIfNotServiceRule, {
  implicit: true,
})

export const validateEstoqueDisponivel = vine.createRule(
  async (value: unknown, _options: any, field: FieldContext) => {
    const quantidade = Number(value)
    const tipo_movimentacao = field.data.tipo_movimentacao
    const lote_produto_id = field.data.lote_produto_id

    // Tipos de movimentação que reduzem estoque
    const movimentacoesSaida = ['saida', 'ajuste_negativo', 'transferencia_saida']

    // Só valida para movimentações de saída
    if (!tipo_movimentacao || !movimentacoesSaida.includes(tipo_movimentacao)) {
      return
    }

    // Precisa do lote para validar
    if (!lote_produto_id) {
      return
    }

    try {
      // Busca o lote
      const lote = await db
        .from('lote_produto')
        .where('id', lote_produto_id)
        .select('quantidade_em_estoque')
        .first()

      if (!lote) {
        return // Será tratado pela validação de exists
      }

      const estoqueDisponivel = lote.quantidade_em_estoque || 0

      // Se a quantidade solicitada excede o disponível, reporta erro
      if (quantidade > estoqueDisponivel) {
        field.report(
          `Insufficient stock. Available: ${estoqueDisponivel}, Requested: ${quantidade}`,
          'insufficientStock',
          field
        )
      }
    } catch (error) {
      console.error('Erro ao validar estoque disponível:', error)
    }
  },
  {
    implicit: true,
  }
)

export const EstoqueDisponivelCheck = vine.createRule(
  async (value: unknown, _options: any, field: FieldContext) => {
    let quantidade = Number(value)
    const lote_produto_id = field.data.lote_produto_id


    // Precisa do lote para validar
    if (!lote_produto_id) {
      return
    }

    // ver se a quantidade que já existe mais a quantidade existente é superior ao que tem em estoque deste produto.

    const vendaItemRepo = new venda_itensRepository()

    const venda_item_data = await vendaItemRepo.paginate(1, 1, {
      venda_id: field.data.venda_id,
      lote_produto_id
    })

    const venda_item = venda_item_data[0] ?? []
    if (venda_item) {
      quantidade += venda_item.quantidade
    }


    try {
      // Busca o lote
      const lote = await db
        .from('lote_produto')
        .where('id', lote_produto_id)
        .select('quantidade_em_estoque')
        .first()

      if (!lote) {
        return // Será tratado pela validação de exists
      }

      const estoqueDisponivel = lote.quantidade_em_estoque || 0

      // Se a quantidade solicitada excede o disponível, reporta erro
      if (quantidade > estoqueDisponivel) {
        field.report(
          `Insufficient stock. Available: ${estoqueDisponivel}, Requested: ${quantidade}`,
          'insufficientStock',
          field
        )
      }
    } catch (error) {
      console.error('Erro ao validar estoque disponível:', error)
    }
  },
  {
    implicit: true,
  }
)


export const CheckPrecoCompraEqualOrLessThanPrecoVenda = vine.createRule(
  async (value: unknown, _options: any, field: FieldContext) => {
    const preco_compra = Number(value)
    const preco_venda = Number(field.data.preco_venda)

    // Se algum dos valores não é um número válido, deixa passar
    // (será tratado pelas validações individuais de cada campo)
    if (isNaN(preco_compra) || isNaN(preco_venda) || preco_venda === 0) {
      return
    }

    if (preco_compra > preco_venda) {
      field.report(
        'The purchase price ({{ field }}) must be equal to or less than the preco_venda',
        'precoCompraExceedsPrecoVenda',
        field
      )
    }
  },
  {
    implicit: true,
  }
)

