import { test } from '@japa/runner'
import { createclienteValidator } from '#validators/cliente_validator'
import { createpessoaValidator } from '#validators/pessoa_validator'

/**
 * Regressão: createclienteValidator/createpessoaValidator exigiam TODOS os campos (faltava
 * `.optional()` em quase tudo, ao contrário dos validators de update) — na prática impossível
 * de cumprir (cliente_pai_id tinha de apontar para um cliente já existente, logo nunca seria
 * possível criar o primeiro cliente; pessoa exigia um user_id de um user já existente; ambos
 * exigiam uploads de foto). Só tipo/nome devem continuar obrigatórios.
 */
test.group('cliente/pessoa validators - campos mínimos', () => {
  test('createclienteValidator aceita um payload só com tipo e nome', async ({ assert }) => {
    const result = await createclienteValidator.validate({ tipo: 'Pessoa Física', nome: 'Cliente Mínimo' })
    assert.equal(result.tipo, 'Pessoa Física')
    assert.equal(result.nome, 'Cliente Mínimo')
  })

  test('createclienteValidator continua a exigir tipo e nome', async ({ assert }) => {
    await assert.rejects(() => createclienteValidator.validate({}))
  })

  test('createpessoaValidator aceita um payload só com tipo e nome', async ({ assert }) => {
    const result = await createpessoaValidator.validate({ tipo: 'Colaborador', nome: 'Pessoa Mínima' })
    assert.equal(result.tipo, 'Colaborador')
    assert.equal(result.nome, 'Pessoa Mínima')
  })

  test('createpessoaValidator continua a exigir tipo e nome', async ({ assert }) => {
    await assert.rejects(() => createpessoaValidator.validate({}))
  })
})
