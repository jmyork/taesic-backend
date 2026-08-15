import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import ClienteRepository from '#repositories/cliente_repository'
import { createclienteValidator, updateclienteValidator } from '#validators/cliente_validator'
import { createTenant } from '../helpers/fixtures.js'

/**
 * `cliente.nif` e `cliente.email` não tinham qualquer regra de unicidade — dava para registar
 * o mesmo contribuinte infinitas vezes. Num sistema de facturação isso parte tudo o que agrega
 * por cliente (histórico, saldo, limite de crédito, relatórios) e leva a emitir facturas do
 * mesmo NIF contra fichas diferentes.
 *
 * O escopo é POR EMPRESA de propósito: dois tenants podem ter o mesmo cliente.
 *
 * Nota sobre a forma dos dados nos testes: o Vine recebe `params` DENTRO do objecto de dados
 * (o Adonis monta `{ ...request.all(), params: request.params(), ... }` em `validateUsing`),
 * e não num `meta` separado.
 */
test.group('cliente — unicidade de NIF e email por empresa', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  const base = (extra: Record<string, unknown> = {}) => ({
    tipo: 'Pessoa Física',
    nome: 'Cliente de Teste',
    ...extra,
  })

  test('aceita um NIF que ainda não existe na empresa', async ({ assert }) => {
    const { empresa } = await createTenant()

    const resultado = await createclienteValidator.validate(
      base({ nif: '005678901LA042', params: { company_alias: empresa.company_alias } })
    )

    assert.equal(resultado.nif, '005678901LA042')
  })

  test('rejeita um NIF já registado na mesma empresa', async ({ assert }) => {
    const { empresa } = await createTenant()
    const repo = new ClienteRepository()
    await repo.create({
      tipo: 'Pessoa Física',
      nome: 'Primeiro',
      nif: '005678901LA042',
      company_alias: empresa.company_alias,
    } as any)

    await assert.rejects(() =>
      createclienteValidator.validate(
        base({ nif: '005678901LA042', params: { company_alias: empresa.company_alias } })
      )
    )
  })

  test('rejeita um email já registado na mesma empresa', async ({ assert }) => {
    const { empresa } = await createTenant()
    const repo = new ClienteRepository()
    await repo.create({
      tipo: 'Pessoa Física',
      nome: 'Primeiro',
      email: 'repetido@example.com',
      company_alias: empresa.company_alias,
    } as any)

    await assert.rejects(() =>
      createclienteValidator.validate(
        base({ email: 'repetido@example.com', params: { company_alias: empresa.company_alias } })
      )
    )
  })

  /**
   * A comparação é feita com LOWER(TRIM(...)) explicitamente, para não depender da collation
   * da base de dados: a predefinida do MySQL é insensível a maiúsculas, mas um deploy com
   * collation CS deixaria passar "REPETIDO@Example.com" contra "repetido@example.com".
   */
  test('rejeita o mesmo email escrito com outras maiúsculas', async ({ assert }) => {
    const { empresa } = await createTenant()
    const repo = new ClienteRepository()
    await repo.create({
      tipo: 'Pessoa Física',
      nome: 'Primeiro',
      email: 'repetido@example.com',
      company_alias: empresa.company_alias,
    } as any)

    await assert.rejects(() =>
      createclienteValidator.validate(
        base({ email: 'REPETIDO@Example.com', params: { company_alias: empresa.company_alias } })
      )
    )
  })

  test('rejeita o mesmo NIF com espaços à volta', async ({ assert }) => {
    const { empresa } = await createTenant()
    const repo = new ClienteRepository()
    await repo.create({
      tipo: 'Pessoa Física',
      nome: 'Primeiro',
      nif: '5417896230',
      company_alias: empresa.company_alias,
    } as any)

    await assert.rejects(() =>
      createclienteValidator.validate(
        base({ nif: '  5417896230  ', params: { company_alias: empresa.company_alias } })
      )
    )
  })

  /**
   * O NIF é opcional e muitos particulares não o têm — N clientes sem NIF são legítimos.
   * Se a regra tratasse "" como um valor, o segundo cliente sem NIF passava a ser rejeitado.
   */
  test('permite vários clientes sem NIF e sem email', async ({ assert }) => {
    const { empresa } = await createTenant()
    const repo = new ClienteRepository()
    await repo.create({
      tipo: 'Pessoa Física',
      nome: 'Sem NIF 1',
      company_alias: empresa.company_alias,
    } as any)

    const resultado = await createclienteValidator.validate(
      base({ nome: 'Sem NIF 2', params: { company_alias: empresa.company_alias } })
    )
    assert.equal(resultado.nome, 'Sem NIF 2')

    // E explicitamente com string vazia, que é o que um formulário web costuma enviar.
    const comVazio = await createclienteValidator.validate(
      base({ nome: 'Sem NIF 3', nif: '', params: { company_alias: empresa.company_alias } })
    )
    assert.equal(comVazio.nome, 'Sem NIF 3')
  })

  /**
   * O isolamento multi-tenant é o ponto onde uma regra de unicidade mal escrita causa o pior
   * dano: um NIF registado na empresa A não pode impedir a empresa B de registar o seu cliente.
   */
  test('o mesmo NIF é permitido noutra empresa', async ({ assert }) => {
    const { empresa: empresaA } = await createTenant()
    const { empresa: empresaB } = await createTenant()
    const repo = new ClienteRepository()
    await repo.create({
      tipo: 'Pessoa Física',
      nome: 'Cliente da A',
      nif: '005678901LA042',
      company_alias: empresaA.company_alias,
    } as any)

    const resultado = await createclienteValidator.validate(
      base({ nome: 'Cliente da B', nif: '005678901LA042', params: { company_alias: empresaB.company_alias } })
    )
    assert.equal(resultado.nif, '005678901LA042')
  })

  /**
   * Sem a exclusão da própria linha, gravar um cliente sem sequer tocar no NIF passaria a dar
   * erro de duplicado contra ele mesmo — o modo de falha mais fácil de introduzir aqui.
   */
  test('update do próprio cliente sem mudar o NIF continua a passar', async ({ assert }) => {
    const { empresa } = await createTenant()
    const repo = new ClienteRepository()
    const cliente = await repo.create({
      tipo: 'Pessoa Física',
      nome: 'Original',
      nif: '005678901LA042',
      email: 'original@example.com',
      company_alias: empresa.company_alias,
    } as any)

    const resultado = await updateclienteValidator.validate({
      nome: 'Nome Alterado',
      nif: '005678901LA042',
      email: 'original@example.com',
      params: { company_alias: empresa.company_alias, id: cliente.id },
    })

    assert.equal(resultado.nome, 'Nome Alterado')
  })

  test('update para o NIF de outro cliente é rejeitado', async ({ assert }) => {
    const { empresa } = await createTenant()
    const repo = new ClienteRepository()
    await repo.create({
      tipo: 'Pessoa Física',
      nome: 'Dono do NIF',
      nif: '005678901LA042',
      company_alias: empresa.company_alias,
    } as any)
    const outro = await repo.create({
      tipo: 'Pessoa Física',
      nome: 'Outro',
      nif: '009999999LA042',
      company_alias: empresa.company_alias,
    } as any)

    await assert.rejects(() =>
      updateclienteValidator.validate({
        nif: '005678901LA042',
        params: { company_alias: empresa.company_alias, id: outro.id },
      })
    )
  })

  /**
   * Soft-delete: um cliente removido não deve bloquear o registo de um novo com o mesmo NIF.
   * É o oposto da decisão tomada em `userpos`/`user_papel` (onde se revive a linha), e de
   * propósito: reviver silenciosamente uma FICHA DE CLIENTE traria de volta saldo, limite de
   * crédito e histórico que alguém decidiu remover. Aqui deixa-se criar um registo novo.
   */
  test('um cliente removido não bloqueia o registo de outro com o mesmo NIF', async ({ assert }) => {
    const { empresa } = await createTenant()
    const repo = new ClienteRepository()
    const antigo = await repo.create({
      tipo: 'Pessoa Física',
      nome: 'Removido',
      nif: '005678901LA042',
      company_alias: empresa.company_alias,
    } as any)
    await repo.softDelete(antigo.id, empresa.company_alias)

    const resultado = await createclienteValidator.validate(
      base({ nome: 'Novo', nif: '005678901LA042', params: { company_alias: empresa.company_alias } })
    )
    assert.equal(resultado.nif, '005678901LA042')
  })
})
