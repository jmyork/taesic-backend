/**
 * `ClienteBaipaga`, contra o simulador.
 *
 * Estes são os testes que justificam a classe existir em vez de meia dúzia de
 * `fetch()` espalhados pelos controladores. Quase todos afirmam a mesma coisa
 * por caminhos diferentes: **um 200 não é sucesso**, e uma resposta cuja origem
 * não se consegue provar não decide uma entrega.
 */

import { test } from '@japa/runner'
import {
  CONFIGURACAO_DE_TESTE,
  definirConfiguracao,
  limparConfiguracao,
  type ConfiguracaoBaipaga,
} from '../configuracao.js'
import { ClienteBaipaga, mensagemDaFalha, type Falha } from '../cliente/cliente_baipaga.js'
import { iniciarSimulador, type OpcoesDoSimulador, type Simulador } from '../simulador/servidor.js'

/**
 * Levanta um simulador e aponta-lhe um cliente.
 *
 * O `dormir` é substituído por um que não dorme: `esperarDesfecho()` faz seis
 * sondagens com intervalos crescentes, e um teste não tem de esperar por elas
 * para provar que a sequência está certa.
 */
async function montar(
  opcoes: OpcoesDoSimulador = {},
  extra: Partial<ConfiguracaoBaipaga> = {}
): Promise<{ sim: Simulador; bai: ClienteBaipaga }> {
  const sim = await iniciarSimulador(opcoes)

  limparConfiguracao()
  definirConfiguracao({
    ...CONFIGURACAO_DE_TESTE,
    baseUrl: sim.url,
    apiKey: opcoes.apiKey ?? 'CHAVE-DE-TESTE',
    chavePartilhada: opcoes.chavePartilhada ?? 'SEGREDO-DE-TESTE',
    merchantExternalId: opcoes.merchantExternalId ?? 'MERCH-TESTE',
    registarPayloads: true,
    ...extra,
  })

  return { sim, bai: new ClienteBaipaga({ dormir: async () => {} }) }
}

test.group('o caso bom', (group) => {
  group.each.teardown(() => limparConfiguracao())

  test('validarMsisdn normaliza o número antes de o enviar', async ({ assert }) => {
    const { sim, bai } = await montar()

    try {
      const r = await bai.validarMsisdn('923 456 789')

      assert.isTrue(r.ok)
      if (!r.ok) return

      assert.isTrue(r.dados.valido)
      assert.equal(r.dados.msisdn, '244923456789')
      // O que interessa: o número normalizado é o que chegou ao BAI.
      assert.include(sim.pedidos[0].caminho, '244923456789')
    } finally {
      await sim.parar()
    }
  })

  test('pedirPagamento devolve o identificador e a validade', async ({ assert }) => {
    const { sim, bai } = await montar()

    try {
      const r = await bai.pedirPagamento({
        msisdn: '923456789',
        total: 1500,
        referencia: 'ENC-1',
        descricao: 'Compra de teste',
      })

      assert.isTrue(r.ok)
      if (!r.ok) return

      assert.equal(r.dados.paymentId, 987_654_321)
      assert.equal(r.dados.expiraEm, '2026-08-31T23:59:59Z')

      const enviado = sim.pedidos[0].corpo as any
      assert.equal(enviado.customerMsisdn, '244923456789')
      assert.equal(enviado.currency, 'AOA', 'a moeda vem da configuração')
      assert.equal(enviado.merchantId, 1, 'o merchantId vem da configuração')
    } finally {
      await sim.parar()
    }
  })

  test('a chave de API é enviada mas nunca entra no registo', async ({ assert }) => {
    const { sim, bai } = await montar()

    try {
      const r = await bai.pedirPagamento({ msisdn: '923456789', total: 1500, referencia: 'ENC-1' })

      // Foi enviada...
      assert.equal(sim.pedidos[0].apiKey, 'CHAVE-DE-TESTE')
      // ...e não está em lado nenhum do que se guarda para auditoria.
      assert.notInclude(JSON.stringify(r.pedido), 'CHAVE-DE-TESTE')
      assert.include(JSON.stringify(r.pedido), '<omitida>')
      // O corpo, esse, fica — é o que se quer auditar.
      assert.include(JSON.stringify(r.pedido), 'ENC-1')
    } finally {
      await sim.parar()
    }
  })

  test('as duas operações sem responseCode não são dadas por falhadas (#C-09)', async ({ assert }) => {
    const { sim, bai } = await montar()

    try {
      const taxas = await bai.percentagensDeIva()
      assert.isTrue(taxas.ok)
      if (taxas.ok) assert.equal(taxas.dados.find((t) => t.value === 14)?.id, 3)

      const carrinho = await bai.calcularCarrinho({
        items: [{ description: 'Artigo', amountPerItem: 250, count: 2, discount: 50, vatPercentage: { id: 3, value: 14 } }],
      })
      assert.isTrue(carrinho.ok)
      if (carrinho.ok) {
        assert.equal(carrinho.dados.totalCartAmount, 450)
        assert.equal(carrinho.dados.totalCartAmountWithVat, 513)
      }
    } finally {
      await sim.parar()
    }
  })

  test('iniciarPagamentoComOtp devolve o URL de confirmação', async ({ assert }) => {
    const { sim, bai } = await montar()

    try {
      const r = await bai.iniciarPagamentoComOtp({ msisdn: '923456789', total: 2500, referencia: 'OTP-1' })

      assert.isTrue(r.ok)
      if (r.ok) assert.equal(r.dados.urlDeConfirmacao, 'https://ib.bancobai.ao/otp/abc123')
    } finally {
      await sim.parar()
    }
  })

  test('o cativo percorre criar → confirmar → anular', async ({ assert }) => {
    const { sim, bai } = await montar()

    try {
      const criado = await bai.criarCativo({
        msisdn: '923456789',
        estimado: 1000,
        maximo: 1500,
        referencia: 'CAP-1',
      })
      assert.isTrue(criado.ok)

      const confirmado = await bai.confirmarCativo({ referencia: 'CAP-1', final: 1200, maximoConhecido: 1500 })
      assert.isTrue(confirmado.ok)
      assert.equal((sim.pedidos[1].corpo as any).finalAmount, 1200)

      const anulado = await bai.anularCativo({ referencia: 'CAP-1' })
      assert.isTrue(anulado.ok)

      assert.deepEqual(
        sim.pedidos.map((p) => p.operacao),
        ['criarCativo', 'confirmarCativo', 'anularCativo']
      )
    } finally {
      await sim.parar()
    }
  })

  test('gerarQrCode monta o data: URI', async ({ assert }) => {
    const { sim, bai } = await montar()

    try {
      const r = await bai.gerarQrCode({ valor: 500, referencia: 'QR-1' })

      assert.isTrue(r.ok)
      if (!r.ok) return

      assert.equal(r.dados.extensao, 'png')
      assert.isTrue(r.dados.dataUri.startsWith('data:image/png;base64,iVBOR'))
      assert.equal((sim.pedidos[0].corpo as any).acceptancePointId, 1, 'vem da configuração')
    } finally {
      await sim.parar()
    }
  })

  test('pontoDeAceitacao devolve o nome da loja', async ({ assert }) => {
    const { sim, bai } = await montar()

    try {
      const r = await bai.pontoDeAceitacao(12_345, 456)

      assert.isTrue(r.ok)
      if (r.ok) assert.equal(r.dados.friendlyName, 'Loja Central — Balcão 1')
      assert.include(sim.pedidos[0].caminho, '/merchants/12345/acceptancePoint/456')
    } finally {
      await sim.parar()
    }
  })
})

test.group('HTTP 200 não é sucesso', (group) => {
  group.each.teardown(() => limparConfiguracao())

  test('um código de erro dentro de um 200 é uma falha', async ({ assert }) => {
    const { sim, bai } = await montar({ codigos: { pedirPagamento: 'CUSTOMER_NOT_FOUND_FOR_MSISDN' } })

    try {
      const r = await bai.pedirPagamento({ msisdn: '923456789', total: 1500, referencia: 'ENC-1' })

      assert.isFalse(r.ok)
      if (r.ok) return

      assert.equal(r.httpStatus, 200, 'o HTTP correu bem — o negócio é que não')
      assert.equal(r.tipo, 'recusado')
      assert.equal(r.erros[0].codigo, 'CUSTOMER_NOT_FOUND_FOR_MSISDN')
      assert.match(mensagemDaFalha(r), /confirme o número/i)
    } finally {
      await sim.parar()
    }
  })

  test('EXISTING_EXTERNAL_REFERENCE manda consultar antes de repetir', async ({ assert }) => {
    const { sim, bai } = await montar({ codigos: { pedirPagamento: 'EXISTING_EXTERNAL_REFERENCE' } })

    try {
      const r = await bai.pedirPagamento({ msisdn: '923456789', total: 1500, referencia: 'ENC-1' })

      assert.isFalse(r.ok)
      if (r.ok) return

      // Repetir com uma referência nova aqui cobra o cliente duas vezes.
      assert.isTrue(r.erros[0].consultarAntesDeRepetir)
      assert.isFalse(r.repetivel)
    } finally {
      await sim.parar()
    }
  })

  test('CORE_BANKING_UNAVAILABLE é repetível; INVALID_MSISDN não é', async ({ assert }) => {
    const banco = await montar({ codigos: { pedirPagamento: 'CORE_BANKING_UNAVAILABLE' } })
    try {
      const r = await banco.bai.pedirPagamento({ msisdn: '923456789', total: 1, referencia: 'A' })
      assert.isFalse(r.ok)
      if (!r.ok) assert.isTrue(r.repetivel)
    } finally {
      await banco.sim.parar()
    }

    const numero = await montar({ codigos: { pedirPagamento: 'INVALID_MSISDN' } })
    try {
      const r = await numero.bai.pedirPagamento({ msisdn: '923456789', total: 1, referencia: 'A' })
      assert.isFalse(r.ok)
      if (!r.ok) assert.isFalse(r.repetivel)
    } finally {
      await numero.sim.parar()
    }
  })
})

test.group('erros de transporte e de HTTP', (group) => {
  group.each.teardown(() => limparConfiguracao())

  test('401 vira INVALID_API_KEY (#C-10)', async ({ assert }) => {
    // A especificação não declara corpo nenhum para os erros HTTP: o estatuto é
    // tudo o que há para traduzir.
    const { sim, bai } = await montar({ apiKey: 'A-CERTA' }, { apiKey: 'A-ERRADA' })

    try {
      const r = await bai.validarMsisdn('923456789')

      assert.isFalse(r.ok)
      if (!r.ok) {
        assert.equal(r.erros[0].codigo, 'INVALID_API_KEY')
        assert.include(r.erros[0].descricao, 'HTTP 401')
        // E o operador não recebe uma frase sobre chaves de API.
        assert.include(mensagemDaFalha(r), 'suporte')
      }
    } finally {
      await sim.parar()
    }
  })

  test('404 vira INVALID_EXTERNAL_REFERENCE', async ({ assert }) => {
    const { sim, bai } = await montar({ estatutos: { estado: 404 } })

    try {
      const r = await bai.consultarPagamento({ referencia: 'ENC-INEXISTENTE' })

      assert.isFalse(r.ok)
      if (!r.ok) assert.equal(r.erros[0].codigo, 'INVALID_EXTERNAL_REFERENCE')
    } finally {
      await sim.parar()
    }
  })

  test('500 é repetível', async ({ assert }) => {
    const { sim, bai } = await montar({ estatutos: { pedirPagamento: 500 } })

    try {
      const r = await bai.pedirPagamento({ msisdn: '923456789', total: 1500, referencia: 'ENC-1' })

      assert.isFalse(r.ok)
      if (!r.ok) {
        assert.equal(r.erros[0].codigo, 'CORE_BANKING_UNAVAILABLE')
        assert.isTrue(r.repetivel)
      }
    } finally {
      await sim.parar()
    }
  })

  test('uma resposta que não é JSON não melhora por se repetir', async ({ assert }) => {
    // Tipicamente uma página de erro de um proxy pelo caminho.
    const { sim, bai } = await montar({ respostaNaoJson: true })

    try {
      const r = await bai.validarMsisdn('923456789')

      assert.isFalse(r.ok)
      if (!r.ok) {
        assert.equal(r.tipo, 'resposta-invalida')
        assert.isFalse(r.repetivel)
      }
    } finally {
      await sim.parar()
    }
  })

  test('um timeout manda consultar antes de repetir', async ({ assert }) => {
    // É o caso perigoso: o pedido pode ter chegado e sido aceite, e nós não
    // sabemos. Repetir às cegas cria um segundo pagamento.
    const { sim, bai } = await montar({ mudo: true }, { timeoutMs: 250 })

    try {
      const r = await bai.pedirPagamento({ msisdn: '923456789', total: 1500, referencia: 'ENC-1' })

      assert.isFalse(r.ok)
      if (!r.ok) {
        assert.equal(r.tipo, 'indisponivel')
        assert.isTrue(r.repetivel)
        assert.isTrue(r.erros[0].consultarAntesDeRepetir)
      }
    } finally {
      await sim.parar()
    }
  }).timeout(10_000)
})

test.group('validação local', (group) => {
  group.each.teardown(() => limparConfiguracao())

  test('um pedido mal formado não chega a sair', async ({ assert }) => {
    const { sim, bai } = await montar()

    try {
      const r = await bai.pedirPagamento({ msisdn: 'abc', total: -5, referencia: '' })

      assert.isFalse(r.ok)
      if (!r.ok) {
        assert.equal(r.tipo, 'validacao-local')
        assert.isNull(r.httpStatus)
        assert.isAtLeast(r.erros.length, 2)
      }
      assert.isEmpty(sim.pedidos, 'nada devia ter saído para a rede')
    } finally {
      await sim.parar()
    }
  })

  test('uma consulta sem identificação é recusada aqui', async ({ assert }) => {
    const { sim, bai } = await montar()

    try {
      const r = await bai.consultarPagamento({})

      assert.isFalse(r.ok)
      if (!r.ok) assert.equal(r.tipo, 'validacao-local')
      assert.isEmpty(sim.pedidos)
    } finally {
      await sim.parar()
    }
  })

  test('um número irreconhecível é recusado antes de gastar a chamada', async ({ assert }) => {
    const { sim, bai } = await montar()

    try {
      const r = await bai.validarMsisdn('abc')

      assert.isFalse(r.ok)
      if (!r.ok) assert.equal(r.erros[0].codigo, 'INVALID_MSISDN_FORMAT')
      assert.isEmpty(sim.pedidos)
    } finally {
      await sim.parar()
    }
  })

  test('um cativo com tecto abaixo do estimado não sai', async ({ assert }) => {
    const { sim, bai } = await montar()

    try {
      const r = await bai.criarCativo({
        msisdn: '923456789',
        estimado: 1500,
        maximo: 1000,
        referencia: 'CAP-1',
      })

      assert.isFalse(r.ok)
      assert.isEmpty(sim.pedidos)
    } finally {
      await sim.parar()
    }
  })
})

test.group('consulta de estado e assinatura', (group) => {
  group.each.teardown(() => limparConfiguracao())

  test('aceita a resposta assinada e diz que a verificou', async ({ assert }) => {
    const { sim, bai } = await montar({ estados: ['SUCCESS'] })

    try {
      const r = await bai.consultarPagamento({ referencia: 'ENC-1' })

      assert.isTrue(r.ok)
      if (!r.ok) return

      assert.isTrue(r.dados.assinatura?.valida)
      assert.isTrue(r.dados.liquidado)
      assert.isFalse(r.dados.pendente)
    } finally {
      await sim.parar()
    }
  })

  test('verifica qualquer uma das três leituras do montante (#A-01)', async ({ assert }) => {
    for (const formato of ['montante-simples', 'montante-1-casa', 'montante-2-casas'] as const) {
      const { sim, bai } = await montar({ formatoDoMontante: formato })

      try {
        const r = await bai.consultarPagamento({ referencia: 'ENC-1' })

        assert.isTrue(r.ok, `${formato} devia passar`)
        if (r.ok) {
          assert.isTrue(r.dados.assinatura?.valida)
          // E deixa dito qual bateu, para se fixar em BAIPAGA_CANONICALIZACAO.
          assert.isTrue(r.avisos.some((a) => a.includes(formato)), r.avisos.join(' | '))
        }
      } finally {
        await sim.parar()
      }
    }
  })

  test('uma resposta forjada é recusada mesmo dizendo SUCCESS', async ({ assert }) => {
    // É o teste que justifica o ficheiro `assinatura/hmac.ts` existir.
    const { sim, bai } = await montar({ estados: ['SUCCESS'], assinaturaForjada: true })

    try {
      const r = await bai.consultarPagamento({ referencia: 'ENC-1' })

      assert.isFalse(r.ok, 'um SUCCESS que não se consegue atribuir ao BAI não é um SUCCESS')
      if (!r.ok) {
        assert.equal(r.tipo, 'resposta-invalida')
        assert.isFalse(r.repetivel)
        assert.include(r.erros[0].descricao, 'não confere')
      }
    } finally {
      await sim.parar()
    }
  })

  test('com a verificação desligada, avisa em vez de fingir', async ({ assert }) => {
    const { sim, bai } = await montar({}, { verificarAssinatura: false })

    try {
      const r = await bai.consultarPagamento({ referencia: 'ENC-1' })

      assert.isTrue(r.ok)
      if (r.ok) {
        assert.isNull(r.dados.assinatura)
        assert.isTrue(r.avisos.some((a) => a.includes('NÃO verificada')), r.avisos.join(' | '))
      }
    } finally {
      await sim.parar()
    }
  })

  test('uma resposta sem assinatura não passa por verificada', async ({ assert }) => {
    const { sim, bai } = await montar({ semAssinatura: true })

    try {
      const r = await bai.consultarPagamento({ referencia: 'ENC-1' })

      // Não é uma falha — é o que acontece enquanto a chave partilhada não
      // existir do lado deles. Mas fica dito, e `valida` nunca é `true`.
      assert.isTrue(r.ok)
      if (r.ok) {
        assert.isFalse(r.dados.assinatura?.valida)
        assert.isNotNull(r.dados.assinatura?.naoVerificavel)
      }
    } finally {
      await sim.parar()
    }
  })

  test('ACCEPTED não liquida', async ({ assert }) => {
    const { sim, bai } = await montar({ estados: ['ACCEPTED'] })

    try {
      const r = await bai.consultarPagamento({ referencia: 'ENC-1' })

      assert.isTrue(r.ok)
      if (r.ok) {
        assert.equal(r.dados.estado, 'ACCEPTED')
        // O nome diz que acabou; o significado diz que não. Daqui ainda se sai
        // para SUCCESS ou para ERROR, e por isso continua pendente.
        assert.isFalse(r.dados.liquidado)
        assert.isTrue(r.dados.pendente)
      }
    } finally {
      await sim.parar()
    }
  })
})

test.group('esperarDesfecho', (group) => {
  group.each.teardown(() => limparConfiguracao())

  test('sonda até o estado ficar final', async ({ assert }) => {
    const { sim, bai } = await montar({ estados: ['PROCESSING', 'PROCESSING', 'SUCCESS'] })

    try {
      const r = await bai.esperarDesfecho({ referencia: 'ENC-1' }, { tentativas: 6 })

      assert.isTrue(r.ok)
      if (r.ok) {
        assert.equal(r.dados.estado, 'SUCCESS')
        assert.isTrue(r.dados.liquidado)
      }
      assert.equal(sim.sondagens, 3, 'devia ter parado assim que fechou')
    } finally {
      await sim.parar()
    }
  })

  test('pára no primeiro estado final, mesmo sendo mau', async ({ assert }) => {
    const { sim, bai } = await montar({ estados: ['REJECTED'] })

    try {
      const r = await bai.esperarDesfecho({ referencia: 'ENC-1' }, { tentativas: 6 })

      assert.isTrue(r.ok, 'uma recusa do cliente é uma resposta, não uma falha da chamada')
      if (r.ok) {
        assert.equal(r.dados.estado, 'REJECTED')
        assert.isFalse(r.dados.liquidado)
      }
      assert.equal(sim.sondagens, 1)
    } finally {
      await sim.parar()
    }
  })

  test('ao desistir devolve pendente, e nunca "não pago"', async ({ assert }) => {
    // Um pagamento ainda `PROCESSING` quando desistimos de esperar pode ficar
    // `SUCCESS` um minuto depois. Tratá-lo como falhado é entregar de graça ou
    // cobrar duas vezes, conforme o lado por onde se erra.
    const { sim, bai } = await montar({ estados: ['PROCESSING'] })

    try {
      const r = await bai.esperarDesfecho({ referencia: 'ENC-1' }, { tentativas: 3 })

      assert.isTrue(r.ok)
      if (r.ok) {
        assert.isTrue(r.dados.pendente)
        assert.isFalse(r.dados.liquidado)
      }
      assert.equal(sim.sondagens, 3)
    } finally {
      await sim.parar()
    }
  })

  test('desiste logo de uma recusa de negócio', async ({ assert }) => {
    // O pagamento não existe, ou não é nosso. Insistir não muda isso.
    const { sim, bai } = await montar({ codigos: { estado: 'INVALID_EXTERNAL_REFERENCE' } })

    try {
      const r = await bai.esperarDesfecho({ referencia: 'ENC-X' }, { tentativas: 5 })

      assert.isFalse(r.ok)
      assert.equal(sim.pedidos.length, 1)
    } finally {
      await sim.parar()
    }
  })

  test('insiste perante uma falha transitória', async ({ assert }) => {
    const { sim, bai } = await montar({ codigos: { estado: 'CORE_BANKING_UNAVAILABLE' } })

    try {
      const r = await bai.esperarDesfecho({ referencia: 'ENC-1' }, { tentativas: 3 })

      assert.isFalse(r.ok)
      if (!r.ok) assert.isTrue((r as Falha).repetivel)
      assert.equal(sim.pedidos.length, 3)
    } finally {
      await sim.parar()
    }
  })
})
