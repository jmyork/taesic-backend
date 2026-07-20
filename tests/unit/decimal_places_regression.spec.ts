import { test } from '@japa/runner'
import { CaixaQueryValidator } from '#validators/caixa_validator'
import { updatecobrancaValidator } from '#validators/cobranca_validator'
import { createclienteValidator } from '#validators/cliente_validator'
import { createplanoValidator } from '#validators/plano_validator'

/**
 * `vine.number().decimal(30)` foi copiado por vários validators — `.decimal()` espera um
 * INTERVALO de casas decimais (`[min, max]`), não um único número. `.decimal(30)` exigia
 * literalmente 30 casas decimais, rejeitando qualquer valor monetário normal (100, 3000.50,
 * etc.) com "must have 30 decimal places". Afetava `caixa` (create + query, incl. os
 * `_start`/`_end` de valor_inicial/total_vendas/total_caixa), `cobranca.valor`,
 * `cliente.limite_credito`/`saldo` e `plano.preco`/`limite_uso`. Corrigido para
 * `.decimal([0, 12])`, mesma convenção usada em `produtos_validator.ts`. Só descoberto ao
 * testar `GET caixas?valor_inicial=...` via HTTP real — nenhum teste anterior validava
 * estes campos através do validator (só directamente contra o repositório).
 */
test.group('vine .decimal(30) regressão — valores monetários normais', () => {
  test('CaixaQueryValidator aceita valor_inicial e total_vendas_start/end normais', async ({ assert }) => {
    const result = await CaixaQueryValidator.validate({
      valor_inicial: 5000,
      total_vendas_start: 100,
      total_vendas_end: 2000.5,
    })
    assert.equal(result.valor_inicial, 5000)
    assert.equal(result.total_vendas_end, 2000.5)
  })

  test('updatecobrancaValidator aceita um valor monetário normal', async ({ assert }) => {
    const result = await updatecobrancaValidator.validate({ valor: 3000.5 })
    assert.equal(result.valor, 3000.5)
  })

  test('createclienteValidator aceita limite_credito/saldo normais', async ({ assert }) => {
    const result = await createclienteValidator.validate({
      tipo: 'Pessoa Física',
      nome: 'Cliente Teste',
      limite_credito: 10000,
      saldo: 250.75,
    })
    assert.equal(result.limite_credito, 10000)
    assert.equal(result.saldo, 250.75)
  })

  test('createplanoValidator aceita preco/limite_uso normais', async ({ assert }) => {
    const result = await createplanoValidator.validate({
      nome: 'Plano Teste',
      descricao: 'Plano de teste',
      preco: 15000,
      moeda: 'AOA',
      periodo: 'mensal',
      ativo: true,
      limite_uso: 100,
    })
    assert.equal(result.preco, 15000)
    assert.equal(result.limite_uso, 100)
  })
})
