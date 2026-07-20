import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import ProdutoFabricantesRepository from '#repositories/produto_fabricantes_repository'
import { ProdutoFabricanteQueryValidator } from '#validators/produto_fabricantes_validator'
import { createTenant } from '../helpers/fixtures.js'

/**
 * `ProdutoFabricanteQueryValidator` (e o equivalente em produto_fornecedores_validator.ts)
 * validava o campo de filtro como `endereço` (com cedilha), mas o DTO/repository/coluna
 * real chamam-se `endereco` (sem cedilha) — um pedido HTTP real com `?endereco=...`
 * era sempre ignorado pelo VineJS (campo não reconhecido, removido do payload
 * validado), por isso este filtro nunca funcionava através da rota, só chamando o
 * repository directamente (como fazem estes testes).
 */
test.group('produto_fabricantes — filtro endereco', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('o validator aceita "endereco" (sem cedilha) e o repository filtra por ele', async ({ assert }) => {
    const validado = await ProdutoFabricanteQueryValidator.validate({ endereco: 'Rua Teste' })
    assert.equal((validado as any).endereco, 'Rua Teste')

    const { empresa } = await createTenant()
    const repo = new ProdutoFabricantesRepository()

    const fabricanteA = await repo.create({
      nome: 'Fabricante A',
      endereco: 'Rua das Flores, 10',
      telefone: '900000001',
      email: 'a@example.com',
      company_alias: empresa.company_alias,
    } as any)
    await repo.create({
      nome: 'Fabricante B',
      endereco: 'Avenida Central, 20',
      telefone: '900000002',
      email: 'b@example.com',
      company_alias: empresa.company_alias,
    } as any)

    const encontrados = await repo.paginate(1, 20, {
      endereco: 'Flores',
      company_alias: empresa.company_alias,
    } as any)
    assert.lengthOf(encontrados, 1)
    assert.equal(encontrados[0].id, fabricanteA.id)
  })
})
