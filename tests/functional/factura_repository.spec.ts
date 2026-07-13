import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import FacturaRepository from '#repositories/factura_repository'
import VendaNaoFechadaException from '#exceptions/venda_nao_fechada_exception'
import FacturaJaAnuladaException from '#exceptions/factura_ja_anulada_exception'
import Cliente from '#models/cliente'
import Factura from '#models/faturacao/factura'
import { createTenant, createCaixa, createVenda } from '../helpers/fixtures.js'

test.group('factura_repository', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('emite uma factura para uma venda fechada, com o total da venda e tipo pedido', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    const venda = await createVenda(caixa, { status: 'fechada', total: 15000 })

    const repo = new FacturaRepository()
    const emitida = await repo.emitir({ venda_id: venda.id, tipo: 'Factura', company_alias: empresa.company_alias })

    assert.equal(emitida.numero, 1)
    assert.equal(emitida.tipo, 'Factura')
    assert.equal(Number(emitida.total), 15000)
    assert.equal(emitida.status, 'emitida')
  })

  test('rejeita emitir factura para uma venda que não está fechada', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    const vendaAberta = await createVenda(caixa, { status: 'aberta' })

    const repo = new FacturaRepository()
    try {
      await repo.emitir({ venda_id: vendaAberta.id, tipo: 'Factura', company_alias: empresa.company_alias })
      assert.fail('deveria ter rejeitado')
    } catch (error) {
      assert.instanceOf(error, VendaNaoFechadaException)
    }
  })

  test('faz snapshot do nome/nif do cliente no momento da emissão', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const cliente = await Cliente.create({
      tipo: 'Pessoa Física',
      nome: 'Ana Silva',
      nif: '123456789',
      empresa_id: empresa.id,
    } as any)
    const caixa = await createCaixa(user, pos)
    const venda = await createVenda(caixa, { status: 'fechada', total: 5000 })
    venda.cliente_presencial_id = cliente.id
    await venda.save()

    const repo = new FacturaRepository()
    const emitida = await repo.emitir({ venda_id: venda.id, tipo: 'Factura-Recibo', company_alias: empresa.company_alias })

    assert.equal(emitida.cliente_nome, 'Ana Silva')
    assert.equal(emitida.cliente_nif, '123456789')

    // se o cliente mudar de nome depois, a factura já emitida não deve mudar (é um snapshot)
    cliente.nome = 'Ana Silva Santos'
    await cliente.save()
    const releida = await Factura.findOrFail(emitida.id)
    assert.equal(releida.cliente_nome, 'Ana Silva', 'a factura não deve refletir alterações posteriores ao cliente')
  })

  test('numeração é sequencial por empresa e nunca global', async ({ assert }) => {
    const tenantA = await createTenant()
    const tenantB = await createTenant()

    const caixaA = await createCaixa(tenantA.user, tenantA.pos)
    const vendaA1 = await createVenda(caixaA, { status: 'fechada', total: 1000 })
    const vendaA2 = await createVenda(caixaA, { status: 'fechada', total: 2000 })

    const caixaB = await createCaixa(tenantB.user, tenantB.pos)
    const vendaB1 = await createVenda(caixaB, { status: 'fechada', total: 3000 })

    const repo = new FacturaRepository()
    const facturaA1 = await repo.emitir({ venda_id: vendaA1.id, tipo: 'Factura', company_alias: tenantA.empresa.company_alias })
    const facturaA2 = await repo.emitir({ venda_id: vendaA2.id, tipo: 'Factura', company_alias: tenantA.empresa.company_alias })
    const facturaB1 = await repo.emitir({ venda_id: vendaB1.id, tipo: 'Factura', company_alias: tenantB.empresa.company_alias })

    assert.equal(facturaA1.numero, 1)
    assert.equal(facturaA2.numero, 2)
    assert.equal(facturaB1.numero, 1, 'a empresa B tem a sua própria sequência, começa em 1 mesmo depois da empresa A já ter emitido')
  })

  // Nota: dentro de testUtils.db().withGlobalTransaction() ambas as chamadas partilham a mesma
  // ligação (cada emitir() vira uma savepoint nessa ligação), por isso este teste não prova
  // bloqueio real entre ligações concorrentes — isso depende das garantias do MySQL para
  // `SELECT ... FOR UPDATE`. O que valida é a propriedade que importa: cada chamada volta a
  // calcular o próximo número a partir do estado atual (dentro do seu lock), nunca reutiliza um
  // valor pré-calculado — o mesmo padrão/limitação documentado em estoque_repository.spec.ts.
  test('duas emissões sequenciais para a mesma empresa nunca geram o mesmo número (revalida o próximo número a cada chamada)', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    const vendaX = await createVenda(caixa, { status: 'fechada', total: 1000 })
    const vendaY = await createVenda(caixa, { status: 'fechada', total: 2000 })

    const repo = new FacturaRepository()
    const [facturaX, facturaY] = await Promise.all([
      repo.emitir({ venda_id: vendaX.id, tipo: 'Factura', company_alias: empresa.company_alias }),
      repo.emitir({ venda_id: vendaY.id, tipo: 'Factura', company_alias: empresa.company_alias }),
    ])

    assert.notEqual(facturaX.numero, facturaY.numero)
    assert.sameDeepMembers([facturaX.numero, facturaY.numero], [1, 2])
  })

  test('anular muda o estado para anulada, e não deixa anular duas vezes', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    const venda = await createVenda(caixa, { status: 'fechada', total: 1000 })

    const repo = new FacturaRepository()
    const emitida = await repo.emitir({ venda_id: venda.id, tipo: 'Factura', company_alias: empresa.company_alias })

    const anulada = await repo.anular({ id: emitida.id, company_alias: empresa.company_alias })
    assert.equal(anulada.status, 'anulada')

    try {
      await repo.anular({ id: emitida.id, company_alias: empresa.company_alias })
      assert.fail('deveria ter rejeitado anular uma factura já anulada')
    } catch (error) {
      assert.instanceOf(error, FacturaJaAnuladaException)
    }
  })

  test('isola por empresa: findOrFail nunca encontra a factura de outra empresa', async ({ assert }) => {
    const tenantA = await createTenant()
    const tenantB = await createTenant()
    const caixaA = await createCaixa(tenantA.user, tenantA.pos)
    const vendaA = await createVenda(caixaA, { status: 'fechada', total: 1000 })

    const repo = new FacturaRepository()
    const emitida = await repo.emitir({ venda_id: vendaA.id, tipo: 'Factura', company_alias: tenantA.empresa.company_alias })

    await assert.rejects(() => repo.findOrFail({ id: emitida.id, company_alias: tenantB.empresa.company_alias }))
    const encontrada = await repo.findOrFail({ id: emitida.id, company_alias: tenantA.empresa.company_alias })
    assert.equal(encontrada.id, emitida.id)
  })

  // emitir() devolve a instância recém-criada pelo Model.create(), que nunca passa pelo join
  // de baseQuery() — só findOrFail()/paginate() (usados por show/index) trazem os dados da
  // empresa emissora. O frontend depende deste contrato: navega para /facturas/:id depois de
  // emitir, nunca tenta ler nome/nif da empresa a partir da resposta de emissão diretamente.
  test('só findOrFail/paginate (não o retorno de emitir) incluem o nome/nif da empresa emissora, via serializeExtras', async ({
    assert,
  }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    const venda = await createVenda(caixa, { status: 'fechada', total: 1000 })

    const repo = new FacturaRepository()
    const emitida = await repo.emitir({ venda_id: venda.id, tipo: 'Factura', company_alias: empresa.company_alias })
    assert.isUndefined((emitida.toJSON() as any).empresa_nome)

    const encontrada = await repo.findOrFail({ id: emitida.id, company_alias: empresa.company_alias })
    const json = encontrada.toJSON() as any
    assert.equal(json.empresa_nome, empresa.nome)
    assert.equal(json.empresa_nif, empresa.nif)
  })
})
