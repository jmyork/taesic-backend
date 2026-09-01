/**
 * `configuracao.ts`.
 *
 * O que interessa aqui não é que a configuração boa seja lida — é que a má seja
 * recusada com uma frase que diga o que falta. Uma integração de pagamentos mal
 * configurada não falha no arranque; falha na primeira venda.
 */

import { test } from '@japa/runner'
import { configuracao, limparConfiguracao } from '../configuracao.js'

const VARIAVEIS = [
  'BAIPAGA_BASE_URL',
  'BAIPAGA_API_KEY',
  'BAIPAGA_CHAVE_PARTILHADA',
  'BAIPAGA_MERCHANT_EXTERNAL_ID',
  'BAIPAGA_MERCHANT_ID',
  'BAIPAGA_ACCEPTANCE_POINT_ID',
  'BAIPAGA_MOEDA',
  'BAIPAGA_INDICATIVO_PAIS',
  'BAIPAGA_TIMEOUT_MS',
  'BAIPAGA_CASAS_DECIMAIS',
  'BAIPAGA_VERIFICAR_ASSINATURA',
  'BAIPAGA_CANONICALIZACAO',
  'BAIPAGA_REGISTAR_PAYLOADS',
] as const

const MINIMA = {
  BAIPAGA_BASE_URL: 'https://ib.bancobai.ao/QUAMDW-3G/internet-banking/api',
  BAIPAGA_API_KEY: 'chave-de-teste',
}

/** Põe o ambiente exactamente com estas variáveis, e mais nenhuma das nossas. */
function ambiente(valores: Record<string, string>) {
  for (const nome of VARIAVEIS) delete process.env[nome]
  Object.assign(process.env, valores)
  limparConfiguracao()
}

test.group('configuracao', (group) => {
  const guardadas: Record<string, string | undefined> = {}

  group.setup(() => {
    for (const nome of VARIAVEIS) guardadas[nome] = process.env[nome]
  })

  group.teardown(() => {
    for (const nome of VARIAVEIS) {
      if (guardadas[nome] === undefined) delete process.env[nome]
      else process.env[nome] = guardadas[nome]
    }
    limparConfiguracao()
  })

  test('lê o mínimo e aplica as omissões', ({ assert }) => {
    ambiente(MINIMA)
    const cfg = configuracao()

    assert.equal(cfg.moeda, 'AOA')
    assert.equal(cfg.indicativoPais, '244')
    assert.equal(cfg.timeoutMs, 30_000)
    assert.equal(cfg.casasDecimais, 2)
    assert.equal(cfg.canonicalizacao, 'auto')
    assert.isTrue(cfg.registarPayloads)
  })

  test('tira a barra final do URL', ({ assert }) => {
    // Sem isto, cada caminho ficava com `//` no meio — que alguns servidores
    // servem e outros devolvem 404.
    ambiente({ ...MINIMA, BAIPAGA_BASE_URL: 'https://ib.bancobai.ao/x/api///' })
    assert.equal(configuracao().baseUrl, 'https://ib.bancobai.ao/x/api')
  })

  test('exige as duas variáveis sem as quais nada funciona', ({ assert }) => {
    ambiente({})
    assert.throws(() => configuracao(), /BAIPAGA_BASE_URL/)

    ambiente({ BAIPAGA_BASE_URL: MINIMA.BAIPAGA_BASE_URL })
    assert.throws(() => configuracao(), /BAIPAGA_API_KEY/)
  })

  test('recusa http:// — a chave de API viaja em todos os pedidos', ({ assert }) => {
    ambiente({ ...MINIMA, BAIPAGA_BASE_URL: 'http://ib.bancobai.ao/x/api' })
    assert.throws(() => configuracao(), /https:\/\//)
  })

  test('reúne todos os problemas numa mensagem só', ({ assert }) => {
    ambiente({ BAIPAGA_MOEDA: 'Kz', BAIPAGA_TIMEOUT_MS: 'depressa' })

    try {
      configuracao()
      assert.fail('devia ter lançado')
    } catch (erro: any) {
      // Corrigir uma variável de cada vez, com um reinício entre elas, é o que
      // se está a evitar.
      assert.include(erro.message, 'BAIPAGA_BASE_URL')
      assert.include(erro.message, 'BAIPAGA_API_KEY')
      assert.include(erro.message, 'BAIPAGA_MOEDA')
      assert.include(erro.message, 'BAIPAGA_TIMEOUT_MS')
      assert.include(erro.message, 'README.md')
    }
  })

  test('recusa uma canonicalização que não existe, e diz quais existem', ({ assert }) => {
    ambiente({ ...MINIMA, BAIPAGA_CANONICALIZACAO: 'inventada' })
    assert.throws(() => configuracao(), /montante-2-casas/)
  })

  test('sem chave partilhada, a verificação fica desligada em vez de fingir', ({ assert }) => {
    // A especificação não nomeia a chave em lado nenhum (#A-04). Enquanto ela
    // não existir, a verificação não pode correr — mas também não pode dizer que
    // correu.
    ambiente(MINIMA)
    assert.isFalse(configuracao().verificarAssinatura)
  })

  test('ligar a verificação sem os ingredientes é um erro, não um aviso', ({ assert }) => {
    // Uma configuração que promete uma garantia que não pode cumprir é pior do
    // que não a ter feito, porque quem a lê acredita nela.
    ambiente({ ...MINIMA, BAIPAGA_VERIFICAR_ASSINATURA: 'true' })
    assert.throws(() => configuracao(), /BAIPAGA_CHAVE_PARTILHADA/)

    ambiente({ ...MINIMA, BAIPAGA_VERIFICAR_ASSINATURA: 'true', BAIPAGA_CHAVE_PARTILHADA: 's3gr3d0' })
    assert.throws(() => configuracao(), /BAIPAGA_MERCHANT_EXTERNAL_ID/)
  })

  test('com os dois ingredientes, a verificação liga sozinha', ({ assert }) => {
    ambiente({
      ...MINIMA,
      BAIPAGA_CHAVE_PARTILHADA: 's3gr3d0',
      BAIPAGA_MERCHANT_EXTERNAL_ID: 'MERCH-001',
    })

    assert.isTrue(configuracao().verificarAssinatura)
  })

  test('aceita "sim" e "1" além de "true"', ({ assert }) => {
    ambiente({ ...MINIMA, BAIPAGA_REGISTAR_PAYLOADS: 'nao' })
    assert.isFalse(configuracao().registarPayloads)

    ambiente({ ...MINIMA, BAIPAGA_REGISTAR_PAYLOADS: 'sim' })
    assert.isTrue(configuracao().registarPayloads)

    ambiente({ ...MINIMA, BAIPAGA_REGISTAR_PAYLOADS: '1' })
    assert.isTrue(configuracao().registarPayloads)
  })

  test('lê uma vez e guarda; limparConfiguracao() volta a ler', ({ assert }) => {
    ambiente({ ...MINIMA, BAIPAGA_MOEDA: 'AOA' })
    assert.equal(configuracao().moeda, 'AOA')

    process.env.BAIPAGA_MOEDA = 'USD'
    assert.equal(configuracao().moeda, 'AOA', 'devia vir da cache')

    limparConfiguracao()
    assert.equal(configuracao().moeda, 'USD')
  })
})
