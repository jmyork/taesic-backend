import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import NifRepository from '#repositories/nif_repository'
import NifConsulta from '#models/nif_consulta'
import { createTenant, createUser } from '../helpers/fixtures.js'
import { userHasPermission } from '../../app/helpers/Utils.js'

/**
 * Consulta de NIF via o serviço externo `bknkv-utils-api-resources` (um scraper
 * Playwright do portal do Minfin, 4-14s por consulta — e observado a demorar 2 minutos
 * quando o NIF não existe).
 *
 * `fetch` é simulado em todos os testes: a suite nunca pode depender de um portal do
 * Estado estar de pé, nem pagar segundos de scraping por teste.
 */

const RESPOSTA_BKNKV = {
  found: true,
  message: 'Consulta realizada com sucesso.',
  data: {
    NIF: '5002889978',
    Nome: 'BKNKV - COMÉRCIO E PRESTAÇÃO DE SERVIÇOS, LDA',
    Tipo: 'COLECTIVO - Empresa',
    Estado: 'Activo',
    Inadimplente: 'Não',
    'Regime de IVA': 'Sem actividade em IVA (Não factura IVA)',
  },
}

/** Substitui global.fetch e conta as chamadas. Devolve um restaurador. */
function simularFetch(resposta: { ok?: boolean; status?: number; corpo?: any; erro?: Error }) {
  const original = globalThis.fetch
  const estado = { chamadas: 0, ultimoUrl: '' }

  globalThis.fetch = (async (url: any) => {
    estado.chamadas++
    estado.ultimoUrl = String(url)
    if (resposta.erro) throw resposta.erro
    return {
      ok: resposta.ok ?? true,
      status: resposta.status ?? 200,
      json: async () => resposta.corpo,
    } as any
  }) as any

  return { estado, restaurar: () => { globalThis.fetch = original } }
}

test.group('consulta de NIF — cache e resiliência', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('consulta bem sucedida guarda em cache e deriva o tipo de cliente', async ({ assert }) => {
    const { estado, restaurar } = simularFetch({ corpo: RESPOSTA_BKNKV })
    try {
      const repo = new NifRepository()
      const r = await repo.consultar('5002889978')

      assert.isTrue(r.found)
      assert.isTrue(r.disponivel)
      assert.isFalse(r.cached)
      assert.equal(r.data?.nome, 'BKNKV - COMÉRCIO E PRESTAÇÃO DE SERVIÇOS, LDA')
      assert.equal(r.data?.regime_iva, 'Sem actividade em IVA (Não factura IVA)')
      // "COLECTIVO - Empresa" tem de mapear para o enum de cliente.tipo.
      assert.equal(r.data?.tipo_cliente, 'Pessoa Jurídica')
      assert.equal(estado.chamadas, 1)

      const guardado = await NifConsulta.findBy('nif', '5002889978')
      assert.exists(guardado)
      assert.isTrue(Boolean(guardado!.found))
    } finally {
      restaurar()
    }
  })

  test('segunda consulta vem da cache, sem voltar a chamar o serviço externo', async ({ assert }) => {
    const { estado, restaurar } = simularFetch({ corpo: RESPOSTA_BKNKV })
    try {
      const repo = new NifRepository()
      await repo.consultar('5002889978')
      const segunda = await repo.consultar('5002889978')

      assert.isTrue(segunda.cached)
      assert.isTrue(segunda.found)
      assert.equal(segunda.data?.nome, 'BKNKV - COMÉRCIO E PRESTAÇÃO DE SERVIÇOS, LDA')
      assert.equal(estado.chamadas, 1, 'a segunda consulta não pode chamar o scraper outra vez')
    } finally {
      restaurar()
    }
  })

  test('force=true ignora a cache e volta a consultar', async ({ assert }) => {
    const { estado, restaurar } = simularFetch({ corpo: RESPOSTA_BKNKV })
    try {
      const repo = new NifRepository()
      await repo.consultar('5002889978')
      const forcada = await repo.consultar('5002889978', { force: true })

      assert.isFalse(forcada.cached)
      assert.equal(estado.chamadas, 2)
    } finally {
      restaurar()
    }
  })

  test('cache expirada volta a consultar o serviço', async ({ assert }) => {
    const { estado, restaurar } = simularFetch({ corpo: RESPOSTA_BKNKV })
    try {
      const repo = new NifRepository()
      await repo.consultar('5002889978')

      // Envelhece a entrada para além do NIF_CACHE_DIAS (omissão 30).
      const linha = await NifConsulta.findByOrFail('nif', '5002889978')
      linha.consultado_em = DateTime.now().minus({ days: 400 })
      await linha.save()

      const outra = await repo.consultar('5002889978')
      assert.isFalse(outra.cached)
      assert.equal(estado.chamadas, 2)
    } finally {
      restaurar()
    }
  })

  test('NIF inexistente (found:false) também é cacheado — não repete a consulta lenta', async ({
    assert,
  }) => {
    const { estado, restaurar } = simularFetch({
      corpo: { found: false, message: 'Nenhum resultado encontrado', data: null },
    })
    try {
      const repo = new NifRepository()
      const r = await repo.consultar('9999999999')

      assert.isFalse(r.found)
      assert.isTrue(r.disponivel, 'o portal respondeu — está disponível, só não encontrou')
      assert.isNull(r.data)

      const segunda = await repo.consultar('9999999999')
      assert.isTrue(segunda.cached)
      assert.equal(estado.chamadas, 1)
    } finally {
      restaurar()
    }
  })

  test('serviço em baixo devolve disponivel:false em vez de lançar', async ({ assert }) => {
    const { restaurar } = simularFetch({ erro: new Error('connect ECONNREFUSED') })
    try {
      const repo = new NifRepository()
      const r = await repo.consultar('5002889978')

      assert.isFalse(r.disponivel)
      assert.isFalse(r.found)
      assert.isNull(r.data)
    } finally {
      restaurar()
    }
  })

  test('timeout devolve disponivel:false com mensagem própria', async ({ assert }) => {
    const erro = new Error('timed out')
    erro.name = 'TimeoutError'
    const { restaurar } = simularFetch({ erro })
    try {
      const repo = new NifRepository()
      const r = await repo.consultar('5002889978')

      assert.isFalse(r.disponivel)
      assert.match(r.message, /tempo limite/i)
    } finally {
      restaurar()
    }
  })

  test('serviço em baixo com cache antiga devolve a cache, avisando', async ({ assert }) => {
    const ok = simularFetch({ corpo: RESPOSTA_BKNKV })
    const repo = new NifRepository()
    await repo.consultar('5002889978')
    ok.restaurar()

    // Expira a cache e derruba o serviço: dados velhos são melhores do que nenhuns.
    const linha = await NifConsulta.findByOrFail('nif', '5002889978')
    linha.consultado_em = DateTime.now().minus({ days: 400 })
    await linha.save()

    const emBaixo = simularFetch({ erro: new Error('connect ECONNREFUSED') })
    try {
      const r = await repo.consultar('5002889978')
      assert.isTrue(r.found)
      assert.isTrue(r.cached)
      assert.equal(r.data?.nome, 'BKNKV - COMÉRCIO E PRESTAÇÃO DE SERVIÇOS, LDA')
      assert.match(r.message, /última consulta guardada/i)
    } finally {
      emBaixo.restaurar()
    }
  })

  test('resposta 5xx do serviço é indisponibilidade, não "não encontrado"', async ({ assert }) => {
    const { restaurar } = simularFetch({ ok: false, status: 504, corpo: null })
    try {
      const repo = new NifRepository()
      const r = await repo.consultar('5002889978')

      assert.isFalse(r.disponivel)
      assert.match(r.message, /504/)
    } finally {
      restaurar()
    }
  })

  test('NIF malformado é rejeitado sem chegar a chamar o serviço', async ({ assert }) => {
    const { estado, restaurar } = simularFetch({ corpo: RESPOSTA_BKNKV })
    try {
      const repo = new NifRepository()
      const r = await repo.consultar('abc-123/../etc')

      assert.isFalse(r.found)
      assert.equal(estado.chamadas, 0)
      assert.match(r.message, /inválido/i)
    } finally {
      restaurar()
    }
  })

  test('tipo SINGULAR mapeia para Pessoa Física', async ({ assert }) => {
    const { restaurar } = simularFetch({
      corpo: {
        found: true,
        message: 'ok',
        data: { NIF: '00000000LA000', Nome: 'Fulano', Tipo: 'SINGULAR - Particular', Estado: 'Activo' },
      },
    })
    try {
      const repo = new NifRepository()
      const r = await repo.consultar('00000000LA000')
      assert.equal(r.data?.tipo_cliente, 'Pessoa Física')
    } finally {
      restaurar()
    }
  })
})

test.group('consulta de NIF — rota pública (registo de empresa)', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  /**
   * O registo de empresa acontece antes de existir conta, por isso não pode usar o
   * proxy autenticado. A rota pública serve o MESMO repositório — logo partilha a
   * mesma cache, e um NIF já consultado por um tenant não volta ao portal.
   */
  test('a rota pública partilha a cache com a rota autenticada', async ({ assert }) => {
    const { estado, restaurar } = simularFetch({ corpo: RESPOSTA_BKNKV })
    try {
      const repo = new NifRepository()

      // Simula a consulta feita por um tenant autenticado.
      await repo.consultar('5002889978')
      assert.equal(estado.chamadas, 1)

      // O registo público do mesmo NIF não pode voltar a bater no portal.
      const publica = await repo.consultar('5002889978')
      assert.isTrue(publica.cached)
      assert.equal(publica.data?.tipo_cliente, 'Pessoa Jurídica')
      assert.equal(estado.chamadas, 1, 'a rota pública tem de servir da cache')
    } finally {
      restaurar()
    }
  })
})

test.group('consulta de NIF — permissão domain_nif.consultar', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('Admin, Vendedor, Gerente e Supervisor podem consultar NIF', async ({ assert }) => {
    const { empresa, user: admin } = await createTenant()
    const vendedor = await createUser(empresa, ['Vendedor'])
    const gerente = await createUser(empresa, ['Gerente'])
    const supervisor = await createUser(empresa, ['Supervisor'])

    for (const u of [admin, vendedor, gerente, supervisor]) {
      assert.isTrue(await userHasPermission(u, 'domain_nif.consultar'))
    }
  })

  test('Estoquista não tem acesso à consulta de NIF', async ({ assert }) => {
    const { empresa } = await createTenant()
    const estoquista = await createUser(empresa, ['Estoquista'])
    assert.isFalse(await userHasPermission(estoquista, 'domain_nif.consultar'))
  })
})
