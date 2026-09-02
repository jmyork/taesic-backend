import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import testUtils from '@adonisjs/core/services/test_utils'
import FacturaRepository from '#repositories/factura_repository'
import Factura from '#models/faturacao/factura'
import VendaJaFacturadaException from '#exceptions/venda_ja_facturada_exception'
import DocumentoJaPagoException from '#exceptions/documento_ja_pago_exception'
import DocumentoSemDividaException from '#exceptions/documento_sem_divida_exception'
import ValorExcedeOrigemException from '#exceptions/valor_excede_origem_exception'
import VendaObrigatoriaException from '#exceptions/venda_obrigatoria_exception'
import VendaNaoFechadaException from '#exceptions/venda_nao_fechada_exception'
import VendaForaDoPeriodoException from '#exceptions/venda_fora_do_periodo_exception'
import { proximosDocumentos, tiposParaUmaVenda } from '../../app/helpers/regras_de_emissao.js'
import { createTenant, createCaixa, createVenda } from '../helpers/fixtures.js'

/**
 * As regras que faltavam à emissão.
 *
 * A primeira versão validava campos e propriedade, e mais nada — nunca perguntava
 * se a venda já tinha sido facturada nem se o documento já estava pago. O estado
 * encontrado na base de desenvolvimento foi uma venda de 20.000 Kz com OITO
 * documentos fiscais a titulá-la.
 */
/** O prazo de uma factura a crédito, para os testes não repetirem a conta. */
const daquiA30Dias = () => DateTime.now().plus({ days: 30 }).toJSDate()

test.group('factura — regra 1: uma venda, um documento que a titula', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  const TITULAM = ['Factura', 'Factura-Recibo', 'Factura Genérica'] as const

  for (const primeiro of TITULAM) {
    test(`depois de ${primeiro}, a mesma venda recusa outro documento titulador`, async ({
      assert,
    }) => {
      const { empresa, user, pos } = await createTenant()
      const caixa = await createCaixa(user, pos)
      const venda = await createVenda(caixa, { status: 'fechada', total: 20000 })

      const repo = new FacturaRepository()
      await repo.emitir({ venda_id: venda.id, tipo: primeiro, company_alias: empresa.company_alias })

      for (const segundo of TITULAM) {
        try {
          await repo.emitir({
            venda_id: venda.id,
            tipo: segundo,
            company_alias: empresa.company_alias,
          })
          assert.fail(`emitiu ${segundo} sobre uma venda já titulada por ${primeiro}`)
        } catch (error) {
          assert.instanceOf(error, VendaJaFacturadaException)
        }
      }
    })
  }

  /**
   * Anular existe precisamente para se poder emitir de novo depois de um erro. Se
   * a regra contasse os anulados, um engano na emissão trancava a venda para
   * sempre — e não haveria forma de a facturar.
   */
  test('anulado o primeiro, a venda volta a poder ser facturada', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    const venda = await createVenda(caixa, { status: 'fechada', total: 20000 })

    const repo = new FacturaRepository()
    const primeira = await repo.emitir({
      venda_id: venda.id,
      tipo: 'Factura',
      data_vencimento: daquiA30Dias(),
      company_alias: empresa.company_alias,
    })

    await repo.anular({
      id: primeira.id,
      company_alias: empresa.company_alias,
      motivo_anulacao: 'I',
    })

    const segunda = await repo.emitir({
      venda_id: venda.id,
      tipo: 'Factura',
      data_vencimento: daquiA30Dias(),
      company_alias: empresa.company_alias,
    })

    assert.equal(segunda.tipo, 'Factura')
    assert.notEqual(segunda.id, primeira.id)
  })

  /**
   * A regra é sobre os que TITULAM. Uma nota de crédito sobre a factura dessa
   * venda continua a poder ser emitida — senão não haveria como corrigir nada.
   */
  test('a regra não trava os documentos que rectificam ou liquidam', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    const venda = await createVenda(caixa, { status: 'fechada', total: 20000 })

    const repo = new FacturaRepository()
    const factura = await repo.emitir({
      venda_id: venda.id,
      tipo: 'Factura',
      data_vencimento: daquiA30Dias(),
      company_alias: empresa.company_alias,
    })

    const recibo = await repo.emitir({
      tipo: 'Recibo',
      documento_origem_id: factura.id,
      total: 20000,
      company_alias: empresa.company_alias,
    })

    assert.equal(recibo.tipo, 'Recibo')
  })
})

test.group('factura — regras 2, 3 e 5: pagamento', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  /** Uma factura-recibo titula a operação E o pagamento no mesmo acto. */
  for (const tipoPago of ['Factura-Recibo', 'Factura Genérica'] as const) {
    test(`não se emite recibo sobre ${tipoPago}`, async ({ assert }) => {
      const { empresa, user, pos } = await createTenant()
      const caixa = await createCaixa(user, pos)
      const venda = await createVenda(caixa, { status: 'fechada', total: 5000 })

      const repo = new FacturaRepository()
      const pago = await repo.emitir({
        venda_id: venda.id,
        tipo: tipoPago,
        company_alias: empresa.company_alias,
      })

      try {
        await repo.emitir({
          tipo: 'Recibo',
          documento_origem_id: pago.id,
          total: 5000,
          company_alias: empresa.company_alias,
        })
        assert.fail(`emitiu recibo sobre ${tipoPago}, que já inclui o pagamento`)
      } catch (error) {
        // Nunca foi uma dívida — não é o mesmo que ter sido paga.
        assert.instanceOf(error, DocumentoSemDividaException)
      }
    })
  }

  test('um documento não pode ter dois recibos', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    const venda = await createVenda(caixa, { status: 'fechada', total: 5000 })

    const repo = new FacturaRepository()
    const factura = await repo.emitir({
      venda_id: venda.id,
      tipo: 'Factura',
      data_vencimento: daquiA30Dias(),
      company_alias: empresa.company_alias,
    })

    await repo.emitir({
      tipo: 'Recibo',
      documento_origem_id: factura.id,
      total: 5000,
      company_alias: empresa.company_alias,
    })

    try {
      await repo.emitir({
        tipo: 'Recibo',
        documento_origem_id: factura.id,
        total: 5000,
        company_alias: empresa.company_alias,
      })
      assert.fail('emitiu um segundo recibo sobre a mesma factura')
    } catch (error) {
      assert.instanceOf(error, DocumentoJaPagoException)
    }
  })

  test('não se cobra o que já foi pago', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    const venda = await createVenda(caixa, { status: 'fechada', total: 5000 })

    const repo = new FacturaRepository()
    const paga = await repo.emitir({
      venda_id: venda.id,
      tipo: 'Factura-Recibo',
      company_alias: empresa.company_alias,
    })

    try {
      await repo.emitir({
        tipo: 'Aviso de Cobrança',
        documento_origem_id: paga.id,
        total: 5000,
        company_alias: empresa.company_alias,
      })
      assert.fail('emitiu aviso de cobrança sobre um documento já pago')
    } catch (error) {
      // Uma factura-recibo é paga no acto: nunca houve dívida a cobrar.
      assert.instanceOf(error, DocumentoSemDividaException)
    }
  })
})

test.group('factura — regra 4: a nota de crédito não excede a origem', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('recusa creditar mais do que foi facturado', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    const venda = await createVenda(caixa, { status: 'fechada', total: 20000 })

    const repo = new FacturaRepository()
    const factura = await repo.emitir({
      venda_id: venda.id,
      tipo: 'Factura',
      data_vencimento: daquiA30Dias(),
      company_alias: empresa.company_alias,
    })

    try {
      await repo.emitir({
        tipo: 'Nota de Crédito',
        documento_origem_id: factura.id,
        total: 20001,
        company_alias: empresa.company_alias,
      })
      assert.fail('creditou mais do que os 20.000 facturados')
    } catch (error) {
      assert.instanceOf(error, ValorExcedeOrigemException)
    }
  })

  test('aceita creditar exactamente o valor facturado', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    const venda = await createVenda(caixa, { status: 'fechada', total: 20000 })

    const repo = new FacturaRepository()
    const factura = await repo.emitir({
      venda_id: venda.id,
      tipo: 'Factura',
      data_vencimento: daquiA30Dias(),
      company_alias: empresa.company_alias,
    })

    const nota = await repo.emitir({
      tipo: 'Nota de Crédito',
      documento_origem_id: factura.id,
      total: 20000,
      company_alias: empresa.company_alias,
    })

    assert.equal(Number(nota.total), 20000)
  })

  /**
   * O tecto é sobre a SOMA. Creditar 15.000 e depois 6.000 sobre uma factura de
   * 20.000 é o mesmo excesso que creditar 21.000 de uma vez.
   */
  test('as notas anteriores contam para o tecto', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    const venda = await createVenda(caixa, { status: 'fechada', total: 20000 })

    const repo = new FacturaRepository()
    const factura = await repo.emitir({
      venda_id: venda.id,
      tipo: 'Factura',
      data_vencimento: daquiA30Dias(),
      company_alias: empresa.company_alias,
    })

    await repo.emitir({
      tipo: 'Nota de Crédito',
      documento_origem_id: factura.id,
      total: 15000,
      company_alias: empresa.company_alias,
    })

    try {
      await repo.emitir({
        tipo: 'Nota de Crédito',
        documento_origem_id: factura.id,
        total: 6000,
        company_alias: empresa.company_alias,
      })
      assert.fail('15.000 + 6.000 excede os 20.000 facturados')
    } catch (error) {
      assert.instanceOf(error, ValorExcedeOrigemException)
    }
  })

  /** Uma nota de DÉBITO acrescenta — não tem tecto derivado da origem. */
  test('a nota de débito não tem tecto', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    const venda = await createVenda(caixa, { status: 'fechada', total: 20000 })

    const repo = new FacturaRepository()
    const factura = await repo.emitir({
      venda_id: venda.id,
      tipo: 'Factura',
      data_vencimento: daquiA30Dias(),
      company_alias: empresa.company_alias,
    })

    const nota = await repo.emitir({
      tipo: 'Nota de Débito',
      documento_origem_id: factura.id,
      total: 25000,
      company_alias: empresa.company_alias,
    })

    assert.equal(Number(nota.total), 25000)
  })
})

/**
 * REGRA 6 — anular arrasta consigo tudo o que depende do documento.
 *
 * A regra dizia o contrário: um documento com dependentes não se anulava, e quem
 * quisesse desfazer uma factura tinha de ir anular à mão, pela ordem certa, o
 * recibo que a liquidou e a nota que a rectificou — descobrindo quais eram por
 * tentativa e erro, porque a recusa não dizia quantos nem onde estavam.
 *
 * O que a regra protegia continua a valer e é o que estes testes guardam: um
 * documento válido nunca fica a apontar para outro que deixou de produzir
 * efeitos. Mudou quem faz o trabalho.
 */
test.group('factura — regra 6: anular arrasta os dependentes', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  /** Uma factura a prazo, o recibo que a liquidou e a nota que a rectificou. */
  async function facturaComDependentes() {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    const venda = await createVenda(caixa, { status: 'fechada', total: 5000 })

    const repo = new FacturaRepository()
    const factura = await repo.emitir({
      venda_id: venda.id,
      tipo: 'Factura',
      data_vencimento: daquiA30Dias(),
      company_alias: empresa.company_alias,
    })

    const nota = await repo.emitir({
      tipo: 'Nota de Crédito',
      documento_origem_id: factura.id,
      total: 1000,
      company_alias: empresa.company_alias,
    })

    const recibo = await repo.emitir({
      tipo: 'Recibo',
      documento_origem_id: factura.id,
      total: 4000,
      company_alias: empresa.company_alias,
    })

    return { empresa, repo, factura, recibo, nota }
  }

  test('anular a factura anula o recibo e a nota que dependiam dela', async ({ assert }) => {
    const { empresa, repo, factura, recibo, nota } = await facturaComDependentes()

    const anulada = await repo.anular({
      id: factura.id,
      company_alias: empresa.company_alias,
      motivo_anulacao: 'I',
    })

    assert.equal(anulada.status, 'anulada')
    assert.equal(anulada.$extras.anulados_em_cascata, 2)

    for (const dependente of [recibo, nota]) {
      const relido = await Factura.findOrFail(dependente.id)
      assert.equal(relido.status, 'anulada')
      assert.include(
        relido.observacoes ?? '',
        'Anulado por arrastamento',
        'o documento tem de dizer porque foi anulado sem ninguém lhe ter tocado'
      )
    }
  })

  /*
   * A assimetria, e é o coração desta regra. Se este teste cair, cancelar um
   * recibo lançado por engano passa a anular a venda de alguém.
   */
  test('anular o recibo NÃO anula a factura que ele liquidava', async ({ assert }) => {
    const { empresa, repo, factura, recibo } = await facturaComDependentes()

    await repo.anular({
      id: recibo.id,
      company_alias: empresa.company_alias,
      motivo_anulacao: 'I',
    })

    const relida = await Factura.findOrFail(factura.id)
    assert.equal(relida.status, 'emitida', 'a factura titula uma venda que aconteceu')
    assert.isNull(relida.motivo_anulacao)
  })

  /*
   * A cadeia é real e não teórica: creditar uma nota de débito dá NC → ND → FT.
   * Uma versão que só descesse um nível deixaria a nota de crédito válida sobre
   * uma nota de débito anulada.
   */
  test('arrasta em cadeia, não só o primeiro nível', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    const venda = await createVenda(caixa, { status: 'fechada', total: 5000 })

    const repo = new FacturaRepository()
    const factura = await repo.emitir({
      venda_id: venda.id,
      tipo: 'Factura-Recibo',
      company_alias: empresa.company_alias,
    })

    const debito = await repo.emitir({
      tipo: 'Nota de Débito',
      documento_origem_id: factura.id,
      total: 500,
      company_alias: empresa.company_alias,
    })

    const credito = await repo.emitir({
      tipo: 'Nota de Crédito',
      documento_origem_id: debito.id,
      total: 500,
      company_alias: empresa.company_alias,
    })

    const anulada = await repo.anular({
      id: factura.id,
      company_alias: empresa.company_alias,
      motivo_anulacao: 'N',
    })

    assert.equal(anulada.$extras.anulados_em_cascata, 2)
    assert.equal((await Factura.findOrFail(debito.id)).status, 'anulada')
    assert.equal(
      (await Factura.findOrFail(credito.id)).status,
      'anulada',
      'o segundo nível também — senão a nota credita uma nota anulada'
    )
  })

  /*
   * Um documento anulado não produz efeitos, portanto não há nada a desfazer
   * nele. Contá-lo faria a mensagem prometer a quem anula um trabalho que não
   * aconteceu.
   */
  test('os já anulados não entram na conta', async ({ assert }) => {
    const { empresa, repo, factura, recibo } = await facturaComDependentes()

    await repo.anular({
      id: recibo.id,
      company_alias: empresa.company_alias,
      motivo_anulacao: 'I',
    })

    const anulada = await repo.anular({
      id: factura.id,
      company_alias: empresa.company_alias,
      motivo_anulacao: 'I',
    })

    assert.equal(anulada.$extras.anulados_em_cascata, 1, 'só a nota de crédito restava')
  })

  test('um documento sozinho anula-se sem arrastar nada', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    const venda = await createVenda(caixa, { status: 'fechada', total: 5000 })

    const repo = new FacturaRepository()
    const factura = await repo.emitir({
      venda_id: venda.id,
      tipo: 'Factura-Recibo',
      company_alias: empresa.company_alias,
    })

    const anulada = await repo.anular({
      id: factura.id,
      company_alias: empresa.company_alias,
      motivo_anulacao: 'I',
    })

    assert.equal(anulada.status, 'anulada')
    assert.equal(anulada.$extras.anulados_em_cascata, 0)
    assert.isEmpty(anulada.observacoes ?? '', 'não se escreve arrastamento em quem foi pedido')
  })
})

/**
 * O período do MÊS CORRENTE.
 *
 * As vendas de teste nascem agora, e a regra 7 exige que caiam dentro do período
 * declarado. Fixar '2026-01-01' fazia os testes passarem em Janeiro e falharem
 * no resto do ano — que é a pior forma de um teste falhar.
 */
const periodoDeHoje = () => ({
  periodo_inicio: DateTime.now().startOf('month').toJSDate(),
  periodo_fim: DateTime.now().toJSDate(),
})

test.group('factura global — cobre várias vendas', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('o total é a soma das vendas cobertas, e as ligações ficam gravadas', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    const v1 = await createVenda(caixa, { status: 'fechada', total: 12000 })
    const v2 = await createVenda(caixa, { status: 'fechada', total: 8000 })
    const v3 = await createVenda(caixa, { status: 'fechada', total: 500 })

    const repo = new FacturaRepository()
    const global = await repo.emitir({
      tipo: 'Factura Global',
      vendas_ids: [v1.id, v2.id, v3.id],
      ...periodoDeHoje(),
      // Mandado de propósito e propositadamente errado: tem de ser ignorado.
      total: 999999,
      company_alias: empresa.company_alias,
    })

    assert.equal(Number(global.total), 20500, 'o total é a soma, nunca o número enviado')

    const cobertas = await repo.vendasCobertas({
      id: global.id,
      company_alias: empresa.company_alias,
    })
    assert.sameMembers(cobertas, [v1.id, v2.id, v3.id])
  })

  /** REGRA 1, aplicada ao conjunto: uma venda coberta já está titulada. */
  test('uma venda dentro de uma global não pode ser facturada outra vez', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    const v1 = await createVenda(caixa, { status: 'fechada', total: 1000 })
    const v2 = await createVenda(caixa, { status: 'fechada', total: 2000 })

    const repo = new FacturaRepository()
    await repo.emitir({
      tipo: 'Factura Global',
      vendas_ids: [v1.id, v2.id],
      ...periodoDeHoje(),
      company_alias: empresa.company_alias,
    })

    try {
      await repo.emitir({
        venda_id: v1.id,
        tipo: 'Factura',
        data_vencimento: daquiA30Dias(),
        company_alias: empresa.company_alias,
      })
      assert.fail('facturou uma venda que já está dentro de uma factura global')
    } catch (error) {
      assert.instanceOf(error, VendaJaFacturadaException)
    }

    try {
      await repo.emitir({
        tipo: 'Factura Global',
        vendas_ids: [v2.id],
        ...periodoDeHoje(),
        company_alias: empresa.company_alias,
      })
      assert.fail('cobriu a mesma venda em duas facturas globais')
    } catch (error) {
      assert.instanceOf(error, VendaJaFacturadaException)
    }
  })

  test('as vendas por facturar deixam de incluir as cobertas por uma global', async ({
    assert,
  }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    const v1 = await createVenda(caixa, { status: 'fechada', total: 1000 })
    const v2 = await createVenda(caixa, { status: 'fechada', total: 2000 })

    const repo = new FacturaRepository()
    const antes = await repo.vendasPorFacturar(empresa.company_alias)
    assert.includeMembers(
      antes.map((v) => v.id),
      [v1.id, v2.id]
    )

    await repo.emitir({
      tipo: 'Factura Global',
      vendas_ids: [v1.id],
      ...periodoDeHoje(),
      company_alias: empresa.company_alias,
    })

    const depois = (await repo.vendasPorFacturar(empresa.company_alias)).map((v) => v.id)
    assert.notInclude(depois, v1.id, 'já está coberta pela global')
    assert.include(depois, v2.id, 'esta continua livre')
  })

  /**
   * Um id de outra empresa desapareceria em silêncio num `whereIn`, e a global
   * saía a cobrir menos operações do que quem a emitiu julga.
   */
  test('recusa a lista se alguma venda não for desta empresa', async ({ assert }) => {
    const tenantA = await createTenant()
    const tenantB = await createTenant()

    const caixaA = await createCaixa(tenantA.user, tenantA.pos)
    const caixaB = await createCaixa(tenantB.user, tenantB.pos)
    const daA = await createVenda(caixaA, { status: 'fechada', total: 1000 })
    const daB = await createVenda(caixaB, { status: 'fechada', total: 2000 })

    try {
      await new FacturaRepository().emitir({
        tipo: 'Factura Global',
        vendas_ids: [daA.id, daB.id],
        ...periodoDeHoje(),
        company_alias: tenantA.empresa.company_alias,
      })
      assert.fail('aceitou uma venda de outra empresa na factura global')
    } catch (error) {
      assert.instanceOf(error, VendaObrigatoriaException)
    }
  })

  /**
   * REGRA 7 — as vendas têm de cair dentro do período declarado.
   *
   * Sem esta verificação, uma global de Janeiro podia cobrir vendas de Março: o
   * documento declarava um período e titulava outro, e o total não batia com
   * nada.
   */
  test('recusa vendas fora do período declarado', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    const venda = await createVenda(caixa, { status: 'fechada', total: 1000 })

    try {
      await new FacturaRepository().emitir({
        tipo: 'Factura Global',
        vendas_ids: [venda.id],
        // A venda é de hoje; o período é de 2020.
        periodo_inicio: new Date('2020-01-01'),
        periodo_fim: new Date('2020-01-31'),
        company_alias: empresa.company_alias,
      })
      assert.fail('cobriu uma venda de fora do período declarado')
    } catch (error) {
      assert.instanceOf(error, VendaForaDoPeriodoException)
    }
  })

  /**
   * O fim do período é inclusivo até ao FIM DO DIA.
   *
   * `vendas.created_at` é um timestamp: comparar com a data seca deixaria de fora
   * tudo o que foi vendido nesse dia depois da meia-noite — ou seja, o dia
   * inteiro. É a mesma armadilha do filtro de datas da listagem.
   */
  test('uma venda de hoje cabe num período que termina hoje', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    const venda = await createVenda(caixa, { status: 'fechada', total: 1000 })

    const hoje = DateTime.now()

    const global = await new FacturaRepository().emitir({
      tipo: 'Factura Global',
      vendas_ids: [venda.id],
      periodo_inicio: hoje.startOf('month').toJSDate(),
      periodo_fim: hoje.toJSDate(),
      company_alias: empresa.company_alias,
    })

    assert.equal(Number(global.total), 1000)
  })

  test('recusa a lista se alguma venda não estiver fechada', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    const fechada = await createVenda(caixa, { status: 'fechada', total: 1000 })
    const aberta = await createVenda(caixa, { status: 'aberta', total: 2000 })

    try {
      await new FacturaRepository().emitir({
        tipo: 'Factura Global',
        vendas_ids: [fechada.id, aberta.id],
        ...periodoDeHoje(),
        company_alias: empresa.company_alias,
      })
      assert.fail('cobriu uma venda ainda aberta')
    } catch (error) {
      assert.instanceOf(error, VendaNaoFechadaException)
    }
  })
})

test.group('regras de emissão — o que pode vir a seguir (sem BD)', () => {
  test('de uma venda fechada só saem os três que a titulam', ({ assert }) => {
    assert.deepEqual(
      tiposParaUmaVenda().map((a) => a.tipo),
      ['Factura', 'Factura-Recibo', 'Factura Genérica']
    )
  })

  test('uma factura por pagar oferece recibo, cobrança e as duas notas', ({ assert }) => {
    const accoes = proximosDocumentos({
      tipo: 'Factura',
      anulado: false,
      aCredito: true,
      liquidado: false,
      temDependentes: false,
    }).map((a) => a.tipo)

    assert.includeMembers(accoes, [
      'Recibo',
      'Aviso de Cobrança',
      'Nota de Crédito',
      'Nota de Débito',
    ])
    assert.notInclude(accoes, 'Estorno', 'nada foi recebido ainda')
  })

  test('uma factura já liquidada deixa de oferecer recibo, e passa a oferecer estorno', ({
    assert,
  }) => {
    const accoes = proximosDocumentos({
      tipo: 'Factura',
      anulado: false,
      aCredito: true,
      liquidado: true,
      temDependentes: true,
    }).map((a) => a.tipo)

    assert.notInclude(accoes, 'Recibo')
    assert.notInclude(accoes, 'Aviso de Cobrança')
    assert.include(accoes, 'Estorno')
  })

  test('uma factura-recibo nunca oferece recibo', ({ assert }) => {
    const accoes = proximosDocumentos({
      tipo: 'Factura-Recibo',
      anulado: false,
      // Paga no acto: nunca nasceu em dívida, e é isso que lhe tira o recibo.
      aCredito: false,
      liquidado: false,
      temDependentes: false,
    }).map((a) => a.tipo)

    assert.notInclude(accoes, 'Recibo', 'já inclui o pagamento')
    assert.include(accoes, 'Estorno')
    assert.include(accoes, 'Nota de Crédito')
  })

  /**
   * A factura global é uma factura por pagar como as outras.
   *
   * Ficou de fora na primeira versão desta função, e a falha só apareceu ao
   * exercitar o fluxo por HTTP: uma global emitida oferecia as duas notas e mais
   * nada — sem forma nenhuma de registar o pagamento dela.
   */
  test('uma factura global por pagar oferece recibo e cobrança', ({ assert }) => {
    const accoes = proximosDocumentos({
      tipo: 'Factura Global',
      anulado: false,
      aCredito: true,
      liquidado: false,
      temDependentes: false,
    }).map((a) => a.tipo)

    assert.includeMembers(accoes, [
      'Recibo',
      'Aviso de Cobrança',
      'Nota de Crédito',
      'Nota de Débito',
    ])
  })

  test('um documento anulado não oferece nada', ({ assert }) => {
    assert.isEmpty(
      proximosDocumentos({
        tipo: 'Factura',
        anulado: true,
        aCredito: true,
        liquidado: false,
        temDependentes: false,
      })
    )
  })
})

/**
 * REGRA 6b — anular a OPERAÇÃO inteira, quando é isso que se quer.
 *
 * ── Porque é que são duas acções e não um alcance por omissão ────────────────
 *
 * `dependentes` (o de omissão) desce; `operacao` sobe também. A diferença
 * decide-se por uma pergunta prática: com o estreito ainda se consegue tudo —
 * para desfazer a operação inteira basta anular o documento que está na raiz. Ao
 * contrário não: com o largo por omissão, deixava de haver forma nenhuma de
 * corrigir um recibo lançado por engano sem anular a factura, e a factura
 * reemitida levaria número novo.
 *
 * O alcance largo desfaz uma venda. É uma acção que se pede.
 */
test.group('factura — regra 6b: anular a operação inteira', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  /** Uma factura a prazo, a nota que a rectificou e o recibo que a liquidou. */
  async function operacaoCompleta() {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    const venda = await createVenda(caixa, { status: 'fechada', total: 5000 })

    const repo = new FacturaRepository()
    const factura = await repo.emitir({
      venda_id: venda.id,
      tipo: 'Factura',
      data_vencimento: daquiA30Dias(),
      company_alias: empresa.company_alias,
    })

    const nota = await repo.emitir({
      tipo: 'Nota de Crédito',
      documento_origem_id: factura.id,
      total: 1000,
      company_alias: empresa.company_alias,
    })

    const recibo = await repo.emitir({
      tipo: 'Recibo',
      documento_origem_id: factura.id,
      total: 4000,
      company_alias: empresa.company_alias,
    })

    return { empresa, repo, factura, recibo, nota }
  }

  /*
   * O caso que a acção existe para servir: entrar por uma PONTA e desfazer tudo.
   * Com o alcance de omissão, anular o recibo deixaria a factura de pé.
   */
  test('entrando pelo recibo, desfaz também a factura', async ({ assert }) => {
    const { empresa, repo, factura, recibo, nota } = await operacaoCompleta()

    const anulado = await repo.anular({
      id: recibo.id,
      company_alias: empresa.company_alias,
      motivo_anulacao: 'N',
      alcance: 'operacao',
    })

    assert.equal(anulado.status, 'anulada')
    assert.equal(anulado.$extras.anulados_em_cascata, 2, 'a factura e a nota')

    for (const outro of [factura, nota]) {
      assert.equal((await Factura.findOrFail(outro.id)).status, 'anulada')
    }
  })

  /*
   * A garantia que separa as duas acções. Se este teste cair, o alcance largo
   * passou a ser o de omissão — e corrigir um recibo passa a desfazer a venda.
   */
  test('sem pedir o alcance, o recibo cai sozinho', async ({ assert }) => {
    const { empresa, repo, factura, recibo } = await operacaoCompleta()

    await repo.anular({
      id: recibo.id,
      company_alias: empresa.company_alias,
      motivo_anulacao: 'N',
    })

    assert.equal(
      (await Factura.findOrFail(factura.id)).status,
      'emitida',
      'a factura titula uma venda que aconteceu'
    )
  })

  /*
   * Chega-se ao mesmo conjunto por qualquer porta — é o que faz de «operação» uma
   * coisa e não um ponto de vista. Se o resultado dependesse de onde se clicou,
   * o aviso do ecrã não poderia prometer nada.
   */
  test('o conjunto é o mesmo, entre por onde entrar', async ({ assert }) => {
    const pelaNota = await operacaoCompleta()
    const porNota = await pelaNota.repo.anular({
      id: pelaNota.nota.id,
      company_alias: pelaNota.empresa.company_alias,
      motivo_anulacao: 'N',
      alcance: 'operacao',
    })

    const pelaFactura = await operacaoCompleta()
    const porFactura = await pelaFactura.repo.anular({
      id: pelaFactura.factura.id,
      company_alias: pelaFactura.empresa.company_alias,
      motivo_anulacao: 'N',
      alcance: 'operacao',
    })

    assert.equal(porNota.$extras.anulados_em_cascata, porFactura.$extras.anulados_em_cascata)
  })

  /*
   * Os irmãos pela VENDA, que não se apontam uns aos outros: a factura de
   * adiantamento e o documento final da entrega ligam-se pela venda. O alcance
   * estreito nunca lá chega — é a segunda coisa que distingue os dois.
   */
  test('apanha os irmãos ligados pela venda, que a cascata estreita não alcança', async ({
    assert,
  }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    const venda = await createVenda(caixa, { status: 'fechada', total: 3000 })

    const repo = new FacturaRepository()
    const adiantamento = await repo.emitir({
      venda_id: venda.id,
      tipo: 'Factura de Adiantamento',
      company_alias: empresa.company_alias,
    })

    const entrega = await repo.emitir({
      venda_id: venda.id,
      tipo: 'Factura-Recibo',
      company_alias: empresa.company_alias,
    })

    // Estreito: não se tocam, portanto não se arrastam.
    const estreito = await repo.anular({
      id: adiantamento.id,
      company_alias: empresa.company_alias,
      motivo_anulacao: 'I',
    })
    assert.equal(estreito.$extras.anulados_em_cascata, 0)
    assert.equal((await Factura.findOrFail(entrega.id)).status, 'emitida')

    // Largo: a venda liga-os, e caem juntos.
    const outra = await createVenda(caixa, { status: 'fechada', total: 3000 })
    const fa = await repo.emitir({
      venda_id: outra.id,
      tipo: 'Factura de Adiantamento',
      company_alias: empresa.company_alias,
    })
    const fr = await repo.emitir({
      venda_id: outra.id,
      tipo: 'Factura-Recibo',
      company_alias: empresa.company_alias,
    })

    const largo = await repo.anular({
      id: fa.id,
      company_alias: empresa.company_alias,
      motivo_anulacao: 'I',
      alcance: 'operacao',
    })

    assert.equal(largo.$extras.anulados_em_cascata, 1)
    assert.equal((await Factura.findOrFail(fr.id)).status, 'anulada')
  })
})
