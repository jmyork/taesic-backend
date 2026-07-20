import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import ProdutosRepository from '#repositories/produtos_repository'
import MarcaRepository from '#repositories/marca_repository'
import { createTenant } from '../helpers/fixtures.js'

/**
 * `produtos_repository.paginate()` tinha um bloco de filtro por `marca_id` duplicado
 * (copiado duas vezes) e o filtro `is_service` comparava uma coluna booleana com `LIKE
 * '%true%'/'%false%'` — o MySQL guarda booleanos como 0/1, por isso esse filtro nunca
 * combinava com nada e nunca filtrava. Nenhum teste cobria `paginate()` com filtros
 * antes desta sessão, só isolamento de tenant.
 */
test.group('produtos_repository.paginate() — filtros', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('filtra por nome (LIKE), marca_id (exacto) e is_service', async ({ assert }) => {
    const { empresa } = await createTenant()
    const companyAlias = empresa.company_alias
    const repo = new ProdutosRepository()

    const marcaA = await new MarcaRepository().create({ nome: 'Marca A', company_alias: companyAlias } as any)
    const marcaB = await new MarcaRepository().create({ nome: 'Marca B', company_alias: companyAlias } as any)

    const produtoA = await repo.create({
      nome: 'Paracetamol 500mg',
      descricao: 'Analgésico',
      is_service: false,
      marca_id: marcaA.id,
      company_alias: companyAlias,
    } as any)
    await repo.create({
      nome: 'Ibuprofeno 400mg',
      descricao: 'Anti-inflamatório',
      is_service: false,
      marca_id: marcaB.id,
      company_alias: companyAlias,
    } as any)
    const servico = await repo.create({
      nome: 'Consulta de enfermagem',
      descricao: 'Serviço',
      is_service: true,
      company_alias: companyAlias,
    } as any)

    // nome (busca parcial)
    const porNome = await repo.paginate(1, 20, { nome: 'Paracetamol', company_alias: companyAlias })
    assert.lengthOf(porNome, 1)
    assert.equal(porNome[0].id, produtoA.id)

    // marca_id (exacto) — antes filtrava por LIKE, o que já funcionava para UUIDs completos,
    // mas de forma desnecessariamente imprecisa; confirma que continua exacto.
    const porMarca = await repo.paginate(1, 20, { marca_id: marcaA.id, company_alias: companyAlias })
    assert.lengthOf(porMarca, 1)
    assert.equal(porMarca[0].id, produtoA.id)

    // is_service — o bug fazia este filtro devolver sempre a lista toda (nunca combinava
    // com o LIKE), por isso confirmar que agora devolve só o serviço.
    const porServico = await repo.paginate(1, 20, { is_service: true, company_alias: companyAlias })
    assert.lengthOf(porServico, 1)
    assert.equal(porServico[0].id, servico.id)

    const porNaoServico = await repo.paginate(1, 20, { is_service: false, company_alias: companyAlias })
    assert.lengthOf(porNaoServico, 2)
  })

  test('isola por company_alias mesmo quando outros filtros coincidem', async ({ assert }) => {
    const { empresa: empresaA } = await createTenant()
    const { empresa: empresaB } = await createTenant()
    const repo = new ProdutosRepository()

    await repo.create({
      nome: 'Produto Comum',
      descricao: 'x',
      is_service: false,
      company_alias: empresaA.company_alias,
    } as any)
    await repo.create({
      nome: 'Produto Comum',
      descricao: 'x',
      is_service: false,
      company_alias: empresaB.company_alias,
    } as any)

    const listaA = await repo.paginate(1, 20, { nome: 'Produto Comum', company_alias: empresaA.company_alias })
    assert.lengthOf(listaA, 1)
  })
})
