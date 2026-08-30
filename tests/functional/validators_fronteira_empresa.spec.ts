import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { createcaixaValidator, updatecaixaValidator } from '#validators/caixa_validator'
import { createclienteValidator, updateclienteValidator } from '#validators/cliente_validator'
import { updateproduto_mediaValidator } from '#validators/produto_media_validator'
import { createpessoaValidator, updatepessoaValidator } from '#validators/pessoa_validator'
import { createEmpresa, createUser, createProduto } from '../helpers/fixtures.js'
import Cliente from '#models/cliente'

/**
 * As CHAVES ESTRANGEIRAS também têm de respeitar a fronteira da empresa.
 *
 * O isolamento multi-tenant deste backend estava metade feito, e a metade em
 * falta não se via a ler um controlador. `tenant_isolation.spec.ts` cobre a
 * metade que existia: `findOrFail(id, companyAlias)` garante que o RECURSO
 * actualizado é da empresa de quem faz o pedido.
 *
 * Este ficheiro cobre a outra: os IDS ESCRITOS PARA DENTRO desse recurso.
 * Vários validadores confirmavam apenas que a linha apontada existia — em
 * qualquer sítio da base de dados:
 *
 *     .exists(async (db, value, __) => {
 *       const exists = await db.from('user').where('id', value).first()
 *       return !!exists
 *     })
 *
 * O `__` no terceiro parâmetro é o sintoma: é o `FieldContext`, o único sítio de
 * onde vem o `company_alias` da rota, e estava explicitamente ignorado.
 *
 * Nenhum destes casos é um furo de autenticação — o atacante entra pela porta,
 * com uma conta verdadeira da empresa dele. É o que a OWASP chama BOLA: a
 * autorização ao nível do objecto, que a autenticação não substitui.
 *
 * CLAUDE.md §7.14 já tinha deixado isto assinalado em aberto, com o
 * `produto_media_validator` nomeado como exemplo.
 *
 * NOTA SOBRE OS TESTES DE ACEITAÇÃO (os "aceita ... da PRÓPRIA empresa"): são
 * eles que impedem a correcção de ser um `return false`. Uma regra que recusa
 * tudo passa todos os testes de rejeição e parte o produto.
 */
test.group('Validadores — a fronteira da empresa nas chaves estrangeiras', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  /**
   * `POST api/:alias/caixas` com o `user_id` de um funcionário de outra empresa.
   * A caixa nascia na nossa empresa, registada em nome de alguém que não é nosso.
   */
  test('caixa: rejeita um user_id de OUTRA empresa', async ({ assert }) => {
    const empresaA = await createEmpresa()
    const empresaB = await createEmpresa()
    const utilizadorDeB = await createUser(empresaB)

    await assert.rejects(() =>
      createcaixaValidator.validate({
        user_id: utilizadorDeB.id,
        data_abertura: '2026-01-01T08:00:00.000Z',
        data_fecho: '2026-01-01T18:00:00.000Z',
        valor_inicial: 0,
        total_vendas: 0,
        status: 'Aberto',
        observacoes: 'tentativa cross-tenant',
        total_caixa: 0,
        params: { company_alias: empresaA.company_alias },
      })
    )
  })

  test('caixa: aceita um user_id da PRÓPRIA empresa', async ({ assert }) => {
    const empresa = await createEmpresa()
    const utilizador = await createUser(empresa)

    const validado = await createcaixaValidator.validate({
      user_id: utilizador.id,
      data_abertura: '2026-01-01T08:00:00.000Z',
      data_fecho: '2026-01-01T18:00:00.000Z',
      valor_inicial: 0,
      total_vendas: 0,
      status: 'Aberto',
      observacoes: 'normal',
      total_caixa: 0,
      params: { company_alias: empresa.company_alias },
    })

    assert.equal(validado.user_id, utilizador.id)
  })

  test('caixa (update): rejeita um user_id de OUTRA empresa', async ({ assert }) => {
    const empresaA = await createEmpresa()
    const empresaB = await createEmpresa()
    const utilizadorDeB = await createUser(empresaB)

    await assert.rejects(() =>
      updatecaixaValidator.validate({
        user_id: utilizadorDeB.id,
        params: { company_alias: empresaA.company_alias },
      })
    )
  })

  /**
   * O pior dos casos, porque não fica pela escrita: `cliente_pai` é uma relação
   * LIDA de volta (`belongsTo` em app/models/cliente.ts, filtro
   * `cliente.cliente_pai_id` em cliente_repository.ts). Apontá-la ao cliente de
   * outra empresa transformava uma escrita cross-tenant numa LEITURA
   * cross-tenant da ficha de um concorrente, servida pela nossa própria API.
   */
  test('cliente: rejeita um cliente_pai_id de OUTRA empresa', async ({ assert }) => {
    const empresaA = await createEmpresa()
    const empresaB = await createEmpresa()

    const clienteDeB = await Cliente.create({
      nome: 'Cliente da empresa B',
      empresa_id: empresaB.id,
    } as any)

    await assert.rejects(() =>
      createclienteValidator.validate({
        // `tipo` e `nome` são os dois campos obrigatórios deste validador. Têm de
        // vir preenchidos e VÁLIDOS, senão o pedido é recusado por causa deles e
        // o teste passa sem nunca ter exercitado a fronteira de empresa.
        tipo: 'Pessoa Jurídica',
        nome: 'Filial nossa',
        cliente_pai_id: clienteDeB.id,
        params: { company_alias: empresaA.company_alias },
      })
    )
  })

  test('cliente: aceita um cliente_pai_id da PRÓPRIA empresa', async ({ assert }) => {
    const empresa = await createEmpresa()

    const clienteMae = await Cliente.create({
      nome: 'Cliente sede',
      empresa_id: empresa.id,
    } as any)

    const validado = await createclienteValidator.validate({
      tipo: 'Pessoa Jurídica',
      nome: 'Filial',
      cliente_pai_id: clienteMae.id,
      params: { company_alias: empresa.company_alias },
    })

    assert.equal(validado.cliente_pai_id, clienteMae.id)
  })

  test('cliente (update): rejeita um cliente_pai_id de OUTRA empresa', async ({ assert }) => {
    const empresaA = await createEmpresa()
    const empresaB = await createEmpresa()

    const clienteDeB = await Cliente.create({
      nome: 'Cliente da empresa B',
      empresa_id: empresaB.id,
    } as any)

    await assert.rejects(() =>
      updateclienteValidator.validate({
        cliente_pai_id: clienteDeB.id,
        params: { company_alias: empresaA.company_alias },
      })
    )
  })

  /**
   * O caso nomeado em CLAUDE.md §7.14. O validador de CREATE já cruzava com
   * `empresa.company_alias`; o de UPDATE não cruzava com nada — `PUT
   * produto-medias/:id` com o `produto_id` de outra empresa passava a validação
   * e o `r.merge(data)` do repositório gravava-o.
   */
  test('produto_media (update): rejeita um produto_id de OUTRA empresa', async ({ assert }) => {
    const empresaA = await createEmpresa()
    const empresaB = await createEmpresa()
    const produtoDeB = await createProduto(empresaB)

    await assert.rejects(() =>
      updateproduto_mediaValidator.validate({
        produto_id: produtoDeB.id,
        params: { company_alias: empresaA.company_alias },
      })
    )
  })

  test('produto_media (update): aceita um produto_id da PRÓPRIA empresa', async ({ assert }) => {
    const empresa = await createEmpresa()
    const produto = await createProduto(empresa)

    const validado = await updateproduto_mediaValidator.validate({
      produto_id: produto.id,
      params: { company_alias: empresa.company_alias },
    })

    assert.equal(validado.produto_id, produto.id)
  })

  /**
   * `pessoa` é recurso de inquilino (`router.resource('pessoa', ...)` sob
   * `api/:company_alias`). Mesma falha do `caixa.user_id`, e passou ao lado da
   * primeira passagem desta auditoria — só apareceu ao varrer o repositório
   * inteiro por `exists(async (db, value, __)`, que é a assinatura do defeito.
   */
  test('pessoa: rejeita um user_id de OUTRA empresa', async ({ assert }) => {
    const empresaA = await createEmpresa()
    const empresaB = await createEmpresa()
    const utilizadorDeB = await createUser(empresaB)

    await assert.rejects(() =>
      createpessoaValidator.validate({
        nome: 'Pessoa nossa',
        tipo: 'Funcionario',
        user_id: utilizadorDeB.id,
        params: { company_alias: empresaA.company_alias },
      })
    )
  })

  test('pessoa: aceita um user_id da PRÓPRIA empresa', async ({ assert }) => {
    const empresa = await createEmpresa()
    const utilizador = await createUser(empresa)

    const validado = await createpessoaValidator.validate({
      nome: 'Pessoa nossa',
      tipo: 'Funcionario',
      user_id: utilizador.id,
      params: { company_alias: empresa.company_alias },
    })

    assert.equal(validado.user_id, utilizador.id)
  })

  test('pessoa (update): rejeita um user_id de OUTRA empresa', async ({ assert }) => {
    const empresaA = await createEmpresa()
    const empresaB = await createEmpresa()
    const utilizadorDeB = await createUser(empresaB)

    await assert.rejects(() =>
      updatepessoaValidator.validate({
        user_id: utilizadorDeB.id,
        params: { company_alias: empresaA.company_alias },
      })
    )
  })

  /**
   * Falha fechada. Sem `company_alias` no contexto, a regra recusa — nunca
   * aceita, e nunca corre sem filtro. Todas as rotas afectadas vivem sob
   * `.prefix('api/:company_alias')` com `ValidateCompanyAliasMiddleware`
   * (start/companydomainroutes.ts), portanto o alias está sempre lá; se um dia
   * deixar de estar, o sintoma tem de ser uma validação que recusa e não um
   * vazamento silencioso.
   */
  test('sem company_alias no contexto, a regra recusa em vez de deixar passar', async ({
    assert,
  }) => {
    const empresa = await createEmpresa()
    const utilizador = await createUser(empresa)

    await assert.rejects(() =>
      updatecaixaValidator.validate({
        user_id: utilizador.id,
        // sem `params` de propósito
      })
    )
  })
})
