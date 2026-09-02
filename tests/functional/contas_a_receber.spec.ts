import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import testUtils from '@adonisjs/core/services/test_utils'

import FacturaRepository from '#repositories/factura_repository'
import VendasRepository from '#repositories/vendas_repository'
import AvisoCobrancaRepository from '#repositories/aviso_cobranca_repository'
import RelatoriosRepository from '#repositories/relatorios_repository'
import Factura from '#models/faturacao/factura'
import DocumentoSemDividaException from '#exceptions/documento_sem_divida_exception'
import DocumentoJaPagoException from '#exceptions/documento_ja_pago_exception'
import VendaSemDocumentoException from '#exceptions/venda_sem_documento_exception'
import { createTenant, createCaixa, createVenda } from '../helpers/fixtures.js'

/**
 * O que a empresa tem por receber — e o que sai daí.
 *
 * ── O número que esteve fixo em zero ────────────────────────────────────────
 *
 * `relatorios_repository.dashboardExecutivo()` devolvia literalmente
 * `valor_por_receber_mes: 0`, com um comentário a explicar que este projecto não
 * tinha venda a crédito ao cliente final. Tinha razão — o fecho da venda exigia o
 * dinheiro todo. Deixou de ter, e estes testes são o que impede o número de voltar
 * a mentir, agora no sentido contrário.
 *
 * A regra inteira é uma linha, e é a mesma em três sítios (a listagem, o mapa de
 * cobranças e o dashboard): **está em dívida quem tem data de vencimento e não tem
 * recibo por cima.** Se os três divergirem, um deles cobra o que já foi pago.
 */

/** Uma factura a prazo, emitida com o vencimento indicado. */
async function facturaAPrazo(
  empresa: { id: string; company_alias: string },
  caixa: any,
  opcoes: { total?: number; vencimento?: DateTime } = {}
) {
  const total = opcoes.total ?? 10000
  const venda = await createVenda(caixa, { status: 'fechada', total })

  return new FacturaRepository().emitir({
    company_alias: empresa.company_alias,
    tipo: 'Factura',
    venda_id: venda.id,
    data_vencimento: (opcoes.vencimento ?? DateTime.now().plus({ days: 30 })).toJSDate(),
  })
}

test.group('contas a receber — o mapa de cobranças', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('uma factura a prazo aparece; uma paga no acto não', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)

    const aPrazo = await facturaAPrazo(empresa, caixa, { total: 10000 })

    // Uma factura-recibo é paga no acto — nunca nasce em dívida.
    const vendaPaga = await createVenda(caixa, { status: 'fechada', total: 5000 })
    await new FacturaRepository().emitir({
      company_alias: empresa.company_alias,
      tipo: 'Factura-Recibo',
      venda_id: vendaPaga.id,
    })

    const mapa = await new FacturaRepository().contasAReceber({
      company_alias: empresa.company_alias,
    })

    assert.equal(mapa.resumo.documentos, 1)
    assert.equal(mapa.resumo.total, 10000)
    assert.equal(mapa.facturas.all()[0].id, aPrazo.id)
  })

  /**
   * As notas entram na conta do que há a receber.
   *
   * Cobrar o valor original de uma factura já creditada é reclamar dinheiro que a
   * própria empresa reconheceu não lhe ser devido.
   */
  test('as notas de crédito e de débito ajustam o valor em dívida', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    const repo = new FacturaRepository()

    const factura = await facturaAPrazo(empresa, caixa, { total: 10000 })

    await repo.emitir({
      company_alias: empresa.company_alias,
      tipo: 'Nota de Crédito',
      documento_origem_id: factura.id,
      total: 2000,
    })

    await repo.emitir({
      company_alias: empresa.company_alias,
      tipo: 'Nota de Débito',
      documento_origem_id: factura.id,
      total: 500,
    })

    const mapa = await repo.contasAReceber({ company_alias: empresa.company_alias })

    assert.equal(mapa.resumo.total, 8500, '10000 - 2000 + 500')
    assert.equal(Number(mapa.facturas.all()[0].$extras.valor_em_divida), 8500)
  })

  test('o vencido separa-se do que ainda está dentro do prazo', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)

    /*
     * O vencimento no passado é escrito directamente na coluna: o validator
     * recusa-o (e bem — uma factura não nasce vencida), mas o mapa tem de saber
     * mostrar uma dívida que passou do prazo com o tempo.
     */
    const vencida = await facturaAPrazo(empresa, caixa, { total: 3000 })
    vencida.data_vencimento = DateTime.now().minus({ days: 10 })
    await vencida.save()

    await facturaAPrazo(empresa, caixa, { total: 7000 })

    const mapa = await new FacturaRepository().contasAReceber({
      company_alias: empresa.company_alias,
    })

    assert.equal(mapa.resumo.total, 10000)
    assert.equal(mapa.resumo.vencido, 3000, 'dinheiro em risco')
    assert.equal(mapa.resumo.a_vencer, 7000, 'dinheiro esperado')

    // A mais antiga primeiro — é a que alguém tem de ver.
    const primeira = mapa.facturas.all()[0]
    assert.equal(primeira.id, vencida.id)
    assert.equal(Number(primeira.$extras.dias_em_atraso), 10)
  })

  test('não atravessa a fronteira da empresa', async ({ assert }) => {
    const a = await createTenant()
    const b = await createTenant()
    const caixaA = await createCaixa(a.user, a.pos)
    const caixaB = await createCaixa(b.user, b.pos)

    await facturaAPrazo(a.empresa, caixaA, { total: 1000 })
    await facturaAPrazo(b.empresa, caixaB, { total: 9999 })

    const mapa = await new FacturaRepository().contasAReceber({
      company_alias: a.empresa.company_alias,
    })

    assert.equal(mapa.resumo.documentos, 1)
    assert.equal(mapa.resumo.total, 1000)
  })

  test('o dashboard executivo lê o mesmo número', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)

    await facturaAPrazo(empresa, caixa, { total: 12345 })

    const painel: any = await new RelatoriosRepository().dashboardExecutivo({
      company_alias: empresa.company_alias,
    } as any)

    assert.equal(
      painel.valor_por_receber_mes,
      12345,
      'esteve fixo em 0 durante toda a vida deste módulo'
    )
  })
})

test.group('contas a receber — confirmar o recebimento', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('emite o recibo e a factura sai do mapa', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    const repo = new FacturaRepository()

    const factura = await facturaAPrazo(empresa, caixa, { total: 10000 })

    const recibo = await repo.confirmarRecebimento({
      id: factura.id,
      company_alias: empresa.company_alias,
    })

    assert.equal(recibo.tipo, 'Recibo')
    assert.equal(recibo.documento_origem_id, factura.id)
    assert.equal(Number(recibo.total), 10000)

    const mapa = await repo.contasAReceber({ company_alias: empresa.company_alias })
    assert.equal(mapa.resumo.documentos, 0, 'nada mais é escrito na factura — o recibo basta')
  })

  /**
   * O recibo é pelo que RESTA, não pelo total original.
   *
   * Um recibo pelo valor cheio de uma factura já creditada declararia ter recebido
   * mais do que era devido — e o recibo é a prova que o cliente guarda.
   */
  test('o recibo sai pelo valor que resta depois das notas', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    const repo = new FacturaRepository()

    const factura = await facturaAPrazo(empresa, caixa, { total: 10000 })

    await repo.emitir({
      company_alias: empresa.company_alias,
      tipo: 'Nota de Crédito',
      documento_origem_id: factura.id,
      total: 2500,
    })

    const recibo = await repo.confirmarRecebimento({
      id: factura.id,
      company_alias: empresa.company_alias,
    })

    assert.equal(Number(recibo.total), 7500)
  })

  test('não se confirma o recebimento de um documento pago no acto', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    const venda = await createVenda(caixa, { status: 'fechada', total: 5000 })

    const repo = new FacturaRepository()
    const paga = await repo.emitir({
      company_alias: empresa.company_alias,
      tipo: 'Factura-Recibo',
      venda_id: venda.id,
    })

    await assert.rejects(
      () => repo.confirmarRecebimento({ id: paga.id, company_alias: empresa.company_alias }),
      DocumentoSemDividaException
    )
  })

  test('não se confirma duas vezes', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    const repo = new FacturaRepository()

    const factura = await facturaAPrazo(empresa, caixa)
    await repo.confirmarRecebimento({ id: factura.id, company_alias: empresa.company_alias })

    await assert.rejects(
      () => repo.confirmarRecebimento({ id: factura.id, company_alias: empresa.company_alias }),
      DocumentoJaPagoException
    )
  })
})

test.group('aviso de cobrança — sete dias antes e no dia limite', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  /** Os avisos emitidos sobre uma factura, em ordem de emissão. */
  async function avisosDe(facturaId: string) {
    return Factura.query()
      .where('documento_origem_id', facturaId)
      .where('tipo', 'Aviso de Cobrança')
      .whereNull('deleted_at')
      .orderBy('numero', 'asc')
  }

  test('nada sai antes da janela dos sete dias', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    const factura = await facturaAPrazo(empresa, caixa)

    const resultado = await new AvisoCobrancaRepository().emitirDevidos({
      company_alias: empresa.company_alias,
    })

    assert.isEmpty(resultado.emitidos)
    assert.isEmpty(await avisosDe(factura.id))
  })

  test('sai o pré-aviso sete dias antes, e só uma vez', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    const factura = await facturaAPrazo(empresa, caixa, {
      vencimento: DateTime.now().plus({ days: 7 }),
    })

    const repo = new AvisoCobrancaRepository()

    const primeira = await repo.emitirDevidos({ company_alias: empresa.company_alias })
    assert.lengthOf(primeira.emitidos, 1)
    assert.equal(primeira.emitidos[0].momento, 'pre_aviso')

    /*
     * Correr outra vez no mesmo dia não pode duplicar. É seguro correr o comando
     * várias vezes — e vai acontecer, porque corre por cron externo e um
     * agendamento repetido é a coisa mais fácil de configurar por engano.
     */
    const segunda = await repo.emitirDevidos({ company_alias: empresa.company_alias })
    assert.isEmpty(segunda.emitidos)
    assert.lengthOf(await avisosDe(factura.id), 1)
  })

  test('no dia do vencimento sai o segundo aviso, mesmo com o pré-aviso já emitido', async ({
    assert,
  }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)

    const factura = await facturaAPrazo(empresa, caixa, {
      vencimento: DateTime.now().plus({ days: 7 }),
    })

    const repo = new AvisoCobrancaRepository()

    // Dia do pré-aviso.
    await repo.emitirDevidos({ company_alias: empresa.company_alias })

    /*
     * Avança-se o calendário em vez de esperar sete dias: `emitirDevidos` recebe o
     * «hoje», precisamente para este caso ser testável.
     */
    const noVencimento = await repo.emitirDevidos({
      company_alias: empresa.company_alias,
      hoje: DateTime.now().plus({ days: 7 }),
    })

    assert.lengthOf(noVencimento.emitidos, 1)
    assert.equal(noVencimento.emitidos[0].momento, 'vencimento')
    assert.lengthOf(await avisosDe(factura.id), 2, 'os dois momentos, e só os dois')
  })

  test('uma factura já paga nunca é avisada', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)

    const factura = await facturaAPrazo(empresa, caixa, {
      vencimento: DateTime.now().plus({ days: 7 }),
    })

    await new FacturaRepository().confirmarRecebimento({
      id: factura.id,
      company_alias: empresa.company_alias,
    })

    const resultado = await new AvisoCobrancaRepository().emitirDevidos({
      company_alias: empresa.company_alias,
    })

    assert.isEmpty(resultado.emitidos)
  })
})

test.group('ajustar uma venda para cima — a nota de débito', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('emite a nota sobre o documento que titula a venda, sem reescrever a venda', async ({
    assert,
  }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    const venda = await createVenda(caixa, { status: 'fechada', total: 10000 })

    const factura = await new FacturaRepository().emitir({
      company_alias: empresa.company_alias,
      tipo: 'Factura-Recibo',
      venda_id: venda.id,
    })

    const nota = await new VendasRepository().ajustar({
      id: venda.id,
      company_alias: empresa.company_alias,
      valor: 1500,
      motivo: 'Encargos de transporte não incluídos na venda.',
    })

    assert.equal(nota.tipo, 'Nota de Débito')
    assert.equal(nota.documento_origem_id, factura.id)
    assert.equal(Number(nota.total), 1500)
    assert.equal(nota.observacoes, 'Encargos de transporte não incluídos na venda.')

    /*
     * A venda fica como está. É o registo do que foi vendido naquele dia, e
     * reescrevê-la faria a factura já emitida deixar de bater certo com ela.
     */
    await venda.refresh()
    assert.equal(Number(venda.total), 10000)
  })

  test('uma venda sem documento não se ajusta', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    const venda = await createVenda(caixa, { status: 'fechada', total: 10000 })

    await assert.rejects(
      () =>
        new VendasRepository().ajustar({
          id: venda.id,
          company_alias: empresa.company_alias,
          valor: 500,
          motivo: 'Sem factura para rectificar.',
        }),
      VendaSemDocumentoException
    )
  })
})
