import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import RelatoriosPlataformaRepository from '#repositories/relatorios_plataforma_repository'
import Plano from '#models/plano'
import Subscricao from '#models/subscricao'
import Cobranca from '#models/cobranca'
import SecurityLog from '#models/security_log'
import { createEmpresa, createTenant, createCaixa, createVenda } from '../helpers/fixtures.js'

async function criarSubscricao(empresa: any, statusSubscricao = 'ATIVA') {
  const plano = await Plano.create({
    nome: `Plano ${Date.now()}`,
    descricao: 'x',
    preco: 10000,
    moeda: 'AOA',
    periodo: 'mensal',
    ativo: true,
    limite_uso: 100,
  })
  return Subscricao.create({
    cliente_id: empresa.id,
    plano_id: plano.id,
    status: statusSubscricao,
    data_inicio: new Date() as any,
    data_fim: new Date() as any,
  } as any)
}

test.group('relatorios_plataforma_repository - cross-tenant, proprietário da plataforma', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('contasReceber lista só cobranças por pagar, de várias empresas', async ({ assert }) => {
    const empresaA = await createEmpresa()
    const empresaB = await createEmpresa()

    const subscricaoA = await criarSubscricao(empresaA)
    const subscricaoB = await criarSubscricao(empresaB)

    const cobrancaPendente = await Cobranca.create({
      subscricao_id: subscricaoA.id,
      valor: 15000,
      moeda: 'AOA',
      status: 'PENDENTE',
      data_vencimento: new Date() as any,
      pago: false,
      referencia: 'REF-A',
    } as any)

    await Cobranca.create({
      subscricao_id: subscricaoB.id,
      valor: 20000,
      moeda: 'AOA',
      status: 'PAGA',
      data_vencimento: new Date() as any,
      pago: true,
      referencia: 'REF-B',
    } as any)

    const repo = new RelatoriosPlataformaRepository()
    const resultado = await repo.contasReceber({})

    const ids = (resultado.cobrancas as any).all().map((r: any) => r.id)
    assert.include(ids, cobrancaPendente.id)
    assert.equal(resultado.resumo.quantidade, 1)
    assert.equal(resultado.resumo.total, 15000)
  })

  test('empresasResumo agrega total/activas/inadimplentes por tamanho, cross-tenant', async ({ assert }) => {
    await createEmpresa()
    const empresaInadimplente = await createEmpresa()
    empresaInadimplente.inadiplente = true
    await empresaInadimplente.save()

    const repo = new RelatoriosPlataformaRepository()
    const resumo = await repo.empresasResumo()

    assert.isAbove(resumo.total_empresas, 0)
    assert.isAbove(resumo.empresas_inadimplentes, 0)
    assert.isArray(resumo.por_tamanho)
  })

  test('receitaPlataforma soma só as cobranças pagas no período e conta subscrições activas', async ({ assert }) => {
    const empresaPaga = await createEmpresa()
    const empresaPendente = await createEmpresa()

    const subscricaoPaga = await criarSubscricao(empresaPaga, 'ATIVA')
    const subscricaoPendente = await criarSubscricao(empresaPendente, 'ATIVA')

    await Cobranca.create({
      subscricao_id: subscricaoPaga.id,
      valor: 25000,
      moeda: 'AOA',
      status: 'PAGA',
      data_vencimento: new Date() as any,
      pago: true,
      referencia: 'REF-PAGA',
    } as any)

    await Cobranca.create({
      subscricao_id: subscricaoPendente.id,
      valor: 40000,
      moeda: 'AOA',
      status: 'PENDENTE',
      data_vencimento: new Date() as any,
      pago: false,
      referencia: 'REF-PENDENTE',
    } as any)

    const activasAntes = await db.from('subscricao').where('status', 'ATIVA').whereNull('deleted_at').count('* as total').first()

    const repo = new RelatoriosPlataformaRepository()
    const resultado = await repo.receitaPlataforma({})

    assert.equal(resultado.cobrancas_pagas.quantidade, 1)
    assert.equal(resultado.cobrancas_pagas.total, 25000)
    assert.equal(resultado.subscricoes_ativas, Number(activasAntes?.total ?? 0))
  })

  test('usoPlataforma agrega vendas fechadas, produtos e utilizadores totais, cross-tenant', async ({ assert }) => {
    const antes = await Promise.all([
      db.from('vendas').where('status', 'fechada').count('* as quantidade').sum('total as total').first(),
      db.from('produtos').whereNull('deleted_at').count('* as total').first(),
      db.from('user').count('* as total').first(),
    ])

    const { user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    await createVenda(caixa, { status: 'fechada', total: 1000 })
    await createVenda(caixa, { status: 'fechada', total: 500 })
    await createVenda(caixa, { status: 'aberta', total: 9999 }) // não deve contar

    const repo = new RelatoriosPlataformaRepository()
    const resultado = await repo.usoPlataforma({})

    assert.equal(resultado.vendas_fechadas.quantidade, Number(antes[0]?.quantidade ?? 0) + 2)
    assert.equal(resultado.vendas_fechadas.total, Number(antes[0]?.total ?? 0) + 1500)
    assert.equal(resultado.produtos_totais, Number(antes[1]?.total ?? 0))
    assert.equal(resultado.utilizadores_totais, Number(antes[2]?.total ?? 0) + 1)
  })

  test('auditoria lista eventos de security_logs, filtrável por event', async ({ assert }) => {
    await SecurityLog.create({ event: 'login_failed', ip: '1.2.3.4', details: { tentativa: 1 } })
    await SecurityLog.create({ event: 'permission_denied', ip: '5.6.7.8', details: { route: 'x' } })

    const repo = new RelatoriosPlataformaRepository()
    const todos = await repo.auditoria({})
    assert.isAbove((todos as any).length, 1)

    const soFalhas = await repo.auditoria({ event: 'login_failed' })
    const eventos = (soFalhas as any).all().map((r: any) => r.event)
    assert.isTrue(eventos.every((e: string) => e === 'login_failed'))
  })
})
