import { IncomingMessage } from 'node:http'
import { Socket } from 'node:net'
import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import limiter from '@adonisjs/limiter/services/main'
import {
  emailActionThrottle,
  loginThrottle,
  otpConfirmThrottle,
  otpRequestThrottle,
  signupThrottle,
} from '#start/limiter'

/**
 * A CHAVE de cada limitador — o teste que faltava quando o 429 passou a barrar
 * toda a gente.
 *
 * O sintoma relatado foi: "quando emite um too many requests, todos os
 * dispositivos que tentam aceder são barrados pelo mesmo erro". A causa está
 * explicada em detalhe no comentário de `chaveDoAlvo` em start/limiter.ts; em
 * duas linhas: o nome do espaço ('email_action', 'login', ...) era passado como
 * mais uma "parte" da chave, nunca vinha vazio, e por isso um pedido sem nada
 * que identificasse o alvo produzia a chave `email_action` — a MESMA para o
 * planeta inteiro — em vez de cair no IP de quem fez o pedido.
 *
 * Estes testes são de comportamento e não de implementação: nenhum inspecciona a
 * chave gerada. Verificam a única coisa que interessa — que esgotar o limite de
 * UM alvo/dispositivo não fecha a porta a OUTRO — porque é essa a propriedade
 * que se partiu, e é essa que um refactor futuro tem de manter mesmo que a chave
 * passe a ser construída de outra maneira.
 *
 * Correm contra a store `memory` (ver .env.test): sem MySQL, sem estado a
 * sobreviver entre execuções, e sem escrever na mesma tabela `rate_limits` que o
 * servidor de desenvolvimento usa.
 */
test.group('limitadores — a chave nunca pode ser global', (group) => {
  // Sem isto, o primeiro teste que esgota um limite deixava-o esgotado para os
  // seguintes: o contador vive no processo, não no teste.
  group.each.setup(async () => {
    await limiter.clear()
  })

  /**
   * Um contexto HTTP que simula um dispositivo concreto.
   *
   * `ip` é o endereço do SOCKET. `encaminhadoPor` simula o cabeçalho
   * `X-Forwarded-For` que o BFF/Caddy acrescentam — é assim que os pedidos
   * chegam em produção, e é o que faz `request.ip()` devolver o cliente e não o
   * servidor Next (config/app.ts, `trustProxy: 'loopback'`).
   */
  async function dispositivo(opcoes: {
    ip?: string
    encaminhadoPor?: string
    corpo?: Record<string, unknown>
    params?: Record<string, string>
  }) {
    const socket = new Socket()
    // `remoteAddress` é só de leitura num Socket por ligar; o proxy-addr que o
    // AdonisJS usa lê-o daqui, por isso tem de ser definido à mão.
    Object.defineProperty(socket, 'remoteAddress', {
      value: opcoes.ip ?? '127.0.0.1',
      configurable: true,
    })

    const req = new IncomingMessage(socket)
    req.method = 'POST'
    req.url = '/'
    if (opcoes.encaminhadoPor) {
      req.headers['x-forwarded-for'] = opcoes.encaminhadoPor
    }

    const ctx = await testUtils.createHttpContext({ req })
    ctx.request.updateBody(opcoes.corpo ?? {})
    ctx.params = opcoes.params ?? {}

    return ctx
  }

  type Middleware = (ctx: any, next: () => Promise<void>) => Promise<unknown>

  /** Devolve `true` se o pedido passou, `false` se levou 429. */
  async function pedir(middleware: Middleware, ctx: any): Promise<boolean> {
    try {
      await middleware(ctx, async () => {})
      return true
    } catch (erro: any) {
      if (erro?.status === 429) return false
      throw erro
    }
  }

  async function pedirVezes(
    middleware: Middleware,
    fabricaDeContexto: () => Promise<any>,
    vezes: number
  ): Promise<boolean[]> {
    const resultados: boolean[] = []
    for (let i = 0; i < vezes; i++) {
      resultados.push(await pedir(middleware, await fabricaDeContexto()))
    }
    return resultados
  }

  test('reenvio de activação: esgotar uma empresa não bloqueia outra', async ({ assert }) => {
    // ESTE É O TESTE DA REGRESSÃO. Antes da correcção falhava na última asserção:
    // `api/resend-company-activation-email` não tem `:company_alias` no caminho e
    // manda `nif_ou_company_alias` no corpo — nenhum dos campos que o limitador
    // procurava. As duas empresas partilhavam a chave `email_action` e o limite de
    // 5 por 5 minutos era, na prática, um limite da plataforma inteira.
    const primeiros = await pedirVezes(
      emailActionThrottle,
      () => dispositivo({ ip: '203.0.113.10', corpo: { nif_ou_company_alias: 'empresa-a' } }),
      5
    )
    assert.deepEqual(primeiros, [true, true, true, true, true])

    const sexto = await pedir(
      emailActionThrottle,
      await dispositivo({ ip: '203.0.113.10', corpo: { nif_ou_company_alias: 'empresa-a' } })
    )
    assert.isFalse(sexto, 'o limite tem de continuar a travar quem abusa do mesmo alvo')

    const outraEmpresa = await pedir(
      emailActionThrottle,
      await dispositivo({ ip: '198.51.100.20', corpo: { nif_ou_company_alias: 'empresa-b' } })
    )
    assert.isTrue(
      outraEmpresa,
      'outra empresa, noutro dispositivo, não pode ser barrada pelo limite da primeira'
    )
  })

  test('reenvio de activação: o campo do corpo é mesmo lido', async ({ assert }) => {
    // Complementa o teste anterior. Se `nif_ou_company_alias` voltasse a ser
    // ignorado, os dois pedidos abaixo caíam ambos na chave por IP (é o mesmo IP)
    // e o segundo seria barrado. Passar prova que o campo entra na chave.
    const comAlvo = await pedirVezes(
      emailActionThrottle,
      () => dispositivo({ ip: '203.0.113.30', corpo: { nif_ou_company_alias: 'empresa-c' } }),
      5
    )
    assert.deepEqual(comAlvo, [true, true, true, true, true])

    const semAlvo = await pedir(emailActionThrottle, await dispositivo({ ip: '203.0.113.30' }))
    assert.isTrue(semAlvo, 'a chave com alvo e a chave sem alvo têm de ser contadores distintos')
  })

  test('reenvio de activação: o mesmo alvo é travado venha de onde vier', async ({ assert }) => {
    // O outro lado da moeda, e a razão de o limitador existir: quem se protege é a
    // caixa de correio da vítima. Mudar de dispositivo não pode dar direito a mais
    // cinco emails.
    const ips = ['203.0.113.1', '203.0.113.2', '203.0.113.3', '203.0.113.4', '203.0.113.5']
    for (const ip of ips) {
      const passou = await pedir(
        emailActionThrottle,
        await dispositivo({ ip, corpo: { nif_ou_company_alias: 'vitima' } })
      )
      assert.isTrue(passou)
    }

    const deOutroIpAinda = await pedir(
      emailActionThrottle,
      await dispositivo({ ip: '203.0.113.99', corpo: { nif_ou_company_alias: 'vitima' } })
    )
    assert.isFalse(deOutroIpAinda, 'trocar de IP não pode dar direito a mais emails à vítima')
  })

  test('pedido sem nada que identifique o alvo cai no IP, não numa chave partilhada', async ({
    assert,
  }) => {
    // O caso mais perigoso do bug antigo: um corpo vazio (pedido malformado, ou
    // que a validação vai recusar a seguir) consumia pontos de uma chave que toda
    // a gente partilhava. Dez pedidos lixo de um atacante fechavam o `otp_confirm`
    // do planeta durante 10 minutos.
    const doAtacante = await pedirVezes(
      otpConfirmThrottle,
      () => dispositivo({ ip: '203.0.113.66' }),
      10
    )
    assert.equal(doAtacante.filter(Boolean).length, 10)

    const maisUmDoAtacante = await pedir(
      otpConfirmThrottle,
      await dispositivo({ ip: '203.0.113.66' })
    )
    assert.isFalse(maisUmDoAtacante, 'o atacante tem de ser travado')

    const deOutraPessoa = await pedir(otpConfirmThrottle, await dispositivo({ ip: '198.51.100.7' }))
    assert.isTrue(deOutraPessoa, 'o lixo de um não pode fechar a porta a todos os outros')
  })

  test('login: o limite é por conta, e uma conta esgotada não fecha as outras', async ({
    assert,
  }) => {
    const contaAlvo = { company_alias: 'acme', uid: 'ana' }

    const tentativas = await pedirVezes(
      loginThrottle,
      () => dispositivo({ ip: '203.0.113.40', corpo: contaAlvo }),
      5
    )
    assert.deepEqual(tentativas, [true, true, true, true, true])

    assert.isFalse(
      await pedir(loginThrottle, await dispositivo({ ip: '203.0.113.40', corpo: contaAlvo })),
      'brute-force à mesma conta tem de ser travado'
    )

    assert.isFalse(
      await pedir(loginThrottle, await dispositivo({ ip: '198.51.100.41', corpo: contaAlvo })),
      'e mudar de IP não pode contornar o limite da conta — é esse o ponto do limitador'
    )

    assert.isTrue(
      await pedir(
        loginThrottle,
        await dispositivo({ ip: '203.0.113.40', corpo: { company_alias: 'acme', uid: 'bruno' } })
      ),
      'outro funcionário da mesma empresa não pode ser apanhado pelo limite da conta da Ana'
    )
  })

  test('atrás do BFF, cada dispositivo conta como um dispositivo', async ({ assert }) => {
    // Em produção o socket é sempre 127.0.0.1 (o servidor Next fala com a API por
    // loopback) e quem distingue os clientes é o `X-Forwarded-For`. Se este teste
    // falhar, a plataforma inteira volta a contar como um único cliente — que é a
    // outra maneira de reproduzir o sintoma relatado.
    const doPrimeiro = await pedirVezes(
      otpRequestThrottle,
      () => dispositivo({ ip: '127.0.0.1', encaminhadoPor: '203.0.113.50' }),
      3
    )
    assert.deepEqual(doPrimeiro, [true, true, true])

    assert.isFalse(
      await pedir(
        otpRequestThrottle,
        await dispositivo({ ip: '127.0.0.1', encaminhadoPor: '203.0.113.50' })
      ),
      'o mesmo dispositivo tem de ser travado ao 4.º pedido'
    )

    assert.isTrue(
      await pedir(
        otpRequestThrottle,
        await dispositivo({ ip: '127.0.0.1', encaminhadoPor: '198.51.100.51' })
      ),
      'outro dispositivo, atrás do mesmo BFF, não pode herdar o limite do primeiro'
    )
  })

  test('signup: o limite por IP não é um limite por plataforma', async ({ assert }) => {
    const doPrimeiro = await pedirVezes(
      signupThrottle,
      () => dispositivo({ ip: '127.0.0.1', encaminhadoPor: '203.0.113.60' }),
      5
    )
    assert.deepEqual(doPrimeiro, [true, true, true, true, true])

    assert.isFalse(
      await pedir(
        signupThrottle,
        await dispositivo({ ip: '127.0.0.1', encaminhadoPor: '203.0.113.60' })
      )
    )

    assert.isTrue(
      await pedir(
        signupThrottle,
        await dispositivo({ ip: '127.0.0.1', encaminhadoPor: '198.51.100.61' })
      ),
      'quem nunca criou nenhuma empresa tem de conseguir criar a sua'
    )
  })
})
