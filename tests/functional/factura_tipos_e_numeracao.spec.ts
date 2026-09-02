import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import FacturaRepository from '#repositories/factura_repository'
import DocumentoDeOrigemInvalidoException from '#exceptions/documento_de_origem_invalido_exception'
import PeriodoDeFacturacaoInvalidoException from '#exceptions/periodo_de_facturacao_invalido_exception'
import ValorDoDocumentoEmFaltaException from '#exceptions/valor_do_documento_em_falta_exception'
import VendaObrigatoriaException from '#exceptions/venda_obrigatoria_exception'
import Factura from '#models/faturacao/factura'
import {
  TIPOS_DE_DOCUMENTO,
  TIPOS_DE_DOCUMENTO_VALIDOS,
} from '../../app/helpers/tipos_de_documento.js'
import { createTenant, createCaixa, createVenda } from '../helpers/fixtures.js'

/**
 * O período do MÊS CORRENTE.
 *
 * As vendas de teste nascem agora, e a regra 7 exige que caiam dentro do período
 * declarado pela factura global. Um período fixo fazia estes testes passarem no
 * mês em que foram escritos e falharem no resto do ano.
 */
const periodoDeHoje = () => ({
  periodo_inicio: DateTime.now().startOf('month').toJSDate(),
  periodo_fim: DateTime.now().toJSDate(),
})

/**
 * A emissão dos documentos do Decreto Presidencial 71/25, e a numeração que ele
 * exige.
 *
 * Fica num ficheiro à parte de `factura_repository.spec.ts` de propósito: aquele
 * cobre o que a emissão já fazia antes e continua a valer palavra por palavra
 * (uma empresa tem a sua própria sequência, uma venda tem de estar fechada, o
 * nome do cliente é copiado no momento). Este cobre o que passou a existir.
 */
test.group('factura — tipos e numeração por série', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  /**
   * O art.º 10.º exige numeração «sequencial e cronológica por tipo de documento».
   *
   * Antes desta passagem havia UMA sequência por empresa, partilhada: emitir uma
   * factura e depois uma nota de crédito dava `FT 1` e `NC 2` — a série das
   * facturas com um buraco no 2, a das notas a começar no 2.
   */
  test('cada tipo de documento tem a sua própria sequência', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    const venda1 = await createVenda(caixa, { status: 'fechada', total: 1000 })
    const venda2 = await createVenda(caixa, { status: 'fechada', total: 2000 })

    const repo = new FacturaRepository()

    const factura1 = await repo.emitir({
      venda_id: venda1.id,
      tipo: 'Factura',
      company_alias: empresa.company_alias,
    })

    const nota = await repo.emitir({
      tipo: 'Nota de Crédito',
      documento_origem_id: factura1.id,
      total: 500,
      company_alias: empresa.company_alias,
    })

    const factura2 = await repo.emitir({
      venda_id: venda2.id,
      tipo: 'Factura',
      company_alias: empresa.company_alias,
    })

    assert.equal(factura1.numero, 1)
    assert.equal(
      nota.numero,
      1,
      'a nota de crédito abre a sua própria série e começa no 1, não continua a das facturas'
    )
    assert.equal(
      factura2.numero,
      2,
      'a série das facturas segue para o 2 — a nota de crédito não lhe consumiu o número'
    )
  })

  test('a série e o ano ficam gravados, e a referência identifica o documento', async ({
    assert,
  }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    const venda = await createVenda(caixa, { status: 'fechada', total: 1000 })

    const emitida = await new FacturaRepository().emitir({
      venda_id: venda.id,
      tipo: 'Factura-Recibo',
      company_alias: empresa.company_alias,
    })

    const ano = DateTime.now().year

    assert.equal(emitida.serie, `FR${ano}`)
    assert.equal(emitida.ano, ano)
    assert.equal(emitida.codigo_documento, 'FR')
    assert.equal(emitida.designacao, 'Factura-Recibo')
    assert.equal(emitida.referencia, `FR FR${ano}/1`)
  })

  /**
   * `Factura` e `Factura Genérica` são dois tipos internos com o mesmo código da
   * AGT (`FT`) e, por isso, a mesma série. Têm de PARTILHAR o contador: contados
   * em separado, os dois primeiros documentos sairiam ambos como `FT FT<ano>/1` —
   * o mesmo `documentNo` para dois documentos diferentes.
   */
  test('tipos que partilham a série partilham o contador', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    const venda1 = await createVenda(caixa, { status: 'fechada', total: 1000 })
    const venda2 = await createVenda(caixa, { status: 'fechada', total: 2000 })

    const repo = new FacturaRepository()

    const normal = await repo.emitir({
      venda_id: venda1.id,
      tipo: 'Factura',
      company_alias: empresa.company_alias,
    })

    const generica = await repo.emitir({
      venda_id: venda2.id,
      tipo: 'Factura Genérica',
      company_alias: empresa.company_alias,
    })

    assert.equal(normal.serie, generica.serie)
    assert.equal(normal.numero, 1)
    assert.equal(generica.numero, 2, 'partilham a série, portanto partilham a sequência')
    assert.notEqual(normal.referencia, generica.referencia)
  })

  test('uma série indicada à mão é respeitada e conta em separado', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    const venda1 = await createVenda(caixa, { status: 'fechada', total: 1000 })
    const venda2 = await createVenda(caixa, { status: 'fechada', total: 2000 })

    const repo = new FacturaRepository()

    const padrao = await repo.emitir({
      venda_id: venda1.id,
      tipo: 'Factura',
      company_alias: empresa.company_alias,
    })

    const outra = await repo.emitir({
      venda_id: venda2.id,
      tipo: 'Factura',
      serie: 'LOJA2A2026',
      company_alias: empresa.company_alias,
    })

    assert.equal(padrao.numero, 1)
    assert.equal(outra.numero, 1, 'outra série é outro livro, e começa no 1')
    assert.equal(outra.serie, 'LOJA2A2026')
  })
})

test.group('factura — os doze tipos chegam à base de dados', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  /**
   * Emite um de CADA tipo e relê-o.
   *
   * Não é redundante face aos testes acima, que exercitam sete tipos: o que este
   * prova é que TODOS os valores da tabela cabem no `enum` da coluna. Vários têm
   * acentos — `Autofacturação`, `Factura Genérica`, `Aviso de Cobrança` — e um
   * desencontro de charset entre a coluna e a ligação não dá erro de compilação
   * nem falha nos unitários: dá `ER_DATA_TRUNCATED` na emissão, em produção, com
   * o utilizador à espera. Só uma escrita real o apanha.
   *
   * A contagem no fim vem de `TIPOS_DE_DOCUMENTO_VALIDOS` e já não é um número
   * escrito à mão: um tipo acrescentado ou removido da tabela passa a ser coberto
   * por este teste sozinho, em vez de o partir com uma contagem desactualizada.
   */
  test('cada tipo é emitido e relido com a designação certa', async ({
    assert,
  }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    const repo = new FacturaRepository()

    /*
     * Cada tipo que exige origem leva uma factura SÓ SUA.
     *
     * Partilhar uma origem entre todos falharia — e bem: as regras de emissão não
     * deixam dois recibos sobre o mesmo documento, nem cobrar o que já foi pago.
     * Este teste é sobre o `enum` da coluna aguentar os catorze valores, não sobre
     * as regras; dar a cada um o seu contexto válido é o que o mantém a testar
     * aquilo para que existe.
     */
    /*
     * A origem leva data de vencimento, e passou a ser obrigatório que leve.
     *
     * O recibo e o aviso de cobrança só se emitem sobre um documento EM DÍVIDA — e
     * a dívida lê-se da `data_vencimento`, não do tipo (ver `estaEmDivida()`). Uma
     * factura sem prazo é uma factura paga no acto, e um recibo sobre ela seria
     * receber duas vezes no papel.
     */
    const origemNova = async () => {
      const v = await createVenda(caixa, { status: 'fechada', total: 5000 })
      return repo.emitir({
        venda_id: v.id,
        tipo: 'Factura',
        data_vencimento: DateTime.now().plus({ days: 30 }).toJSDate(),
        company_alias: empresa.company_alias,
      })
    }

    const emitidos: Record<string, string> = {}

    for (const tipo of TIPOS_DE_DOCUMENTO_VALIDOS) {
      const definicao = TIPOS_DE_DOCUMENTO[tipo]

      const venda = definicao.exigeVenda
        ? await createVenda(caixa, { status: 'fechada', total: 1000 })
        : null

      const origem = definicao.exigeOrigem ? await origemNova() : null

      // A factura global cobre VÁRIAS vendas, e o total sai da soma delas.
      const cobertas = definicao.exigeVendas
        ? [await createVenda(caixa, { status: 'fechada', total: 1000 })]
        : []

      const emitido = await repo.emitir({
        tipo,
        company_alias: empresa.company_alias,
        ...(definicao.vencimento === 'exige'
          ? { data_vencimento: DateTime.now().plus({ days: 30 }).toJSDate() }
          : {}),
        ...(venda ? { venda_id: venda.id } : { total: 1000 }),
        ...(cobertas.length > 0 ? { vendas_ids: cobertas.map((v) => v.id) } : {}),
        ...(origem ? { documento_origem_id: origem.id } : {}),
        ...(definicao.exigePeriodo ? periodoDeHoje() : {}),
      })

      // Relido da base, e não o objecto que ficou em memória: é a leitura que
      // prova que o valor sobreviveu à ida ao MySQL sem ser truncado.
      const relido = await Factura.findOrFail(emitido.id)

      assert.equal(relido.tipo, tipo, `"${tipo}" não sobreviveu à escrita`)
      assert.equal(relido.designacao, definicao.designacao)
      assert.equal(relido.codigo_documento, definicao.codigo)
      assert.isNotNull(relido.referencia)

      emitidos[tipo] = relido.referencia!
    }

    assert.lengthOf(Object.keys(emitidos), TIPOS_DE_DOCUMENTO_VALIDOS.length)

    /*
     * Nenhuma referência repetida — é a garantia que o índice único protege, e a
     * razão pela qual `Factura` e `Factura Genérica` (que partilham a série `FT`)
     * têm de partilhar também o contador.
     */
    const referencias = Object.values(emitidos)
    assert.lengthOf(new Set(referencias), referencias.length, 'há referências repetidas')
  })
})

test.group('factura — o que cada tipo exige', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  /**
   * Recibos, notas e facturas de adiantamento não nascem de uma venda — a coluna
   * `venda_id` passou a ser anulável exactamente por isso.
   */
  test('emite um documento sem venda, com o valor indicado', async ({ assert }) => {
    const { empresa } = await createTenant()

    const emitida = await new FacturaRepository().emitir({
      tipo: 'Factura de Adiantamento',
      total: 7500,
      company_alias: empresa.company_alias,
    })

    assert.isNull(emitida.venda_id)
    assert.equal(Number(emitida.total), 7500)
    assert.equal(emitida.designacao, 'Factura de Adiantamento')
  })

  test('recusa um documento sem venda e sem valor', async ({ assert }) => {
    const { empresa } = await createTenant()

    try {
      await new FacturaRepository().emitir({
        tipo: 'Factura de Adiantamento',
        company_alias: empresa.company_alias,
      })
      assert.fail('deveria ter recusado: não há de onde tirar o valor')
    } catch (error) {
      assert.instanceOf(error, ValorDoDocumentoEmFaltaException)
    }
  })

  /**
   * As duas segundas defesas do repositório.
   *
   * O validator já recusa um pedido sem estes campos (regra 7.20), mas o
   * repositório é chamável directamente — e era: `relatorios_repository.spec.ts`
   * emitia uma nota de crédito sem origem e rebentava com «.where expects value to
   * be defined», um 500 do Lucid que não diz que campo falta.
   */
  test('recusa um documento que exige venda quando nenhuma é indicada', async ({ assert }) => {
    const { empresa } = await createTenant()

    try {
      await new FacturaRepository().emitir({
        tipo: 'Factura',
        company_alias: empresa.company_alias,
      })
      assert.fail('deveria ter recusado: uma factura emite-se a partir de uma venda')
    } catch (error) {
      assert.instanceOf(error, VendaObrigatoriaException)
    }
  })

  test('recusa uma nota de crédito que não diz o que rectifica', async ({ assert }) => {
    const { empresa } = await createTenant()

    try {
      await new FacturaRepository().emitir({
        tipo: 'Nota de Crédito',
        total: 500,
        company_alias: empresa.company_alias,
      })
      assert.fail('deveria ter recusado: a AGT recusa uma NC sem origem com E13')
    } catch (error) {
      assert.instanceOf(error, DocumentoDeOrigemInvalidoException)
    }
  })

  /**
   * A fronteira da empresa no documento de origem. Sem ela, uma nota de crédito
   * podia rectificar a factura de outro contribuinte — o id é um UUID e não
   * denuncia de quem é.
   */
  test('não deixa rectificar a factura de outra empresa', async ({ assert }) => {
    const tenantA = await createTenant()
    const tenantB = await createTenant()

    const caixaA = await createCaixa(tenantA.user, tenantA.pos)
    const vendaA = await createVenda(caixaA, { status: 'fechada', total: 1000 })

    const repo = new FacturaRepository()
    const facturaDeA = await repo.emitir({
      venda_id: vendaA.id,
      tipo: 'Factura',
      company_alias: tenantA.empresa.company_alias,
    })

    try {
      await repo.emitir({
        tipo: 'Nota de Crédito',
        documento_origem_id: facturaDeA.id,
        total: 500,
        company_alias: tenantB.empresa.company_alias,
      })
      assert.fail('deveria ter recusado: a factura de origem é de outra empresa')
    } catch (error) {
      assert.instanceOf(error, DocumentoDeOrigemInvalidoException)
    }
  })

  test('não deixa rectificar uma factura anulada', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    const venda = await createVenda(caixa, { status: 'fechada', total: 1000 })

    const repo = new FacturaRepository()
    const factura = await repo.emitir({
      venda_id: venda.id,
      tipo: 'Factura',
      company_alias: empresa.company_alias,
    })
    await repo.anular({ id: factura.id, company_alias: empresa.company_alias, motivo_anulacao: 'I' })

    try {
      await repo.emitir({
        tipo: 'Nota de Crédito',
        documento_origem_id: factura.id,
        total: 500,
        company_alias: empresa.company_alias,
      })
      assert.fail('deveria ter recusado: o documento anulado já não produz efeitos')
    } catch (error) {
      assert.instanceOf(error, DocumentoDeOrigemInvalidoException)
    }
  })

  /** O art.º 8.º limita a periodicidade da factura global a mensal. */
  test('recusa uma factura global com período superior a um mês', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    const coberta = await createVenda(caixa, { status: 'fechada', total: 50000 })

    try {
      await new FacturaRepository().emitir({
        tipo: 'Factura Global',
        vendas_ids: [coberta.id],
        periodo_inicio: new Date('2026-01-01'),
        periodo_fim: new Date('2026-03-31'),
        company_alias: empresa.company_alias,
      })
      assert.fail('deveria ter recusado: três meses excedem a periodicidade mensal')
    } catch (error) {
      assert.instanceOf(error, PeriodoDeFacturacaoInvalidoException)
    }
  })

  test('aceita uma factura global de um mês', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    const coberta = await createVenda(caixa, { status: 'fechada', total: 50000 })

    const emitida = await new FacturaRepository().emitir({
      tipo: 'Factura Global',
      vendas_ids: [coberta.id],
      ...periodoDeHoje(),
      company_alias: empresa.company_alias,
    })

    assert.equal(emitida.designacao, 'Factura Global')
    assert.isNotNull(emitida.periodo_inicio)
    assert.isNotNull(emitida.periodo_fim)
  })

  /**
   * Um recibo é do mesmo cliente que a factura que liquida. Copiar o adquirente
   * da origem evita pedir duas vezes o que já se sabe — e evita as duas versões
   * divergirem.
   */
  test('o recibo herda o adquirente do documento que liquida', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    const venda = await createVenda(caixa, { status: 'fechada', total: 1000 })

    const repo = new FacturaRepository()
    const factura = await repo.emitir({
      venda_id: venda.id,
      tipo: 'Factura',
      // Uma factura só se liquida com recibo se nasceu em dívida — ver `estaEmDivida()`.
      data_vencimento: DateTime.now().plus({ days: 30 }).toJSDate(),
      cliente_morada: 'Rua Rainha Ginga, 12, Luanda',
      company_alias: empresa.company_alias,
    })

    const recibo = await repo.emitir({
      tipo: 'Recibo',
      documento_origem_id: factura.id,
      total: 1000,
      company_alias: empresa.company_alias,
    })

    assert.equal(recibo.documento_origem_id, factura.id)
    assert.equal(recibo.cliente_nome, factura.cliente_nome)
    assert.equal(recibo.cliente_nif, factura.cliente_nif)
    assert.equal(recibo.designacao, 'Recibo')
  })

  /**
   * O motivo da anulação fica gravado.
   *
   * É o único momento em que alguém o sabe. Sem ele, o documento anulado fica
   * impossível de comunicar à AGT: o `documentCancelReason` é obrigatório quando
   * `documentStatus = 'A'`, e o mapeamento recusa-se a montar o envelope sem ele.
   */
  test('anular grava o motivo, e o mapeamento para a AGT consegue lê-lo', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    const venda = await createVenda(caixa, { status: 'fechada', total: 1000 })

    const repo = new FacturaRepository()
    const factura = await repo.emitir({
      venda_id: venda.id,
      tipo: 'Factura',
      company_alias: empresa.company_alias,
    })

    const anulada = await repo.anular({
      id: factura.id,
      company_alias: empresa.company_alias,
      motivo_anulacao: 'N',
    })

    assert.equal(anulada.status, 'anulada')
    assert.equal(anulada.motivo_anulacao, 'N')

    // Relido da base: o valor tem de ter sobrevivido à escrita, e não ficar só
    // no objecto em memória.
    const relida = await Factura.findOrFail(factura.id)
    assert.equal(relida.motivo_anulacao, 'N')
  })

  /** Art.º 10.º: data, hora e local da operação. */
  test('grava a data e o local da operação', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const caixa = await createCaixa(user, pos)
    const venda = await createVenda(caixa, { status: 'fechada', total: 1000 })

    const emitida = await new FacturaRepository().emitir({
      venda_id: venda.id,
      tipo: 'Factura',
      company_alias: empresa.company_alias,
    })

    assert.isNotNull(emitida.data_operacao, 'a hora da operação é exigida pelo art.º 10.º')
    assert.isNotNull(emitida.local_operacao, 'o local da operação é exigido pelo art.º 10.º')
  })
})
