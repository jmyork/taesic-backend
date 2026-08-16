import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import CaixaRepository from '#repositories/caixa_repository'
import VendasRepository from '#repositories/vendas_repository'
import VendaItensRepository from '#repositories/venda_itens_repository'
import UserPos from '#models/userpos'
import { createTenant, createUser, createProduto, createLote, pagarVenda } from '../helpers/fixtures.js'
import { userHasPermission } from '../../app/helpers/Utils.js'

/**
 * Um vendedor tem de conseguir levar uma venda até ao fim — sozinho.
 *
 * Desde que `vendas_repository.close()` passou a exigir pelo menos um `vendapagamento`
 * cuja soma bate certo com o total (secção 7.4 do CLAUDE.md), registar o pagamento deixou
 * de ser opcional: é um passo obrigatório do fluxo. Mas o catálogo de permissões (mantido
 * à mão em `database_seeder.ts`) nunca foi actualizado — `domain_vendapagamento.*` ficou
 * só no Admin. Resultado: `POST venda-pagamento` devolvia 403 ("Unauthorized Operation")
 * ao Vendedor/Gerente/Supervisor e, sem pagamento registado, `POST vendas/fechar/:id`
 * rebentava a seguir com `VendaSemPagamentoException`. Nenhum destes papéis conseguia
 * fechar uma única venda.
 *
 * O teste percorre TODOS os nomes de rota do fluxo (é por nome de rota que o
 * `permission_middleware` decide) para cada papel que vende — a única forma de apanhar
 * uma lacuna destas sem exercitar o fluxo inteiro por HTTP.
 */

/** Cada passo de uma venda, do abrir da caixa à factura, pelo nome de rota. */
const FLUXO_DE_VENDA = [
  { passo: 'ver os pos onde trabalha', rota: 'domain_pos.meu' },
  { passo: 'ver as suas caixas', rota: 'domain_caixa.my' },
  { passo: 'abrir a caixa', rota: 'domain_caixas.store' },
  { passo: 'consultar o catálogo de produtos', rota: 'domain_produtos.catalogo' },
  { passo: 'abrir a venda', rota: 'domain_vendas.store' },
  { passo: 'juntar itens à venda', rota: 'domain_vendas_itens.store' },
  { passo: 'listar os métodos de pagamento', rota: 'domain_metodo_pagamento.index' },
  { passo: 'registar o pagamento', rota: 'domain_vendapagamento.store' },
  { passo: 'ver os pagamentos da venda', rota: 'domain_vendapagamento.index' },
  { passo: 'fechar a venda', rota: 'domain_vendas.destroy' },
  { passo: 'emitir a factura', rota: 'domain_facturas.store' },
  { passo: 'fechar a caixa', rota: 'domain_caixas.destroy' },
]

test.group('RBAC — quem vende consegue mesmo fechar uma venda', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  for (const papel of ['Vendedor', 'Gerente', 'Supervisor', 'Admin']) {
    test(`${papel} tem todas as permissões do fluxo de venda`, async ({ assert }) => {
      const { empresa } = await createTenant()
      const utilizador = await createUser(empresa, [papel])

      const emFalta: string[] = []
      for (const { passo, rota } of FLUXO_DE_VENDA) {
        if (!(await userHasPermission(utilizador, rota))) {
          emFalta.push(`${rota} (${passo})`)
        }
      }

      assert.deepEqual(emFalta, [], `${papel} não consegue completar uma venda — falta-lhe: ${emFalta.join(', ')}`)
    })
  }

  /**
   * O mesmo passo visto do lado do negócio: é o pagamento que decide se a venda fecha.
   * Confirma que o bloqueio era mesmo de permissão (o repositório não verifica permissões)
   * e que, registado o pagamento, o fluxo do vendedor corre até ao fim.
   */
  test('sem pagamento a venda não fecha; com pagamento, fecha', async ({ assert }) => {
    const { empresa, pos } = await createTenant()
    const companyAlias = empresa.company_alias
    const vendedor = await createUser(empresa, ['Vendedor'])

    const produto = await createProduto(empresa)
    const lote = await createLote(produto, { quantidade_em_estoque: 10, preco_venda: 500 })

    // `caixa_repository.open()` só deixa abrir caixa a quem está associado ao POS
    // (`userpos`) — só o Admin passa sem isso. Um vendedor sem esta associação é o OUTRO
    // motivo por que "não consegue vender", mas com erro diferente
    // (`UserIsNotAPosWorkerException`, não 403 de permissão).
    await UserPos.create({ user_id: vendedor.id, pos_id: pos.id })

    const caixaRepo = new CaixaRepository()
    await caixaRepo.open({ pos_id: pos.id, user_id: vendedor.id, company_alias: companyAlias, valor_inicial: 0 })

    const vendasRepo = new VendasRepository()
    const venda = await vendasRepo.create({
      company_alias: companyAlias,
      user_id: vendedor.id,
      venda_tipo: 'presencial',
    } as any)

    await new VendaItensRepository().create({
      venda_id: venda.id,
      lote_produto_id: lote.id,
      quantidade: 2,
      company_alias: companyAlias,
    } as any)

    // Exactamente o que o vendedor via: sem poder registar o pagamento, o fecho rejeita.
    await assert.rejects(() =>
      vendasRepo.close({ id: venda.id, user_id: vendedor.id, company_alias: companyAlias })
    )

    await pagarVenda(venda, 1000)
    const fechada = await vendasRepo.close({
      id: venda.id,
      user_id: vendedor.id,
      company_alias: companyAlias,
    })
    assert.equal(fechada.status, 'fechada')
  })
})
