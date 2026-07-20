import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import EstoqueRepository from '#repositories/estoque_repository'
import Lote from '#models/faturacao/lote'
import { createTenant, createProduto, createLote } from '../helpers/fixtures.js'

test.group('estoque_repository.create()', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('rejeita uma saída maior do que o stock disponível', async ({ assert }) => {
    const { empresa, pos } = await createTenant()
    const produto = await createProduto(empresa)
    const lote = await createLote(produto, { quantidade_em_estoque: 5 })

    const repo = new EstoqueRepository()

    await assert.rejects(() =>
      repo.create({
        pos_id: pos.id,
        registrado_por: undefined,
        motivo: 'venda',
        tipo_movimentacao: 'saida',
        quantidade: 10,
        lote_produto_id: lote.id,
        company_alias: empresa.company_alias,
      } as any)
    )

    assert.equal(Number((await Lote.findOrFail(lote.id)).quantidade_em_estoque), 5, 'stock não deve mudar quando a operação é rejeitada')
  })

  test('rejeita um tipo de movimentação sem direção explícita', async ({ assert }) => {
    const { empresa, pos } = await createTenant()
    const produto = await createProduto(empresa)
    const lote = await createLote(produto, { quantidade_em_estoque: 5 })

    const repo = new EstoqueRepository()

    await assert.rejects(() =>
      repo.create({
        pos_id: pos.id,
        motivo: 'ajuste',
        tipo_movimentacao: 'ajuste' as any,
        quantidade: 1,
        lote_produto_id: lote.id,
        company_alias: empresa.company_alias,
      } as any)
    )

    assert.equal(Number((await Lote.findOrFail(lote.id)).quantidade_em_estoque), 5)
  })

  test('entrada incrementa e saída decrementa corretamente a quantidade do lote', async ({ assert }) => {
    const { empresa, pos } = await createTenant()
    const produto = await createProduto(empresa)
    const lote = await createLote(produto, { quantidade_em_estoque: 5 })

    const repo = new EstoqueRepository()

    await repo.create({
      pos_id: pos.id,
      motivo: 'compra',
      tipo_movimentacao: 'entrada',
      quantidade: 20,
      lote_produto_id: lote.id,
      company_alias: empresa.company_alias,
    } as any)
    assert.equal(Number((await Lote.findOrFail(lote.id)).quantidade_em_estoque), 25)

    await repo.create({
      pos_id: pos.id,
      motivo: 'venda',
      tipo_movimentacao: 'saida',
      quantidade: 8,
      lote_produto_id: lote.id,
      company_alias: empresa.company_alias,
    } as any)
    assert.equal(Number((await Lote.findOrFail(lote.id)).quantidade_em_estoque), 17)
  })

  /**
   * `estoque.produto_id` existe na tabela e é um filtro exposto em `EstoqueQueryValidator`,
   * mas `create()` nunca o preenchia — todas as linhas ficavam com `produto_id: null`, e
   * `GET estoque?produto_id=...` devolvia sempre vazio, silenciosamente. Só descoberto ao
   * testar os filtros via HTTP real.
   */
  test('create() preenche produto_id a partir do lote', async ({ assert }) => {
    const { empresa, pos } = await createTenant()
    const produto = await createProduto(empresa)
    const lote = await createLote(produto, { quantidade_em_estoque: 5 })

    const repo = new EstoqueRepository()
    const est = await repo.create({
      pos_id: pos.id,
      motivo: 'compra',
      tipo_movimentacao: 'entrada',
      quantidade: 10,
      lote_produto_id: lote.id,
      company_alias: empresa.company_alias,
    } as any)

    assert.equal(est.produto_id, produto.id)
  })

  // Nota: dentro de testUtils.db().withGlobalTransaction() todas as queries do teste
  // partilham uma única ligação/transação (cada create() vira um savepoint nessa mesma
  // ligação), por isso este teste não exercita bloqueio real entre ligações concorrentes —
  // isso depende das garantias do MySQL para `SELECT ... FOR UPDATE`. O que este teste
  // valida é a propriedade que importa ao nível da aplicação: cada chamada volta a ler o
  // saldo atual antes de decidir, em vez de confiar num valor lido antecipadamente:
  test('duas saídas sequenciais nunca vendem mais do que o stock disponível (revalida o saldo a cada chamada)', async ({ assert }) => {
    const { empresa, pos } = await createTenant()
    const produto = await createProduto(empresa)
    const lote = await createLote(produto, { quantidade_em_estoque: 10 })

    const repo = new EstoqueRepository()

    const movimentacao = (quantidade: number) =>
      repo
        .create({
          pos_id: pos.id,
          motivo: 'venda',
          tipo_movimentacao: 'saida',
          quantidade,
          lote_produto_id: lote.id,
          company_alias: empresa.company_alias,
        } as any)
        .then(() => 'ok' as const)
        .catch(() => 'rejected' as const)

    // duas saídas de 7 concorrentes contra um stock de 10: juntas excedem o disponível,
    // isoladas cada uma teria sucesso — só uma pode vencer o lock e ser aceite.
    const [r1, r2] = await Promise.all([movimentacao(7), movimentacao(7)])
    const results = [r1, r2]

    assert.equal(results.filter((r) => r === 'ok').length, 1, 'exatamente uma das duas saídas deve ser aceite')
    assert.equal(results.filter((r) => r === 'rejected').length, 1, 'a outra deve ser rejeitada por falta de stock')
    assert.equal(Number((await Lote.findOrFail(lote.id)).quantidade_em_estoque), 3, '10 - 7 = 3, nunca deve ficar negativo')
  })
})
