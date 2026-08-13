import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import MetodoPagamento from '#models/metodopagamento'

/**
 * Métodos de pagamento tradicionais, criados automaticamente para cada empresa nova.
 *
 * Porque é que isto existe: `vendas_repository.close()` recusa fechar uma venda sem
 * pelo menos um `vendapagamento` associado, e um pagamento precisa de um
 * `metodo_pagamento_id` real. Uma empresa acabada de registar não tinha nenhum, por
 * isso o PDV criava-os à pressa na primeira venda — mas só quando o utilizador era
 * Admin (o RBAC só lhe dá `domain_metodo_pagamento.store`). Na prática, um Vendedor
 * numa empresa nova ficava impedido de vender, com um erro de configuração.
 *
 * Os NOMES têm de continuar a casar com `METODO_PAGAMENTO_MATCH` do frontend
 * (`pdv/vendas/completeSale/pageContext.tsx`: /numer/i, /tpa|multicaixa/i,
 * /transfer/i) — senão o PDV não os reconhece e volta a tentar criá-los.
 */
export const METODOS_PAGAMENTO_PADRAO = [
  { nome: 'Numerário', descricao: 'Pagamento em dinheiro' },
  { nome: 'TPA / Multicaixa', descricao: 'Pagamento por cartão via TPA' },
  { nome: 'Transferência Bancária', descricao: 'Pagamento por transferência bancária' },
] as const

/**
 * Cria os métodos em falta para uma empresa. Idempotente: já existindo um método com
 * o mesmo nome nessa empresa, não é duplicado — a tabela tem `unique(empresa_id, nome)`
 * e este helper também é usado fora do registo (empresas anteriores à mudança).
 *
 * `trx` é opcional para poder correr dentro da transacção de criação da empresa.
 */
export async function semearMetodosPagamento(
  empresaId: string,
  trx?: TransactionClientContract
): Promise<MetodoPagamento[]> {
  const existentes = await MetodoPagamento.query({ client: trx })
    .where('empresa_id', empresaId)
    .select('nome')

  const jaExistem = new Set(existentes.map((m) => m.nome.trim().toLowerCase()))

  const emFalta = METODOS_PAGAMENTO_PADRAO.filter(
    (m) => !jaExistem.has(m.nome.toLowerCase())
  ).map((m) => ({ nome: m.nome, descricao: m.descricao, empresa_id: empresaId }))

  if (emFalta.length === 0) return []

  return MetodoPagamento.createMany(emFalta, { client: trx })
}
