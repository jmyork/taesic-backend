import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import testUtils from '@adonisjs/core/services/test_utils'

import VendasRepository from '#repositories/vendas_repository'
import Cliente from '#models/cliente'
import Factura from '#models/faturacao/factura'
import Lote from '#models/faturacao/lote'
import Caixa from '#models/caixa'
import Vendas from '#models/faturacao/vendas'
import VendaSemClienteIdentificadoException from '#exceptions/venda_sem_cliente_identificado_exception'
import VendaACreditoComPagamentoException from '#exceptions/venda_a_credito_com_pagamento_exception'
import VendaSemPagamentoException from '#exceptions/venda_sem_pagamento_exception'
import VendaNaoEAdiantamentoException from '#exceptions/venda_nao_e_adiantamento_exception'
import VendaJaEntregueException from '#exceptions/venda_ja_entregue_exception'
import DocumentoSemDividaException from '#exceptions/documento_sem_divida_exception'
import FacturaRepository from '#repositories/factura_repository'
import AvisoCobrancaRepository from '#repositories/aviso_cobranca_repository'
import {
  createTenant,
  createProduto,
  createLote,
  createCaixa,
  createVenda,
  createVendaItem,
  pagarVenda,
} from '../helpers/fixtures.js'

/**
 * O fluxo de venda emite o documento fiscal — e é isso que estes testes guardam.
 *
 * ── O que estava errado, e o que estes testes impedem de voltar ─────────────
 *
 * Fechar uma venda movia stock, somava a caixa e acabava aí. O documento fiscal
 * era um SEGUNDO acto, noutro ecrã, feito à mão por quem se lembrasse — e quem se
 * lembrasse tinha ainda de escolher entre quatro tipos sem critério nenhum que os
 * separasse. Os dois resultados estão registados: uma venda de 20.000 Kz com oito
 * documentos a titulá-la, e (o caso silencioso, e pior) vendas sem documento.
 *
 * O que se testa aqui é a matriz inteira, condição a condição: que documento sai,
 * se o stock se move, se o dinheiro é exigido, e se a dívida fica registada.
 */

/** Monta uma venda aberta com um item, pronta a fechar. */
async function vendaComItem(
  opcoes: { comCliente?: boolean; nif?: string | null; precoUnitario?: number } = {}
) {
  const { empresa, user, pos } = await createTenant()
  const produto = await createProduto(empresa)
  const lote = await createLote(produto, {
    quantidade_em_estoque: 50,
    preco_venda: opcoes.precoUnitario ?? 1000,
  })
  const caixa = await createCaixa(user, pos)

  let cliente: Cliente | null = null
  if (opcoes.comCliente) {
    cliente = await Cliente.create({
      nome: 'Cliente de Teste',
      tipo: 'Pessoa Física',
      nif: opcoes.nif === undefined ? '5000123456' : opcoes.nif,
      empresa_id: empresa.id,
    } as any)
  }

  const venda = await createVenda(caixa, { status: 'aberta' })
  if (cliente) {
    venda.cliente_presencial_id = cliente.id
    await venda.save()
  }

  await createVendaItem(venda, lote, { quantidade: 2, preco_unitario: 1000 })

  return { empresa, user, pos, produto, lote, caixa, venda, cliente }
}

/** O documento que uma venda passou a ter — falha se não houver nenhum. */
async function documentoDa(vendaId: string) {
  return Factura.query().where('venda_id', vendaId).whereNull('deleted_at').firstOrFail()
}

test.group('venda a pronto pagamento — o caso de sempre, agora com documento', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('sem NIF sai uma factura genérica, e o stock sai', async ({ assert }) => {
    const { empresa, user, venda, lote } = await vendaComItem()
    await pagarVenda(venda, 2000)

    const fechada = await new VendasRepository().close({
      id: venda.id,
      user_id: user.id,
      company_alias: empresa.company_alias,
    })

    assert.equal(fechada.status, 'fechada')
    assert.equal(fechada.condicao_pagamento, 'pronto_pagamento')

    const documento = await documentoDa(venda.id)
    assert.equal(documento.tipo, 'Factura Genérica')
    assert.equal(Number(documento.total), 2000)
    assert.isNull(
      documento.data_vencimento,
      'paga no acto — não pode aparecer no mapa de contas a receber'
    )

    const loteDepois = await Lote.findOrFail(lote.id)
    assert.equal(Number(loteDepois.quantidade_em_estoque), 48)
  })

  test('com NIF sai uma factura-recibo', async ({ assert }) => {
    const { empresa, user, venda } = await vendaComItem({ comCliente: true })
    await pagarVenda(venda, 2000)

    await new VendasRepository().close({
      id: venda.id,
      user_id: user.id,
      company_alias: empresa.company_alias,
    })

    const documento = await documentoDa(venda.id)
    assert.equal(documento.tipo, 'Factura-Recibo')
    assert.equal(documento.cliente_nif, '5000123456')
  })

  /**
   * Um cliente registado sem NIF continua sem identificação FISCAL.
   *
   * É a distinção que decide o documento, e é fácil de perder de vista: o nome do
   * cliente fica na venda e no documento, mas o documento tem de dizer o que a lei
   * manda dizer, e sem NIF isso é «Factura Genérica».
   */
  test('um cliente sem NIF continua a dar factura genérica', async ({ assert }) => {
    const { empresa, user, venda } = await vendaComItem({ comCliente: true, nif: null })
    await pagarVenda(venda, 2000)

    await new VendasRepository().close({
      id: venda.id,
      user_id: user.id,
      company_alias: empresa.company_alias,
    })

    const documento = await documentoDa(venda.id)
    assert.equal(documento.tipo, 'Factura Genérica')
    assert.equal(documento.cliente_nome, 'Cliente de Teste', 'o nome fica na mesma')
  })

  test('sem pagamento não fecha — a regra de sempre continua de pé', async ({ assert }) => {
    const { empresa, user, venda } = await vendaComItem()

    await assert.rejects(
      () =>
        new VendasRepository().close({
          id: venda.id,
          user_id: user.id,
          company_alias: empresa.company_alias,
        }),
      VendaSemPagamentoException
    )
  })
})

test.group('venda a crédito — a que obrigou a rever o modelo', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('fecha SEM pagamento e emite uma Factura com data de vencimento', async ({ assert }) => {
    const { empresa, user, venda, lote } = await vendaComItem({ comCliente: true })

    const fechada = await new VendasRepository().close({
      id: venda.id,
      user_id: user.id,
      company_alias: empresa.company_alias,
      condicao_pagamento: 'credito',
      prazo_pagamento_dias: 15,
    })

    assert.equal(fechada.status, 'fechada')
    assert.equal(fechada.prazo_pagamento_dias, 15)

    const documento = await documentoDa(venda.id)
    assert.equal(documento.tipo, 'Factura')
    assert.isNotNull(documento.data_vencimento, 'é isto que a torna uma conta a receber')
    assert.equal(
      documento.data_vencimento!.toISODate(),
      DateTime.now().startOf('day').plus({ days: 15 }).toISODate()
    )

    // A entrega aconteceu: o produto saiu, o que falta é o dinheiro.
    const loteDepois = await Lote.findOrFail(lote.id)
    assert.equal(Number(loteDepois.quantidade_em_estoque), 48)
  })

  /**
   * O dinheiro NÃO entra na caixa.
   *
   * É o bug que a mudança de `recalcularTotais` corrige e o teste que o fixa: uma
   * venda a prazo que somasse a `total_caixa` daria uma caixa a declarar dinheiro
   * que ninguém recebeu — e o fecho do dia a acusar uma falta do valor exacto da
   * venda.
   */
  test('entra em total_vendas e NÃO em total_caixa', async ({ assert }) => {
    const { empresa, user, venda, caixa } = await vendaComItem({ comCliente: true })
    const valorInicial = Number((await Caixa.findOrFail(caixa.id)).valor_inicial)

    await new VendasRepository().close({
      id: venda.id,
      user_id: user.id,
      company_alias: empresa.company_alias,
      condicao_pagamento: 'credito',
    })

    const caixaDepois = await Caixa.findOrFail(caixa.id)
    assert.equal(Number(caixaDepois.total_vendas), 2000, 'é volume de negócio, e houve venda')
    assert.equal(
      Number(caixaDepois.total_caixa),
      valorInicial,
      'não entrou um kwanza na gaveta'
    )
  })

  test('sem cliente identificado é recusada', async ({ assert }) => {
    const { empresa, user, venda } = await vendaComItem()

    await assert.rejects(
      () =>
        new VendasRepository().close({
          id: venda.id,
          user_id: user.id,
          company_alias: empresa.company_alias,
          condicao_pagamento: 'credito',
        }),
      VendaSemClienteIdentificadoException
    )
  })

  test('com pagamento registado é recusada', async ({ assert }) => {
    const { empresa, user, venda } = await vendaComItem({ comCliente: true })
    await pagarVenda(venda, 2000)

    await assert.rejects(
      () =>
        new VendasRepository().close({
          id: venda.id,
          user_id: user.id,
          company_alias: empresa.company_alias,
          condicao_pagamento: 'credito',
        }),
      VendaACreditoComPagamentoException
    )
  })

  test('o prazo por omissão vem da empresa', async ({ assert }) => {
    const { empresa, user, venda } = await vendaComItem({ comCliente: true })
    empresa.prazo_pagamento_dias = 8
    await empresa.save()

    await new VendasRepository().close({
      id: venda.id,
      user_id: user.id,
      company_alias: empresa.company_alias,
      condicao_pagamento: 'credito',
    })

    const documento = await documentoDa(venda.id)
    assert.equal(
      documento.data_vencimento!.toISODate(),
      DateTime.now().startOf('day').plus({ days: 8 }).toISODate()
    )
  })
})

test.group('venda por adiantamento — dinheiro hoje, produto depois', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  /**
   * O stock NÃO sai — e é o que distingue esta condição de todas as outras.
   *
   * Dar baixa aqui afirmaria uma saída que não aconteceu, e o sistema passaria a
   * contar menos unidades do que as que estão fisicamente no armazém.
   */
  test('exige o dinheiro, não move o stock, e emite factura de adiantamento', async ({
    assert,
  }) => {
    const { empresa, user, venda, lote } = await vendaComItem({ comCliente: true })
    await pagarVenda(venda, 2000)

    await new VendasRepository().close({
      id: venda.id,
      user_id: user.id,
      company_alias: empresa.company_alias,
      condicao_pagamento: 'adiantamento',
    })

    const documento = await documentoDa(venda.id)
    assert.equal(documento.tipo, 'Factura de Adiantamento')
    assert.isNull(documento.data_vencimento, 'foi pago — não há nada a receber')

    const loteDepois = await Lote.findOrFail(lote.id)
    assert.equal(Number(loteDepois.quantidade_em_estoque), 50, 'o produto continua no armazém')
  })

  test('sem cliente identificado é recusado', async ({ assert }) => {
    const { empresa, user, venda } = await vendaComItem()
    await pagarVenda(venda, 2000)

    await assert.rejects(
      () =>
        new VendasRepository().close({
          id: venda.id,
          user_id: user.id,
          company_alias: empresa.company_alias,
          condicao_pagamento: 'adiantamento',
        }),
      VendaSemClienteIdentificadoException
    )
  })

  /**
   * A venda continua POR TITULAR até a entrega.
   *
   * A factura de adiantamento titula o RECEBIMENTO, não a operação — e é por isso
   * que não está em `TIPOS_QUE_TITULAM_A_VENDA`. Se estivesse, a entrega não
   * conseguiria emitir o documento da operação e a venda ficaria sem ele para
   * sempre.
   */
  test('a entrega dá baixa no stock e emite o documento que titula a venda', async ({
    assert,
  }) => {
    const { empresa, user, venda, lote } = await vendaComItem({ comCliente: true })
    await pagarVenda(venda, 2000)

    const repo = new VendasRepository()
    await repo.close({
      id: venda.id,
      user_id: user.id,
      company_alias: empresa.company_alias,
      condicao_pagamento: 'adiantamento',
    })

    const adiantamento = await documentoDa(venda.id)

    await repo.entregar({
      id: venda.id,
      user_id: user.id,
      company_alias: empresa.company_alias,
    })

    const loteDepois = await Lote.findOrFail(lote.id)
    assert.equal(Number(loteDepois.quantidade_em_estoque), 48, 'agora sim, o produto saiu')

    const vendaDepois = await Vendas.findOrFail(venda.id)
    assert.isNotNull(vendaDepois.entregue_em)

    const documentos = await Factura.query().where('venda_id', venda.id).whereNull('deleted_at')

    /*
     * Procurado pelo TIPO e não pela ordem de criação.
     *
     * Os dois documentos são emitidos com segundos de diferença — no teste, no
     * mesmo segundo — e ordenar por `created_at` devolve-os em ordem arbitrária.
     * Foi assim que este teste falhou a primeira vez, a apontar para o
     * adiantamento como se fosse o documento final.
     */
    assert.lengthOf(documentos, 2, 'o adiantamento e o documento da entrega')

    const final = documentos.find((d) => d.tipo === 'Factura-Recibo')
    assert.exists(final, 'a entrega tem de titular a venda')
    assert.include(
      final!.observacoes ?? '',
      adiantamento.referencia!,
      'o documento final tem de dizer que o dinheiro já tinha entrado'
    )
  })

  test('não se entrega duas vezes', async ({ assert }) => {
    const { empresa, user, venda } = await vendaComItem({ comCliente: true })
    await pagarVenda(venda, 2000)

    const repo = new VendasRepository()
    await repo.close({
      id: venda.id,
      user_id: user.id,
      company_alias: empresa.company_alias,
      condicao_pagamento: 'adiantamento',
    })
    await repo.entregar({ id: venda.id, user_id: user.id, company_alias: empresa.company_alias })

    await assert.rejects(
      () => repo.entregar({ id: venda.id, user_id: user.id, company_alias: empresa.company_alias }),
      VendaJaEntregueException
    )
  })

  test('não se entrega uma venda que não é adiantamento', async ({ assert }) => {
    const { empresa, user, venda } = await vendaComItem()
    await pagarVenda(venda, 2000)

    const repo = new VendasRepository()
    await repo.close({ id: venda.id, user_id: user.id, company_alias: empresa.company_alias })

    await assert.rejects(
      () => repo.entregar({ id: venda.id, user_id: user.id, company_alias: empresa.company_alias }),
      VendaNaoEAdiantamentoException
    )
  })
})

/**
 * O que a factura de adiantamento espera — e o que NÃO espera.
 *
 * ── Porque é que este grupo existe ───────────────────────────────────────────
 *
 * Houve uma passagem em que o adiantamento passou a aceitar recibo, com o
 * argumento de que titula um recebimento e o recebimento precisa de prova. Está
 * revertido, e a razão é a definição da condição: no adiantamento o dinheiro
 * entra PRIMEIRO (`exigePagamento: true`) e a mercadoria sai depois. Não há
 * recebimento por confirmar — oferecê-lo era pedir a quem já pagou que
 * confirmasse outra vez que pagou.
 *
 * O que fica por fazer num adiantamento é a ENTREGA. Estes testes guardam a
 * diferença entre as duas coisas.
 */
test.group('a factura de adiantamento espera a entrega, não o recibo', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  async function adiantamentoFechado() {
    const { empresa, user, venda } = await vendaComItem({ comCliente: true })
    await pagarVenda(venda, 2000)

    await new VendasRepository().close({
      id: venda.id,
      user_id: user.id,
      company_alias: empresa.company_alias,
      condicao_pagamento: 'adiantamento',
    })

    return { empresa, user, venda, adiantamento: await documentoDa(venda.id) }
  }

  test('não aceita recibo — o dinheiro já entrou', async ({ assert }) => {
    const { empresa, adiantamento } = await adiantamentoFechado()
    assert.equal(adiantamento.tipo, 'Factura de Adiantamento')
    assert.isNull(adiantamento.data_vencimento, 'um adiantamento nasce sem prazo')

    await assert.rejects(
      () =>
        new FacturaRepository().confirmarRecebimento({
          id: adiantamento.id,
          company_alias: empresa.company_alias,
        }),
      DocumentoSemDividaException
    )
  })

  /*
   * A consequência no ecrã: é esta lista que decide o que o menu de acções
   * oferece. Nem recibo (nada a receber) nem aviso de cobrança (nada a cobrar).
   */
  test('nem recibo nem aviso de cobrança aparecem como próximo passo', async ({ assert }) => {
    const { empresa, adiantamento } = await adiantamentoFechado()

    const estado = await new FacturaRepository().proximos({
      id: adiantamento.id,
      company_alias: empresa.company_alias,
    })

    assert.isFalse(estado.em_divida)
    assert.notInclude(estado.proximos.map((p) => p.tipo), 'Recibo')
    assert.notInclude(estado.proximos.map((p) => p.tipo), 'Aviso de Cobrança')
  })

  test('não é conta a receber — o dinheiro do adiantamento já está em caixa', async ({
    assert,
  }) => {
    const { empresa } = await adiantamentoFechado()

    const contas = await new FacturaRepository().contasAReceber({
      company_alias: empresa.company_alias,
    })

    assert.equal(Number(contas.resumo.total), 0)
  })

  /*
   * O outro lado da mesma regra: os tipos que JÁ trazem a quitação também
   * recusam. Um recibo sobre uma factura-recibo seria a mesma prova duas vezes.
   */
  test('uma factura-recibo também recusa o recibo', async ({ assert }) => {
    const { empresa, user, venda } = await vendaComItem({ comCliente: true })
    await pagarVenda(venda, 2000)

    await new VendasRepository().close({
      id: venda.id,
      user_id: user.id,
      company_alias: empresa.company_alias,
    })

    const facturaRecibo = await documentoDa(venda.id)
    assert.equal(facturaRecibo.tipo, 'Factura-Recibo')

    await assert.rejects(
      () =>
        new FacturaRepository().confirmarRecebimento({
          id: facturaRecibo.id,
          company_alias: empresa.company_alias,
        }),
      DocumentoSemDividaException
    )
  })
})

/**
 * Os documentos de uma operação, juntos.
 *
 * Uma operação comercial raramente cabe num documento só: vender a prazo produz
 * uma factura hoje e um recibo quando o dinheiro entra. Separados contam meia
 * história — e era assim que o ecrã os dava, um de cada vez, sem nada que dissesse
 * quantos eram.
 *
 * O que estes testes guardam é que se chega ao conjunto INTEIRO por qualquer um
 * dos seus membros: entrar pela factura tem de trazer o recibo, e entrar pelo
 * recibo tem de trazer a factura.
 */
test.group('documentos de uma operação', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('a factura a prazo e o recibo que a liquidou vêm juntos', async ({ assert }) => {
    const { empresa, user, venda } = await vendaComItem({ comCliente: true })

    await new VendasRepository().close({
      id: venda.id,
      user_id: user.id,
      company_alias: empresa.company_alias,
      condicao_pagamento: 'credito',
    })

    const factura = await documentoDa(venda.id)
    const repo = new FacturaRepository()

    const sozinha = await repo.documentosDaOperacao({
      id: factura.id,
      company_alias: empresa.company_alias,
    })
    assert.lengthOf(sozinha, 1, 'antes do recibo, a operação é um documento só')

    const recibo = await repo.confirmarRecebimento({
      id: factura.id,
      company_alias: empresa.company_alias,
    })

    const pelaFactura = await repo.documentosDaOperacao({
      id: factura.id,
      company_alias: empresa.company_alias,
    })
    assert.sameMembers(
      pelaFactura.map((d) => d.id),
      [factura.id, recibo.id]
    )

    /*
     * O mesmo conjunto, entrando pelo outro lado. Se este falhar, a procura só
     * anda para baixo — e quem abrir o recibo imprime um papel que não diz o que
     * está a liquidar.
     */
    const peloRecibo = await repo.documentosDaOperacao({
      id: recibo.id,
      company_alias: empresa.company_alias,
    })
    assert.sameMembers(
      peloRecibo.map((d) => d.id),
      [factura.id, recibo.id]
    )
  })

  test('o adiantamento e o documento da entrega vêm juntos', async ({ assert }) => {
    const { empresa, user, venda } = await vendaComItem({ comCliente: true })
    await pagarVenda(venda, 2000)

    const vendasRepo = new VendasRepository()
    await vendasRepo.close({
      id: venda.id,
      user_id: user.id,
      company_alias: empresa.company_alias,
      condicao_pagamento: 'adiantamento',
    })

    const adiantamento = await documentoDa(venda.id)
    await vendasRepo.entregar({
      id: venda.id,
      user_id: user.id,
      company_alias: empresa.company_alias,
    })

    /*
     * Estes dois NÃO se apontam um ao outro — ligam-se pela venda. É por isso que
     * a procura tem de seguir as duas ligações: só pela corrente de origens, a
     * entrega ficava de fora.
     */
    const conjunto = await new FacturaRepository().documentosDaOperacao({
      id: adiantamento.id,
      company_alias: empresa.company_alias,
    })

    /*
     * Três, e não dois: a entrega anula o adiantamento com uma nota de crédito
     * antes de titular a operação — senão a venda ficava com dois documentos pelo
     * valor inteiro e valia o dobro na soma dos documentos.
     */
    assert.lengthOf(conjunto, 3)
    assert.include(
      conjunto.map((d) => d.id),
      adiantamento.id
    )
  })

  test('vem por ordem de emissão — é a ordem em que a operação aconteceu', async ({ assert }) => {
    const { empresa, user, venda } = await vendaComItem({ comCliente: true })

    await new VendasRepository().close({
      id: venda.id,
      user_id: user.id,
      company_alias: empresa.company_alias,
      condicao_pagamento: 'credito',
    })

    const factura = await documentoDa(venda.id)
    const repo = new FacturaRepository()
    await repo.confirmarRecebimento({ id: factura.id, company_alias: empresa.company_alias })

    const conjunto = await repo.documentosDaOperacao({
      id: factura.id,
      company_alias: empresa.company_alias,
    })

    assert.equal(conjunto[0].tipo, 'Factura')
    assert.equal(conjunto[1].tipo, 'Recibo')
  })
})

/**
 * Quem emitiu cada documento.
 *
 * ── O que estava errado ──────────────────────────────────────────────────────
 *
 * O responsável de um documento resolvia-se por `venda → caixa → user`. Isso
 * responde bem em três tipos — os que nascem de uma venda — e em mais nenhum: uma
 * nota de crédito, um recibo, uma nota de débito e um aviso de cobrança ligam-se a
 * OUTRO documento, não a uma venda, e apareciam na lista com o responsável a
 * traço. São precisamente os documentos em que saber quem assinou mais importa:
 * uma nota de crédito justifica dinheiro a sair da caixa.
 *
 * `emitido_por_user_id` é gravado no acto, por todos os caminhos de emissão.
 */
test.group('quem emitiu o documento', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('o documento da venda fica assinado por quem a fechou', async ({ assert }) => {
    const { empresa, user, venda } = await vendaComItem()
    await pagarVenda(venda, 2000)

    await new VendasRepository().close({
      id: venda.id,
      user_id: user.id,
      company_alias: empresa.company_alias,
    })

    const documento = await documentoDa(venda.id)
    assert.equal(documento.emitido_por_user_id, user.id)
  })

  test('o recibo fica assinado por quem confirmou o recebimento', async ({ assert }) => {
    const { empresa, user, venda } = await vendaComItem({ comCliente: true })

    await new VendasRepository().close({
      id: venda.id,
      user_id: user.id,
      company_alias: empresa.company_alias,
      condicao_pagamento: 'credito',
    })

    const factura = await documentoDa(venda.id)

    /*
     * Um utilizador DIFERENTE de propósito: quem vende e quem recebe raramente são
     * a mesma pessoa, e é essa a distinção que a coluna existe para guardar. Com o
     * mesmo utilizador nos dois, o teste passaria mesmo que o recibo herdasse o
     * vendedor da factura.
     */
    const { user: tesoureiro } = await createTenant()

    const recibo = await new FacturaRepository().confirmarRecebimento({
      id: factura.id,
      company_alias: empresa.company_alias,
      emitido_por_user_id: tesoureiro.id,
    })

    assert.equal(recibo.emitido_por_user_id, tesoureiro.id)
    assert.notEqual(recibo.emitido_por_user_id, factura.emitido_por_user_id)
  })

  test('a nota de débito fica assinada por quem ajustou a venda', async ({ assert }) => {
    const { empresa, user, venda } = await vendaComItem()
    await pagarVenda(venda, 2000)

    const repo = new VendasRepository()
    await repo.close({ id: venda.id, user_id: user.id, company_alias: empresa.company_alias })

    const nota = await repo.ajustar({
      id: venda.id,
      user_id: user.id,
      company_alias: empresa.company_alias,
      valor: 500,
      motivo: 'Serviço adicional.',
    })

    assert.equal(nota.tipo, 'Nota de Débito')
    assert.equal(nota.emitido_por_user_id, user.id)
  })

  /*
   * O caso em que NÃO há pessoa, e é legítimo: a varredura diária de avisos de
   * cobrança corre sem sessão. Pôr lá o nome de alguém seria assinar em nome de
   * quem não praticou o acto — quem lê mostra "Sistema".
   */
  test('o aviso de cobrança automático não tem emissor', async ({ assert }) => {
    const { empresa, user, venda } = await vendaComItem({ comCliente: true })

    await new VendasRepository().close({
      id: venda.id,
      user_id: user.id,
      company_alias: empresa.company_alias,
      condicao_pagamento: 'credito',
      prazo_pagamento_dias: 1,
    })

    const factura = await documentoDa(venda.id)

    /*
     * Pela VARREDURA, e não por uma emissão à mão: é esse o caminho que não tem
     * sessão, e é a ausência de sessão que este teste guarda. Emitir à mão sem
     * passar o utilizador provaria só que o campo aceita nulo.
     *
     * `hoje` uma semana depois do vencimento, para o documento já estar vencido.
     */
    const depoisDoPrazo = DateTime.fromJSDate(factura.data_vencimento!.toJSDate()).plus({ days: 7 })

    const resultado = await new AvisoCobrancaRepository().emitirDevidos({
      company_alias: empresa.company_alias,
      hoje: depoisDoPrazo,
    })

    assert.lengthOf(resultado.emitidos, 1)

    const aviso = await Factura.query()
      .where('documento_origem_id', factura.id)
      .where('tipo', 'Aviso de Cobrança')
      .firstOrFail()

    assert.isNull(aviso.emitido_por_user_id, 'ninguém o emitiu — nasceu de um prazo que passou')
  })
})

/**
 * A entrega anula o adiantamento antes de titular a operação.
 *
 * ── O que estava errado ──────────────────────────────────────────────────────
 *
 * A entrega emitia a factura final e deixava a factura de adiantamento de pé ao
 * lado dela. Uma venda de 1.000 Kz ficava com DOIS documentos de 1.000 Kz — o
 * cliente com dois papéis a dizer, cada um, o valor todo, e a operação a valer o
 * dobro na soma dos documentos.
 *
 * Não aparecia nas contas por acidente: os relatórios contam por venda, não por
 * documento. Numa exportação para a AGT — que lê documentos — contaria.
 */
test.group('a entrega de um adiantamento não duplica o valor', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  async function entregue() {
    const { empresa, user, venda } = await vendaComItem({ comCliente: true })
    await pagarVenda(venda, 2000)

    const repo = new VendasRepository()
    await repo.close({
      id: venda.id,
      user_id: user.id,
      company_alias: empresa.company_alias,
      condicao_pagamento: 'adiantamento',
    })

    const adiantamento = await documentoDa(venda.id)
    await repo.entregar({ id: venda.id, user_id: user.id, company_alias: empresa.company_alias })

    const todos = await new FacturaRepository().documentosDaOperacao({
      id: adiantamento.id,
      company_alias: empresa.company_alias,
    })

    /*
     * A venda RELIDA: o total só é calculado no fecho, e o objecto em memória
     * ainda traz o zero com que foi criada. Comparar contra ele daria um teste que
     * passa por comparar zero com zero.
     */
    const vendaFinal = await Vendas.findOrFail(venda.id)

    return { empresa, venda: vendaFinal, adiantamento, todos }
  }

  test('a operação fica com três documentos: adiantamento, nota de crédito e factura', async ({
    assert,
  }) => {
    const { todos } = await entregue()

    assert.sameMembers(
      todos.map((d) => d.tipo),
      ['Factura de Adiantamento', 'Nota de Crédito', 'Factura-Recibo']
    )
  })

  /*
   * A conta que interessa: somados os documentos que ACRESCENTAM, menos os que
   * creditam, a operação vale o que a venda vale — e não o dobro.
   */
  test('o valor líquido dos documentos é o valor da venda', async ({ assert }) => {
    const { venda, todos } = await entregue()

    const liquido = todos.reduce(
      (soma, d) => soma + (d.tipo === 'Nota de Crédito' ? -Number(d.total) : Number(d.total)),
      0
    )

    assert.equal(liquido, Number(venda.total))
  })

  test('a nota de crédito aponta ao adiantamento, e pelo valor exacto', async ({ assert }) => {
    const { adiantamento, todos } = await entregue()

    const nota = todos.find((d) => d.tipo === 'Nota de Crédito')!
    assert.equal(nota.documento_origem_id, adiantamento.id)
    assert.equal(Number(nota.total), Number(adiantamento.total))
  })

  /*
   * A factura final tem de sair pelo valor INTEIRO — é ela que titula a operação
   * agora que o adiantamento foi anulado. Sair pelo remanescente (zero) deixaria a
   * operação sem nenhum documento a declarar o que foi vendido.
   */
  test('a factura da entrega titula o valor inteiro da venda', async ({ assert }) => {
    const { venda, todos } = await entregue()

    const factura = todos.find((d) => d.tipo === 'Factura-Recibo')!
    assert.equal(Number(factura.total), Number(venda.total))
    assert.equal(factura.venda_id, venda.id)
  })
})
