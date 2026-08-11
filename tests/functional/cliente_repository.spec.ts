import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import ClienteRepository from '#repositories/cliente_repository'
import { createTenant } from '../helpers/fixtures.js'

/**
 * Pesquisa/filtros de cliente — antes desta suite, `index()` só paginava (sem `deleted`
 * nem qualquer filtro), tornando impossível encontrar um cliente pelos seus próprios
 * detalhes (nome, email, telefone, nif, etc.) numa base com muitos registos.
 */
test.group('cliente_repository — pesquisa e filtros', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('q: pesquisa livre encontra o cliente por nome, email, telefone ou nif', async ({ assert }) => {
    const { empresa } = await createTenant()
    const repo = new ClienteRepository()

    const alvo = await repo.create({
      tipo: 'Pessoa Física',
      nome: 'Joaquim Manuel',
      email: 'joaquim.manuel@example.com',
      telefone: '923456789',
      nif: '005678901LA042',
      company_alias: empresa.company_alias,
    } as any)
    await repo.create({
      tipo: 'Pessoa Física',
      nome: 'Ana Paula',
      email: 'ana.paula@example.com',
      telefone: '911111111',
      nif: '009999999LA042',
      company_alias: empresa.company_alias,
    } as any)

    for (const q of ['Joaquim', 'joaquim.manuel@example.com', '923456789', '005678901LA042']) {
      const resultado = await repo.paginate(1, 20, { q, company_alias: empresa.company_alias })
      const ids = resultado.all().map((r: any) => r.id)
      assert.include(ids, alvo.id, `q="${q}" devia encontrar o cliente`)
      assert.lengthOf(ids, 1, `q="${q}" não devia encontrar mais do que o cliente alvo`)
    }
  })

  test('filtros por campo: nome, email, telefone e nif fazem correspondência parcial', async ({ assert }) => {
    const { empresa } = await createTenant()
    const repo = new ClienteRepository()

    const alvo = await repo.create({
      tipo: 'Pessoa Jurídica',
      nome: 'Comercial Alfa Lda',
      email: 'contacto@alfa.co.ao',
      telefone: '922000111',
      nif: '5417896230',
      cidade: 'Luanda',
      company_alias: empresa.company_alias,
    } as any)
    await repo.create({
      tipo: 'Pessoa Jurídica',
      nome: 'Comercial Beta Lda',
      email: 'contacto@beta.co.ao',
      telefone: '933000222',
      nif: '5417896999',
      cidade: 'Benguela',
      company_alias: empresa.company_alias,
    } as any)

    const porNome = await repo.paginate(1, 20, { nome: 'Alfa', company_alias: empresa.company_alias })
    assert.deepEqual(porNome.all().map((r: any) => r.id), [alvo.id])

    const porEmail = await repo.paginate(1, 20, { email: 'alfa.co.ao', company_alias: empresa.company_alias })
    assert.deepEqual(porEmail.all().map((r: any) => r.id), [alvo.id])

    const porTelefone = await repo.paginate(1, 20, { telefone: '922000', company_alias: empresa.company_alias })
    assert.deepEqual(porTelefone.all().map((r: any) => r.id), [alvo.id])

    const porNif = await repo.paginate(1, 20, { nif: '5417896230', company_alias: empresa.company_alias })
    assert.deepEqual(porNif.all().map((r: any) => r.id), [alvo.id])

    const porCidade = await repo.paginate(1, 20, { cidade: 'Luanda', company_alias: empresa.company_alias })
    assert.deepEqual(porCidade.all().map((r: any) => r.id), [alvo.id])
  })

  test('filtro tipo/ativo: correspondência exacta', async ({ assert }) => {
    const { empresa } = await createTenant()
    const repo = new ClienteRepository()

    const pessoaFisica = await repo.create({
      tipo: 'Pessoa Física',
      nome: 'Cliente PF',
      ativo: true,
      company_alias: empresa.company_alias,
    } as any)
    const pessoaJuridica = await repo.create({
      tipo: 'Pessoa Jurídica',
      nome: 'Cliente PJ',
      ativo: false,
      company_alias: empresa.company_alias,
    } as any)

    const soFisica = await repo.paginate(1, 20, { tipo: 'Pessoa Física', company_alias: empresa.company_alias })
    assert.deepEqual(soFisica.all().map((r: any) => r.id), [pessoaFisica.id])

    const soAtivos = await repo.paginate(1, 20, { ativo: true, company_alias: empresa.company_alias })
    const idsAtivos = soAtivos.all().map((r: any) => r.id)
    assert.include(idsAtivos, pessoaFisica.id)
    assert.notInclude(idsAtivos, pessoaJuridica.id)
  })

  test('q e filtros por campo nunca atravessam o isolamento por tenant', async ({ assert }) => {
    const tenantA = await createTenant()
    const tenantB = await createTenant()
    const repo = new ClienteRepository()

    await repo.create({
      tipo: 'Pessoa Física',
      nome: 'Cliente Partilhado',
      nif: 'NIF-IGUAL-000',
      company_alias: tenantA.empresa.company_alias,
    } as any)
    const clienteB = await repo.create({
      tipo: 'Pessoa Física',
      nome: 'Cliente Partilhado',
      nif: 'NIF-IGUAL-000',
      company_alias: tenantB.empresa.company_alias,
    } as any)

    const resultado = await repo.paginate(1, 20, {
      q: 'Cliente Partilhado',
      company_alias: tenantB.empresa.company_alias,
    })
    assert.deepEqual(resultado.all().map((r: any) => r.id), [clienteB.id])
  })

  /**
   * A busca de cliente no frontend não pode ser pelo `id` (UUID) — precisa de filtrar
   * pela numeração sequencial por-empresa (`numero`), mesmo problema já corrigido em
   * `vendas` (ver `vendas_repository_filtros.spec.ts`).
   */
  test('numero filtra pela numeração sequencial do cliente, isolado por tenant', async ({ assert }) => {
    const tenantA = await createTenant()
    const tenantB = await createTenant()
    const repo = new ClienteRepository()

    const clienteA1 = await repo.create({
      tipo: 'Pessoa Física',
      nome: 'Cliente A1',
      company_alias: tenantA.empresa.company_alias,
    } as any)
    await repo.create({
      tipo: 'Pessoa Física',
      nome: 'Cliente A2',
      company_alias: tenantA.empresa.company_alias,
    } as any)
    const clienteB1 = await repo.create({
      tipo: 'Pessoa Física',
      nome: 'Cliente B1',
      company_alias: tenantB.empresa.company_alias,
    } as any)

    assert.equal(clienteA1.numero, 1)
    assert.equal(clienteB1.numero, 1)

    const resultadoA = await repo.paginate(1, 20, { numero: 1, company_alias: tenantA.empresa.company_alias })
    assert.deepEqual(resultadoA.all().map((r: any) => r.id), [clienteA1.id])

    const resultadoB = await repo.paginate(1, 20, { numero: 1, company_alias: tenantB.empresa.company_alias })
    assert.deepEqual(resultadoB.all().map((r: any) => r.id), [clienteB1.id])
  })
})
