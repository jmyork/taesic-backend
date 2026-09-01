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

/**
 * O próximo número DENTRO de uma série: por empresa, tipo de documento, série e ano.
 *
 * ── Porque é que não serve o `proximoNumeroPorEmpresa` ────────────────────────
 *
 * O art.º 10.º do Decreto Presidencial 71/25 exige numeração «sequencial e
 * cronológica por tipo de documento» e por ano económico. Uma sequência única por
 * empresa, partilhada por facturas, notas de crédito e recibos, produz `FT 1`,
 * `NC 2`, `FT 3` — nenhuma das séries fica sequencial, todas ficam com buracos, e
 * nenhuma passa uma inspecção.
 *
 * `proximoNumeroPorEmpresa` continua a existir e continua correcto para tudo o
 * resto (produtos, clientes, vendas, caixas): esses números são identificadores
 * internos, não numeração fiscal, e para eles uma sequência por empresa é
 * exactamente o que se quer.
 *
 * ── A chave é a SÉRIE, e não o tipo ──────────────────────────────────────────
 *
 * O contador é por `(empresa, série, ano)` — sem o tipo. Parece que falta ali uma
 * coluna, e não falta: uma série serve um tipo de documento só (E37 da AGT), pelo
 * que a série já determina o tipo. Acrescentar o tipo à chave não afinaria nada, e
 * partiria o caso em que ele não determina a série.
 *
 * Esse caso existe: `Factura` e `Factura Genérica` são dois tipos INTERNOS que a
 * AGT comunica ambos como `FT`, e portanto partilham a série `FT2026`. Contados
 * por tipo, cada um começaria no 1 e os dois primeiros documentos sairiam ambos
 * como `FT FT2026/1` — o mesmo `documentNo` para dois documentos diferentes, que é
 * a coisa que a numeração existe para impedir. Contados por série, partilham o
 * contador, que é o que a partilha da série significa.
 *
 * ── A serialização é a mesma, e é de propósito ────────────────────────────────
 *
 * O bloqueio continua a ser na linha da EMPRESA, e não numa linha por série. Duas
 * emissões concorrentes de séries diferentes da mesma empresa esperam uma pela
 * outra — o que é mais bloqueio do que o estritamente necessário.
 *
 * Fica assim por uma razão: a alternativa é uma tabela de contadores por série, e
 * um contador que viva fora da tabela dos documentos pode divergir dela. O que
 * está gravado em `factura` é a verdade sobre que números foram usados, e ler daí
 * o último não pode dessincronizar-se de nada. O custo é uma espera de milissegundos
 * entre duas emissões da mesma empresa; o da outra via é um número repetido num
 * documento fiscal.
 */
export async function proximoNumeroPorSerie(
  trx: TransactionClientContract,
  empresaId: string,
  modelo: { query: (opts: { client: TransactionClientContract }) => any },
  chave: { serie: string; ano: number }
): Promise<number> {
  await bloquearEmpresaParaSequencial(trx, empresaId)

  const ultimo = await modelo
    .query({ client: trx })
    .where('empresa_id', empresaId)
    .where('serie', chave.serie)
    .where('ano', chave.ano)
    .orderBy('numero', 'desc')
    .first()

  return (ultimo?.numero ?? 0) + 1
}
