import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import Empresa from '#models/empresa'

/**
 * Bloqueia a linha da empresa (SELECT ... FOR UPDATE) dentro da transacção do
 * chamador — garante que duas criações concorrentes do mesmo tipo de registo para a
 * MESMA empresa serializam-se aqui (nunca calculam o "próximo número" a partir do
 * mesmo estado); empresas diferentes nunca se bloqueiam uma à outra, cada uma só
 * bloqueia a sua própria linha. Sem uma tabela de contador dedicada, a linha da
 * própria empresa faz de mutex.
 *
 * Mesmo padrão já usado (duplicado) em factura_repository.ts/estoque_repository.ts —
 * extraído para aqui por se repetir em mais de 3 repositórios (produtos, cliente,
 * pessoa, cupom, despesas, caixa, vendas, além de factura).
 */
export async function bloquearEmpresaParaSequencial(
  trx: TransactionClientContract,
  empresaId: string
): Promise<void> {
  await Empresa.query({ client: trx }).where('id', empresaId).forUpdate().firstOrFail()
}

/**
 * Para tabelas com uma coluna `empresa_id` própria (directa): devolve o próximo
 * número sequencial dessa empresa para o modelo dado. Já inclui o lock acima — chamar
 * só depois de ter a `empresa` resolvida e dentro de `db.transaction()`.
 *
 * Para tabelas escopadas por empresa só via cadeia de joins (ex.: vendas → caixa →
 * pos → empresa, antes de `empresa_id` lhes ser adicionado directamente), isto não
 * serve — resolver o empresa_id primeiro e usar `bloquearEmpresaParaSequencial` +
 * a própria query de "último número" com o join necessário.
 */
export async function proximoNumeroPorEmpresa(
  trx: TransactionClientContract,
  empresaId: string,
  modelo: { query: (opts: { client: TransactionClientContract }) => any }
): Promise<number> {
  await bloquearEmpresaParaSequencial(trx, empresaId)

  const ultimo = await modelo
    .query({ client: trx })
    .where('empresa_id', empresaId)
    .orderBy('numero', 'desc')
    .first()

  return (ultimo?.numero ?? 0) + 1
}
