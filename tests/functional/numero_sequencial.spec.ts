import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import ProdutosRepository from '#repositories/produtos_repository'
import VendasRepository from '#repositories/vendas_repository'
import CaixaRepository from '#repositories/caixa_repository'
import { createTenant } from '../helpers/fixtures.js'

/**
 * `numero` — número sequencial por empresa (nunca global), distinto do `id` (UUID).
 * Mesmo mecanismo já usado em factura_repository.ts (ver factura_repository.spec.ts):
 * dentro de db.transaction(), bloqueia a linha da própria empresa (FOR UPDATE) antes
 * de calcular MAX(numero)+1 — duas empresas diferentes nunca se bloqueiam uma à outra.
 * Extraído para app/helpers/sequencial_numero.ts (proximoNumeroPorEmpresa) e aplicado
 * a produtos, cliente, pessoa, cupom, despesas, caixa e vendas.
 */
test.group('numero — sequencial por empresa', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('produtos: numeração começa em 1 por empresa, nunca partilhada entre empresas', async ({ assert }) => {
    const tenantA = await createTenant()
    const tenantB = await createTenant()

    const repo = new ProdutosRepository()
    const a1 = await repo.create({
      nome: 'Produto A1',
      descricao: '',
      is_service: false,
      company_alias: tenantA.empresa.company_alias,
    } as any)
    const a2 = await repo.create({
      nome: 'Produto A2',
      descricao: '',
      is_service: false,
      company_alias: tenantA.empresa.company_alias,
    } as any)
    const b1 = await repo.create({
      nome: 'Produto B1',
      descricao: '',
      is_service: false,
      company_alias: tenantB.empresa.company_alias,
    } as any)

    assert.equal(a1.numero, 1)
    assert.equal(a2.numero, 2)
    assert.equal(b1.numero, 1, 'a empresa B tem a sua própria sequência, começa em 1 mesmo depois da empresa A já ter criado produtos')
  })

  // Nota sobre a limitação deste teste: ver o comentário equivalente em
  // factura_repository.spec.ts — dentro de withGlobalTransaction() ambas as chamadas
  // partilham a mesma ligação, por isso isto não prova lock real entre ligações
  // concorrentes (isso depende de SELECT ... FOR UPDATE do MySQL); prova que cada
  // chamada recalcula o próximo número a partir do estado actual, nunca reutiliza um
  // valor pré-calculado.
  test('produtos: duas criações concorrentes para a mesma empresa nunca geram o mesmo número', async ({ assert }) => {
    const { empresa } = await createTenant()
    const repo = new ProdutosRepository()

    const [p1, p2] = await Promise.all([
      repo.create({ nome: 'X', descricao: '', is_service: false, company_alias: empresa.company_alias } as any),
      repo.create({ nome: 'Y', descricao: '', is_service: false, company_alias: empresa.company_alias } as any),
    ])

    assert.notEqual(p1.numero, p2.numero)
    assert.sameDeepMembers([p1.numero, p2.numero], [1, 2])
  })

  test('vendas: numeração por empresa, resolvida via caixa.empresa_id (por sua vez via user.empresa_id)', async ({ assert }) => {
    const tenantA = await createTenant()
    const tenantB = await createTenant()

    const caixaRepo = new CaixaRepository()
    const vendasRepo = new VendasRepository()

    // Usa caixa_repository.open() a sério (não o fixture createCaixa(), que cria a
    // linha directamente sem empresa_id/numero) — só open() resolve e preenche esses
    // dois campos via user.empresa_id.
    const caixaAAberta = await caixaRepo.open({ user_id: tenantA.user.id, pos_id: tenantA.pos.id, company_alias: tenantA.empresa.company_alias, valor_inicial: 0 } as any)
    const caixaBAberta = await caixaRepo.open({ user_id: tenantB.user.id, pos_id: tenantB.pos.id, company_alias: tenantB.empresa.company_alias, valor_inicial: 0 } as any)

    assert.isNotNull(caixaAAberta.empresa_id, 'caixa_repository.open() tem de preencher empresa_id via user.empresa_id')
    assert.equal(caixaAAberta.numero, 1)
    assert.equal(caixaBAberta.numero, 1, 'caixa: cada empresa começa a sua própria sequência em 1')

    const vendaA1 = await vendasRepo.create({ company_alias: tenantA.empresa.company_alias, user_id: tenantA.user.id, venda_tipo: 'presencial' })
    const vendaA2 = await vendasRepo.create({ company_alias: tenantA.empresa.company_alias, user_id: tenantA.user.id, venda_tipo: 'presencial', proforma: true })
    const vendaB1 = await vendasRepo.create({ company_alias: tenantB.empresa.company_alias, user_id: tenantB.user.id, venda_tipo: 'presencial' })

    assert.equal(vendaA1.empresa_id, tenantA.empresa.id)
    assert.equal(vendaA1.numero, 1)
    assert.equal(vendaA2.numero, 2, 'proforma também recebe numero — só não bloqueia/é bloqueada pela regra de venda aberta')
    assert.equal(vendaB1.numero, 1, 'vendas: cada empresa começa a sua própria sequência em 1, independente de caixa/user')
  })
})
