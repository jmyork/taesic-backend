import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import ActivityLog from '#models/activity_log'
import { registarActividade, diferencas, redigir, REDIGIDO } from '../../app/helpers/activity_logger.js'
import ActivityLogMiddleware from '#middleware/activity_log_middleware'
import HttpExceptionHandler from '#exceptions/handler'
import { Exception } from '@adonisjs/core/exceptions'
import { createEmpresa, createUser } from '../helpers/fixtures.js'

/**
 * Espera pela escrita de auditoria.
 *
 * `registarActividade()` é fire-and-forget de propósito (nunca deve atrasar o pedido
 * que a originou), portanto não há promessa nenhuma para o teste esperar. Isto sonda
 * a tabela em vez de dormir um valor fixo — um `setTimeout` arbitrário ou torna o
 * teste lento ou torna-o intermitente, conforme a máquina.
 */
async function esperarLinha(
  filtro: (q: ReturnType<typeof ActivityLog.query>) => void,
  tentativas = 40
) {
  for (let i = 0; i < tentativas; i++) {
    const q = ActivityLog.query()
    filtro(q)
    const linha = await q.first()
    if (linha) return linha
    await new Promise((r) => setTimeout(r, 25))
  }
  return null
}

test.group('auditoria — diferencas()', () => {
  test('devolve só os campos que mudaram', async ({ assert }) => {
    const d = diferencas(
      { nome: 'Antigo', preco: 100, descricao: 'igual' },
      { nome: 'Novo', preco: 100, descricao: 'igual' }
    )

    assert.deepEqual(d, { antes: { nome: 'Antigo' }, depois: { nome: 'Novo' } })
  })

  test('devolve null quando nada mudou', async ({ assert }) => {
    assert.isNull(diferencas({ a: 1, b: 'x' }, { a: 1, b: 'x' }))
  })

  test('não marca alteração entre 100 e "100"', async ({ assert }) => {
    // O mysql2 devolve decimais como TEXTO e booleanos como 0/1, enquanto o que vem
    // do pedido é number/boolean. Sem os pôr na mesma forma antes de comparar, cada
    // gravação de um preço aparecia como uma alteração que nunca aconteceu.
    assert.isNull(diferencas({ preco: 100 }, { preco: '100' } as any))
  })

  test('não marca alteração entre true e 1', async ({ assert }) => {
    // Uma coluna `tinyint(1)` volta do driver como 0/1, não como true/false. É a
    // mesma armadilha que o CLAUDE.md regista três vezes (`is_service`,
    // `regime_iva`, `disponivel`).
    assert.isNull(diferencas({ ativo: true }, { ativo: 1 } as any))
    assert.isNotNull(diferencas({ ativo: true }, { ativo: 0 } as any))
  })

  test('NUNCA regista campos sensíveis, nem quando mudam', async ({ assert }) => {
    const d = diferencas(
      { nome: 'A', password: 'antiga', access_token: 'tok1', iban: 'AO06...' },
      { nome: 'B', password: 'nova', access_token: 'tok2', iban: 'AO07...' }
    )

    assert.deepEqual(Object.keys(d!.depois), ['nome'])
    const texto = JSON.stringify(d)
    assert.notInclude(texto, 'nova')
    assert.notInclude(texto, 'tok2')
    assert.notInclude(texto, 'AO07')
  })

  test('trunca valores muito grandes em vez de os guardar inteiros', async ({ assert }) => {
    const d = diferencas({ nota: 'x' }, { nota: 'y'.repeat(5000) })
    assert.isBelow(String(d!.depois.nota).length, 600)
    assert.include(String(d!.depois.nota), 'truncado')
  })
})

test.group('auditoria — o que fica gravado', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('regista uma acção e encontra-a pela empresa', async ({ assert }) => {
    const empresa = await createEmpresa()
    const subjectId = randomUUID()

    registarActividade({
      action: 'domain_produtos.update',
      subject_type: 'produtos',
      subject_id: subjectId,
      empresa_id: empresa.id,
      changes: { antes: { preco: 100 }, depois: { preco: 150 } },
    })

    const linha = await esperarLinha((q) => q.where('subject_id', subjectId))

    assert.isNotNull(linha)
    assert.equal(linha!.action, 'domain_produtos.update')
    assert.equal(linha!.empresa_id, empresa.id)
    assert.deepEqual(linha!.changes, { antes: { preco: 100 }, depois: { preco: 150 } })
  })

  test('uma descrição maior do que a coluna é cortada, não perdida', async ({ assert }) => {
    // O caso real: o `report()` do handler global põe o stack trace no `description`,
    // e a coluna tem 500. Com `STRICT_TRANS_TABLES` o motor recusaria a linha inteira
    // (erro 1406) — e, sendo a escrita fire-and-forget, o registo do erro 500
    // desaparecia em silêncio, que é precisamente quando mais faz falta.
    const empresa = await createEmpresa()
    const subjectId = randomUUID()

    registarActividade({
      action: 'error',
      subject_type: 'excepcao',
      subject_id: subjectId,
      empresa_id: empresa.id,
      description: 'TypeError: x is not a function\n    at algures\n'.repeat(200),
    })

    const linha = await esperarLinha((q) => q.where('subject_id', subjectId))

    assert.isNotNull(linha)
    assert.isAtMost(linha!.description!.length, 500)
    assert.include(linha!.description!, 'TypeError')
  })

  test('cada linha fica marcada com a empresa a que pertence', async ({ assert }) => {
    // A consulta vive no `taesic-backoffice-api`, e é lá que se testa o filtro. O que
    // ESTE lado tem de garantir é que a linha nasce com a empresa certa — sem isso,
    // nenhum filtro do outro lado consegue separar o rasto de dois clientes.
    const empresaA = await createEmpresa()
    const empresaB = await createEmpresa()

    registarActividade({ action: 'so.da.A', empresa_id: empresaA.id, subject_id: 'marca-a' })
    registarActividade({ action: 'so.da.B', empresa_id: empresaB.id, subject_id: 'marca-b' })

    const a = await esperarLinha((q) => q.where('subject_id', 'marca-a'))
    const b = await esperarLinha((q) => q.where('subject_id', 'marca-b'))

    assert.equal(a!.empresa_id, empresaA.id)
    assert.equal(b!.empresa_id, empresaB.id)
    assert.notEqual(a!.empresa_id, b!.empresa_id)
  })

  test('o actor vem da sessão autenticada e não do que se passa a mais', async ({ assert }) => {
    const empresa = await createEmpresa()
    const user = await createUser(empresa)
    const subjectId = randomUUID()

    // Sem `ctx`, o actor é o que vier em `entrada` — é este o caminho dos comandos
    // ace e das rotinas automáticas, que não têm sessão nenhuma.
    registarActividade({
      action: 'rotina.automatica',
      subject_id: subjectId,
      empresa_id: empresa.id,
      user_id: user.id,
      user_email: user.email,
    })

    const linha = await esperarLinha((q) => q.where('subject_id', subjectId))

    assert.equal(linha!.user_id, user.id)
    assert.equal(linha!.user_email, user.email)
  })

  test('o email do actor sobrevive ao apagar do utilizador', async ({ assert }) => {
    // `user_id` não tem chave estrangeira de propósito: o registo tem de sobreviver
    // ao registo que descreve. Isto prova que a linha continua legível — é o email
    // guardado na altura que responde "quem foi?" quando o id já não resolve.
    const empresa = await createEmpresa()
    const subjectId = randomUUID()
    const idQueNaoExiste = randomUUID()

    registarActividade({
      action: 'domain_produtos.destroy',
      subject_id: subjectId,
      empresa_id: empresa.id,
      user_id: idQueNaoExiste,
      user_email: 'quem.saiu@exemplo.pt',
    })

    const linha = await esperarLinha((q) => q.where('subject_id', subjectId))

    assert.equal(linha!.user_id, idQueNaoExiste)
    assert.equal(linha!.user_email, 'quem.saiu@exemplo.pt')
  })

  test('duas acções no MESMO segundo ficam ordenáveis pelo id', async ({ assert }) => {
    // A razão de o `id` ser sequencial e não um UUID. `created_at` é `TIMESTAMP`, com
    // precisão de segundo: as duas linhas abaixo nascem com a mesma data, e ordenar
    // por ela deixaria sem resposta a pergunta que se faz a uma auditoria — o que
    // veio primeiro. Quem consulta (o `taesic-backoffice-api`) ordena por `id`.
    const empresa = await createEmpresa()
    const produtoId = randomUUID()

    registarActividade({
      action: 'domain_produtos.store',
      subject_type: 'produtos',
      subject_id: produtoId,
      empresa_id: empresa.id,
    })
    const primeira = await esperarLinha((q) =>
      q.where('subject_id', produtoId).where('action', 'domain_produtos.store')
    )

    registarActividade({
      action: 'domain_produtos.update',
      subject_type: 'produtos',
      subject_id: produtoId,
      empresa_id: empresa.id,
      changes: { antes: { preco: 100 }, depois: { preco: 150 } },
    })
    const segunda = await esperarLinha((q) =>
      q.where('subject_id', produtoId).where('action', 'domain_produtos.update')
    )

    assert.isAbove(Number(segunda!.id), Number(primeira!.id))

    const historico = await ActivityLog.query()
      .where('subject_id', produtoId)
      .orderBy('id', 'desc')

    assert.lengthOf(historico, 2)
    assert.equal(historico[0].action, 'domain_produtos.update')
    assert.deepEqual(historico[0].changes, { antes: { preco: 100 }, depois: { preco: 150 } })
  })
})

/**
 * O middleware é o que dá cobertura ao sistema INTEIRO sem nenhum controller saber
 * que ele existe. Se parar de funcionar, nada falha visivelmente — as rotas
 * continuam a responder, só deixa de haver rasto. É o género de peça que só se
 * descobre partida quando é precisa, portanto tem rede.
 */
test.group('auditoria — o middleware', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  async function correr(metodo: string, opcoes: { rota?: string; params?: any; estado?: number } = {}) {
    const ctx = await testUtils.createHttpContext()
    ctx.request.request.method = metodo
    if (opcoes.rota) ctx.route = { name: opcoes.rota } as any
    if (opcoes.params) ctx.params = opcoes.params
    ctx.response.status(opcoes.estado ?? 200)

    let seguiu = false
    await new ActivityLogMiddleware().handle(ctx, async () => {
      seguiu = true
    })
    return { seguiu }
  }

  test('um GET TAMBÉM fica registado — "todas as rotas chamadas"', async ({ assert }) => {
    // A primeira versão registava só o que escreve, para não encher a tabela de ruído.
    // O dono do produto quer o rasto completo, e é essa a decisão: em `completo` (o
    // valor por omissão de `AUDITORIA_CAPTURA`) uma leitura deixa linha como qualquer
    // outra chamada. Quem quiser o comportamento antigo põe `escritas` no `.env`.
    const id = randomUUID()
    const { seguiu } = await correr('GET', { rota: 'domain_produtos.index', params: { id } })
    assert.isTrue(seguiu)

    const linha = await esperarLinha((q) => q.where('subject_id', id))

    assert.isNotNull(linha, 'um GET tem de deixar linha em modo completo')
    assert.equal(linha!.method, 'GET')
    assert.equal(linha!.action, 'domain_produtos.index')
  })

  test('regista quanto tempo o pedido demorou', async ({ assert }) => {
    // É a coluna que transforma o registo num sítio onde se responde a "o que estava
    // lento ontem às 15h?".
    const id = randomUUID()
    await correr('POST', { rota: 'domain_produtos.store', params: { id }, estado: 201 })

    const linha = await esperarLinha((q) => q.where('subject_id', id))
    assert.isNumber(linha!.duration_ms)
    assert.isAtLeast(linha!.duration_ms!, 0)
  })

  test('um POST fica registado com a rota, o método e o estado', async ({ assert }) => {
    const id = randomUUID()
    await correr('POST', { rota: 'domain_produtos.store', params: { id }, estado: 201 })

    const linha = await esperarLinha((q) => q.where('subject_id', id))

    assert.isNotNull(linha)
    assert.equal(linha!.action, 'domain_produtos.store')
    assert.equal(linha!.subject_type, 'produtos')
    assert.equal(linha!.method, 'POST')
    assert.equal(linha!.status_code, 201)
  })

  test('uma tentativa RECUSADA também fica registada', async ({ assert }) => {
    // É metade do valor de uma auditoria: um 403 repetido é o sinal de que alguém
    // anda a bater numa porta que não é dele.
    const id = randomUUID()
    await correr('DELETE', { rota: 'domain_produtos.destroy', params: { id }, estado: 403 })

    const linha = await esperarLinha((q) => q.where('subject_id', id))

    assert.equal(linha!.status_code, 403)
    assert.include(linha!.description!, 'recusado')
  })

  test('o recurso sai do nome da rota, sem o prefixo de âmbito', async ({ assert }) => {
    const id = randomUUID()
    await correr('PUT', { rota: 'domain_venda_itens.update', params: { id } })

    const linha = await esperarLinha((q) => q.where('subject_id', id))
    assert.equal(linha!.subject_type, 'venda_itens')
  })
})

/**
 * O `report()` do handler global é o único sítio por onde passam TODAS as excepções
 * que chegam ao topo, venham de que caminho vierem. É por isso que a captura de
 * erros vive lá e não num try/catch — um try/catch cobre o que alguém se lembrou de
 * envolver.
 */
test.group('auditoria — erros não tratados', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  async function reportar(erro: unknown) {
    const ctx = await testUtils.createHttpContext()
    const handler = new HttpExceptionHandler()
    // `super.report()` escreve no logger; o que se testa aqui é o efeito lateral
    // em `activity_logs`, não o que sai no stdout.
    await handler.report(erro, ctx)
  }

  test('um erro inesperado fica registado com a mensagem e o stack', async ({ assert }) => {
    const marca = `marca-${randomUUID()}`
    await reportar(new TypeError(`x is not a function :: ${marca}`))

    const linha = await esperarLinha((q) =>
      q.where('action', 'error').where('description', 'like', `%${marca}%`)
    )

    assert.isNotNull(linha)
    assert.equal(linha!.subject_type, 'excepcao')
    assert.equal(linha!.status_code, 500)
    assert.include(linha!.description!, 'TypeError')
  })

  test('uma excepção de NEGÓCIO não é registada como erro', async ({ assert }) => {
    // `LimiteDoPlano`, `CaixaAlreadyOpen`, `E_ROW_NOT_FOUND` e os erros de validação
    // são o sistema a dizer "não pode" — não são avarias. Registá-los aqui enterraria
    // os 500 a sério debaixo de ruído, que é o que se vem cá procurar.
    const marca = `negocio-${randomUUID()}`
    const excepcao = new Exception(`nao pode :: ${marca}`, { status: 400, code: 'E_TESTE' })

    await reportar(excepcao)
    await new Promise((r) => setTimeout(r, 150))

    const linha = await ActivityLog.query()
      .where('action', 'error')
      .where('description', 'like', `%${marca}%`)
      .first()

    assert.isNull(linha)
  })

  test('um erro de validação do VineJS também não conta como avaria', async ({ assert }) => {
    const marca = `validacao-${randomUUID()}`
    await reportar({ messages: [{ field: 'nome', message: marca }] })
    await new Promise((r) => setTimeout(r, 150))

    const linha = await ActivityLog.query()
      .where('action', 'error')
      .where('description', 'like', `%${marca}%`)
      .first()

    assert.isNull(linha)
  })
})

/**
 * A redacção — a peça que torna seguro guardar corpos de pedido e de resposta.
 *
 * Sem ela, `activity_logs` passaria a ser o sítio mais perigoso da base de dados:
 * consultável no backoffice, sobrevive ao apagar dos dados que descreve, e teria as
 * palavras-passe e as sessões de toda a gente.
 */
test.group('auditoria — redigir()', () => {
  test('apaga campos sensíveis a qualquer profundidade', async ({ assert }) => {
    const r = redigir({
      nome: 'visível',
      password: 'segredo',
      dados: { user: { password_confirmation: 'segredo', access_token: 'abc' } },
      lista: [{ senha_actual: 'segredo' }],
    }) as any

    assert.equal(r.nome, 'visível')
    assert.equal(r.password, REDIGIDO)
    assert.equal(r.dados.user.password_confirmation, REDIGIDO)
    assert.equal(r.dados.user.access_token, REDIGIDO)
    assert.equal(r.lista[0].senha_actual, REDIGIDO)
    assert.notInclude(JSON.stringify(r), 'segredo')
  })

  test('apaga um token pelo VALOR, mesmo num campo com nome inocente', async ({ assert }) => {
    // O caso real, e a razão de a redacção por nome não chegar: a resposta de
    // `POST auth/login` devolve o token num campo chamado `value`. Nenhuma lista de
    // nomes razoável apanha "value", e redigir todos os campos com esse nome apagaria
    // metade dos dados legítimos. O registo guardava SESSÕES UTILIZÁVEIS.
    const r = redigir({
      data: { type: 'bearer', value: 'oat_MTE.QjNiSzZlNVA1ckYzaFd4SEhLQUg2a3pROWVBaUJvOGF3' },
    }) as any

    assert.equal(r.data.value, REDIGIDO)
    assert.notInclude(JSON.stringify(r), 'oat_')
  })

  test('apaga "Bearer ..." e JWT onde quer que apareçam', async ({ assert }) => {
    const r = redigir({
      mensagem: 'falhou com Authorization: Bearer abcdefghijklmnop no pedido',
      outro: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N',
    }) as any

    assert.notInclude(JSON.stringify(r), 'abcdefghijklmnop')
    assert.notInclude(JSON.stringify(r), 'eyJhbGciOi')
  })

  test('serializa um model do Lucid em vez de guardar as entranhas dele', async ({ assert }) => {
    // `ctx.response.getBody()` devolve o objecto que o controller pôs na resposta, que
    // muitas vezes é um model. Sem serializar, a coluna ficava com
    // `transactionListener`, `$attributes` e `fillInvoked` — não com o JSON que o
    // cliente recebeu, que é o que "saída" quer dizer.
    const falso = {
      $attributes: { nome: 'x' },
      transactionListener: () => {},
      serialize: () => ({ nome: 'Marca', id: 'abc' }),
    }

    assert.deepEqual(redigir({ data: falso }), { data: { nome: 'Marca', id: 'abc' } })
  })

  test('sobrevive a uma referência circular', async ({ assert }) => {
    // A escrita é fire-and-forget: um `JSON.stringify` a rebentar aqui fazia a linha
    // desaparecer em silêncio.
    const a: Record<string, unknown> = { nome: 'a' }
    a.proprio = a

    assert.doesNotThrow(() => redigir(a))
    assert.include(JSON.stringify(redigir(a)), 'circular')
  })

  test('corta listas longas e marca o que ficou de fora', async ({ assert }) => {
    const r = redigir({ itens: Array.from({ length: 300 }, (_, i) => ({ i })) }) as any
    assert.lengthOf(r.itens, 51)
    assert.include(String(r.itens[50]), 'mais 250')
  })

  test('trunca o que passa do tecto, e o corte também é redigido', async ({ assert }) => {
    const r = redigir({
      recheio: 'x'.repeat(20_000),
      token: 'oat_AAAAAAAAAAAAAAAAAAAA',
    }) as any

    assert.isTrue(r._truncado)
    assert.notInclude(JSON.stringify(r), 'oat_A')
  })

  test('devolve null quando não há nada que guardar', async ({ assert }) => {
    assert.isNull(redigir(null))
    assert.isNull(redigir(undefined))
    assert.isNull(redigir({}))
  })
})

/**
 * A poda do registo. Com a captura completa (cada chamada deixa linha), sem isto o
 * crescimento é indefinido e o primeiro sintoma é o disco do servidor.
 */
test.group('auditoria — poda por retenção', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  const inserir = (accao: string, quando: Date) =>
    db.table('activity_logs').insert({ action: accao, method: 'GET', status_code: 200, created_at: quando })

  test('apaga o que é antigo e NÃO toca no que é recente', async ({ assert }) => {
    // O teste que apanhou o defeito. A poda limita-se por `id` para ser rápida, e o
    // limite é "o maior id anterior ao corte" — o que só equivale a "tudo o que é
    // antigo" enquanto a ordem dos ids acompanhar a das datas. Aqui as linhas ANTIGAS
    // são inseridas DEPOIS das recentes, portanto têm ids mais altos: sem a condição
    // de data no DELETE, a poda levava as recentes à frente.
    const hoje = new Date()
    const antigo = new Date(Date.now() - 200 * 24 * 3600 * 1000)

    await inserir('recente.a', hoje)
    await inserir('recente.b', hoje)
    for (let i = 0; i < 5; i++) await inserir('antigo', antigo)

    const corte = new Date(Date.now() - 90 * 24 * 3600 * 1000)
    const limite = await db.from('activity_logs').where('created_at', '<', corte).max('id as maximo').first()

    await db
      .from('activity_logs')
      .where('id', '<=', Number(limite?.maximo ?? 0))
      .where('created_at', '<', corte)
      .delete()

    const restantes = await db.from('activity_logs').select('action')
    const accoes = restantes.map((r: { action: string }) => r.action)

    assert.notInclude(accoes, 'antigo', 'as antigas deviam ter sido apagadas')
    assert.include(accoes, 'recente.a', 'as recentes NÃO podem ser apagadas')
    assert.include(accoes, 'recente.b')
  })
})
