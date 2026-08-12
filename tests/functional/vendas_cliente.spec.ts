import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import VendasRepository from '#repositories/vendas_repository'
import ClienteRepository from '#repositories/cliente_repository'
import Vendas from '#models/faturacao/vendas'
import { createTenant, createCaixa, createVenda, createUser } from '../helpers/fixtures.js'

/**
 * Associação de um CLIENTE a uma venda.
 *
 * O schema já tinha `vendas.cliente_presencial_id` e o validator/controller já o
 * aceitavam, mas faltavam duas peças para o tornar utilizável:
 *  - a LEITURA nunca devolvia nada do cliente (nem um join a `cliente`), só o UUID;
 *  - `cliente_online_id` era aceite e depois silenciosamente descartado no repositório.
 */
test.group('venda com cliente associado', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('a leitura devolve nome/nif/numero do cliente, não só o UUID', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const clienteRepo = new ClienteRepository()
    const cliente = await clienteRepo.create({
      tipo: 'Pessoa Jurídica',
      nome: 'Cliente Da Venda, LDA',
      nif: '5002889978',
      company_alias: empresa.company_alias,
    } as any)

    const caixa = await createCaixa(user, pos)
    const venda = await createVenda(caixa, { status: 'fechada' })
    venda.cliente_presencial_id = cliente.id
    await venda.save()

    const repo = new VendasRepository()

    const encontrada = await repo.findOrFail({ id: venda.id, company_alias: empresa.company_alias })
    const json = encontrada.toJSON() as any
    assert.equal(json.cliente_nome, 'Cliente Da Venda, LDA')
    assert.equal(json.cliente_nif, '5002889978')
    assert.equal(json.cliente_tipo, 'Pessoa Jurídica')
    assert.equal(Number(json.cliente_numero), Number(cliente.numero))

    const pagina = await repo.paginate(1, 20, { company_alias: empresa.company_alias })
    const linha = pagina.all().find((v: any) => v.id === venda.id)!.toJSON() as any
    assert.equal(linha.cliente_nome, 'Cliente Da Venda, LDA')
    assert.equal(linha.cliente_nif, '5002889978')
  })

  test('venda sem cliente continua a aparecer na listagem (o join é opcional)', async ({
    assert,
  }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    const venda = await createVenda(caixa, { status: 'fechada' })

    const repo = new VendasRepository()
    const pagina = await repo.paginate(1, 20, { company_alias: empresa.company_alias })
    const linha = pagina.all().find((v: any) => v.id === venda.id)

    assert.exists(linha, 'indicar o cliente é opcional — a venda não pode sumir por não o ter')
    assert.isNull((linha!.toJSON() as any).cliente_nome)
  })

  test('filtrar por cliente_presencial_id devolve só as vendas desse cliente', async ({
    assert,
  }) => {
    const { empresa, user, pos } = await createTenant()
    const clienteRepo = new ClienteRepository()
    const clienteA = await clienteRepo.create({
      tipo: 'Pessoa Física',
      nome: 'Cliente A',
      company_alias: empresa.company_alias,
    } as any)

    const caixa = await createCaixa(user, pos)
    const vendaComCliente = await createVenda(caixa, { status: 'fechada' })
    vendaComCliente.cliente_presencial_id = clienteA.id
    await vendaComCliente.save()
    const vendaSemCliente = await createVenda(caixa, { status: 'fechada' })

    const repo = new VendasRepository()
    const resultado = await repo.paginate(1, 20, {
      cliente_presencial_id: clienteA.id,
      company_alias: empresa.company_alias,
    })
    const ids = resultado.all().map((v: any) => v.id)

    assert.include(ids, vendaComCliente.id)
    assert.notInclude(ids, vendaSemCliente.id)
  })

  test('create() persiste cliente_presencial_id e cliente_online_id', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const clienteRepo = new ClienteRepository()
    const cliente = await clienteRepo.create({
      tipo: 'Pessoa Física',
      nome: 'Cliente Presencial',
      company_alias: empresa.company_alias,
    } as any)
    const clienteOnline = await createUser(empresa, ['Vendedor'])

    // create() exige uma caixa ABERTA do próprio utilizador.
    await createCaixa(user, pos, { status: 'aberto' })

    const repo = new VendasRepository()
    const venda = await repo.create({
      venda_tipo: 'presencial',
      cliente_presencial_id: cliente.id,
      cliente_online_id: clienteOnline.id,
      company_alias: empresa.company_alias,
      user_id: user.id,
    } as any)

    const gravada = await Vendas.findOrFail(venda.id)
    assert.equal(gravada.cliente_presencial_id, cliente.id)
    assert.equal(
      gravada.cliente_online_id,
      clienteOnline.id,
      'cliente_online_id era descartado silenciosamente pelo repositório'
    )
  })
})
