import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import Caixa from '#models/caixa'
import Vendas from '#models/faturacao/vendas'
import CaixaRepository from '#repositories/caixa_repository'
import VendasRepository from '#repositories/vendas_repository'
import FechoDiarioRepository from '#repositories/fecho_diario_repository'
import {
  createTenant,
  createUser,
  createPos,
  createCaixa,
  createVenda,
} from '../helpers/fixtures.js'

/**
 * Rede de segurança para a caixa que fica aberta de um dia para o outro.
 *
 * O fecho ao fim do dia (`node ace caixa:fechar-diario`) é um trabalho externo — se não
 * correr, a caixa de ontem continua aberta e a primeira venda de hoje colava-se a ela:
 * os totais de hoje entravam no dia de ontem. Pior, o utilizador ficava sem saída — a
 * caixa de ontem não podia fechar (tinha uma venda por concluir) e abrir uma nova era
 * recusado com "já tem uma caixa aberta".
 *
 * Por isso o mesmo fecho — com anulação das vendas por concluir — corre também nos dois
 * momentos em que o utilizador volta a mexer na caixa: ao tentar registar uma venda, e ao
 * abrir uma caixa. Nunca abre nada sozinho: a caixa nova é sempre aberta pelo
 * utilizador, que é quem sabe o posto de atendimento e o valor inicial.
 */
test.group('caixa deixada aberta de um dia anterior', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  /** Empurra a caixa para ontem — `created_at` é o que decide se é "de um dia anterior". */
  async function recuarParaOntem(caixa: Caixa) {
    const ontem = DateTime.now().startOf('day').minus({ hours: 3 })
    await db
      .from('caixa')
      .where('id', caixa.id)
      .update({ created_at: ontem.toSQL({ includeOffset: false }) })
  }

  test('tentar vender fecha a caixa de ontem, anula a venda por concluir e exige caixa nova', async ({
    assert,
  }) => {
    const { empresa, user, pos } = await createTenant()
    const caixaDeOntem = await createCaixa(user, pos, { status: 'Aberto', valor_inicial: 500 })
    await recuarParaOntem(caixaDeOntem)
    const porConcluir = await createVenda(caixaDeOntem)

    let erro: any
    try {
      await new VendasRepository().create({
        venda_tipo: 'presencial',
        company_alias: empresa.company_alias,
        user_id: user.id,
      })
    } catch (e) {
      erro = e
    }

    assert.equal(
      erro?.code,
      'CAIXA_DIA_ANTERIOR_FECHADA',
      'a venda não pode seguir para a caixa de ontem — e a razão tem de ser a certa'
    )

    const depois = await Caixa.findOrFail(caixaDeOntem.id)
    assert.equal(depois.status.toLowerCase(), 'fechado')
    assert.isNotNull(depois.data_fecho)

    const vendaDepois = await Vendas.findOrFail(porConcluir.id)
    assert.equal(vendaDepois.status, 'cancelada')
    assert.include(vendaDepois.motivo_cancelamento ?? '', 'dia anterior')

    const vendasDaCaixa = await Vendas.query().where('caixa_id', caixaDeOntem.id)
    assert.lengthOf(vendasDaCaixa, 1, 'nenhuma venda de hoje foi criada na caixa de ontem')
  })

  test('a caixa aberta hoje não é tocada', async ({ assert }) => {
    const { user, pos } = await createTenant()
    const caixaDeHoje = await createCaixa(user, pos, { status: 'Aberto' })

    const resumo = await new FechoDiarioRepository().fecharCaixasDeDiasAnteriores(user.id)

    assert.equal(resumo.caixasFechadas, 0)
    const depois = await Caixa.findOrFail(caixaDeHoje.id)
    assert.equal(depois.status.toLowerCase(), 'aberto')
  })

  test('só fecha as caixas do próprio utilizador', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const colega = await createUser(empresa, ['Admin'])
    const caixaDoColega = await createCaixa(colega, pos, { status: 'Aberto' })
    await recuarParaOntem(caixaDoColega)

    const resumo = await new FechoDiarioRepository().fecharCaixasDeDiasAnteriores(user.id)

    assert.equal(resumo.caixasFechadas, 0)
    const depois = await Caixa.findOrFail(caixaDoColega.id)
    assert.equal(
      depois.status.toLowerCase(),
      'aberto',
      'a caixa de outro operador não é dele para fechar'
    )
  })

  test('abrir a caixa de hoje fecha primeiro a que ficou aberta de ontem', async ({ assert }) => {
    const { empresa, user, pos } = await createTenant()
    const caixaDeOntem = await createCaixa(user, pos, { status: 'Aberto', valor_inicial: 500 })
    await recuarParaOntem(caixaDeOntem)
    const porConcluir = await createVenda(caixaDeOntem)

    // Sem a rede de segurança isto rebentava com CaixaAlreadyOpenException e o operador
    // ficava sem forma de começar o dia.
    const nova = await new CaixaRepository().open({
      pos_id: pos.id,
      user_id: user.id,
      company_alias: empresa.company_alias,
      valor_inicial: 100,
    })

    assert.notEqual(nova.id, caixaDeOntem.id, 'a caixa de hoje é nova, não a de ontem reaberta')
    assert.equal(nova.status.toLocaleLowerCase(), 'aberto')
    assert.equal(Number(nova.valor_inicial), 100)

    const ontemDepois = await Caixa.findOrFail(caixaDeOntem.id)
    assert.equal(ontemDepois.status.toLowerCase(), 'fechado')

    const vendaDepois = await Vendas.findOrFail(porConcluir.id)
    assert.equal(vendaDepois.status, 'cancelada')
  })

  test('sem caixa nenhuma, o erro continua a ser o de sempre', async ({ assert }) => {
    const { empresa, user } = await createTenant()
    await createPos(empresa)

    let erro: any
    try {
      await new VendasRepository().create({
        venda_tipo: 'presencial',
        company_alias: empresa.company_alias,
        user_id: user.id,
      })
    } catch (e) {
      erro = e
    }

    assert.equal(erro?.code, 'USER_HAS_NO_OPEN_CAIXA')
  })
})
