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

  /**
   * `tipo` era `vine.string()` livre, mas a coluna `cliente.tipo` é um ENUM('Pessoa Física',
   * 'Pessoa Jurídica') na BD — qualquer outro valor (ex.: 'Cliente', copiado por engano do
   * enum de `pessoa`) passava a validação e só rebentava no INSERT com "Data truncated for
   * column 'tipo'" (500 genérico em vez de um 400 claro). Só descoberto ao testar via HTTP real.
   */
  test('createclienteValidator rejeita um tipo fora do enum da tabela cliente', async ({ assert }) => {
    await assert.rejects(() => createclienteValidator.validate({ tipo: 'Cliente', nome: 'Cliente Inválido' }))
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
