/**
 * Um servidor que finge ser o BAI Paga.
 *
 * ── Porque é que isto existe ──────────────────────────────────────────────────
 *
 * Pela mesma razão do `minfin-integration/simulador/`: não se pode testar uma
 * integração de pagamentos contra o sistema real. Cada chamada ao ambiente de
 * qualidade do BAI consome uma referência externa, depende de eles estarem de
 * pé, e não há forma de lhes pedir que devolvam `CORE_BANKING_UNAVAILABLE` a
 * pedido — que é precisamente o caminho que mais interessa exercitar.
 *
 * E há uma razão que é só deste módulo: **a assinatura**. A única maneira de
 * afirmar que uma resposta forjada é recusada é forjar uma. Isso implica ter um
 * servidor que assina com a chave certa (para o caso bom) e um que assina com
 * lixo (para o caso mau), e os dois têm de ser nossos.
 *
 * ── O que isto NÃO é ──────────────────────────────────────────────────────────
 *
 * Não é uma reimplementação do BAI. Não valida carrinhos, não guarda estado
 * entre pagamentos, não tem clientes. Devolve o que lhe mandarem devolver, e
 * regista o que recebeu. Tudo o que ele "decide" sozinho é uma suposição sobre
 * o comportamento deles — e uma suposição num simulador é uma armadilha, porque
 * passa a ser testada como se fosse verdade.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { createHmac } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import type { FormatoDeMontante } from '../assinatura/hmac.js'

/** As operações que o simulador sabe distinguir, para lhes atribuir um código. */
export type Operacao =
  | 'validarMsisdn'
  | 'percentagensIva'
  | 'calcularCarrinho'
  | 'pontoDeAceitacao'
  | 'pedirPagamento'
  | 'iniciarOtp'
  | 'criarCativo'
  | 'confirmarCativo'
  | 'anularCativo'
  | 'qrCode'
  | 'estado'

export interface RegistoDePedido {
  operacao: Operacao | 'desconhecida'
  metodo: string
  caminho: string
  query: Record<string, string>
  corpo: unknown
  /** O cabeçalho de autenticação tal como chegou — para provar que foi enviado. */
  apiKey: string | undefined
}

export interface OpcoesDoSimulador {
  apiKey?: string
  chavePartilhada?: string
  merchantExternalId?: string
  /**
   * Os estados que consultas sucessivas devolvem. O último repete-se para
   * sempre. `['PROCESSING', 'PROCESSING', 'SUCCESS']` reproduz um pagamento que
   * demora três sondagens a fechar.
   */
  estados?: string[]
  /**
   * Devolver este `responseCode` em vez de `OK`, por operação. O HTTP continua
   * a ser 200 — que é o ponto: é assim que o BAI comunica erros de negócio.
   */
  codigos?: Partial<Record<Operacao, string>>
  /** Responder com este estatuto HTTP, por operação, sem corpo de negócio. */
  estatutos?: Partial<Record<Operacao, number>>
  /**
   * Assinar as respostas de estado com lixo. Serve para afirmar que o cliente
   * recusa uma resposta cuja origem não consegue provar, mesmo que ela diga
   * `SUCCESS`.
   */
  assinaturaForjada?: boolean
  /** Em que forma se escreve o montante na cadeia assinada. Ver #A-01. */
  formatoDoMontante?: FormatoDeMontante
  /** Não assinar de todo, como um BAI que ainda não tenha o campo. */
  semAssinatura?: boolean
  /** Devolver um corpo que não é JSON. */
  respostaNaoJson?: boolean
  /** Nunca responder, para exercitar o timeout do cliente. */
  mudo?: boolean
}

export interface Simulador {
  /** A `baseUrl` a pôr na configuração do cliente. */
  url: string
  /** Tudo o que chegou, pela ordem em que chegou. */
  pedidos: RegistoDePedido[]
  /** Quantas vezes o estado foi consultado. */
  sondagens: number
  parar(): Promise<void>
}

const PAGAMENTO_BASE = {
  id: 987_654_321,
  nonce: 'n0nc3-de-teste',
  externalReference: 'ENC-1',
  amount: 1500,
  currency: 'AOA',
  lastChangeDate: '2026-08-31T10:00:00Z',
  creationDate: '2026-08-31T09:58:00Z',
  description: 'Compra de teste',
  msisdn: '244923456789',
}

function escreverMontante(valor: number, formato: FormatoDeMontante): string {
  switch (formato) {
    case 'montante-simples':
      return String(valor)
    case 'montante-1-casa':
      return valor.toFixed(1)
    case 'montante-2-casas':
      return valor.toFixed(2)
  }
}

function classificar(metodo: string, caminho: string): Operacao | 'desconhecida' {
  if (caminho.endsWith('/validate')) return 'validarMsisdn'
  if (caminho.endsWith('/cartVatPercentages')) return 'percentagensIva'
  if (caminho.endsWith('/calculateCart')) return 'calcularCarrinho'
  if (caminho.includes('/acceptancePoint/')) return 'pontoDeAceitacao'
  if (caminho.endsWith('/payment/request')) return 'pedirPagamento'
  if (caminho.endsWith('/payment/initiate')) return 'iniciarOtp'
  if (caminho.endsWith('/payment/captive')) return 'criarCativo'
  if (caminho.endsWith('/payment/captive/confirm')) return 'confirmarCativo'
  if (caminho.endsWith('/payment/captive/cancel')) return 'anularCativo'
  if (caminho.endsWith('/qrCode')) return 'qrCode'
  if (metodo === 'GET' && caminho.endsWith('/rest/partners/external/payment')) return 'estado'
  return 'desconhecida'
}

async function lerCorpo(req: IncomingMessage): Promise<unknown> {
  const pedacos: Buffer[] = []
  for await (const pedaco of req) pedacos.push(pedaco as Buffer)

  const texto = Buffer.concat(pedacos).toString('utf8')
  if (texto.trim() === '') return null

  try {
    return JSON.parse(texto)
  } catch {
    return texto
  }
}

/**
 * Levanta o simulador numa porta livre.
 *
 * A porta é sempre `0` — o sistema escolhe uma que esteja livre. Uma porta fixa
 * num teste é um teste que falha quando dois correm ao mesmo tempo, e essa
 * falha aparece como um erro da integração.
 */
export async function iniciarSimulador(opcoes: OpcoesDoSimulador = {}): Promise<Simulador> {
  const apiKey = opcoes.apiKey ?? 'CHAVE-DE-TESTE'
  const chavePartilhada = opcoes.chavePartilhada ?? 'SEGREDO-DE-TESTE'
  const merchantExternalId = opcoes.merchantExternalId ?? 'MERCH-TESTE'
  const estados = opcoes.estados ?? ['SUCCESS']
  const formato = opcoes.formatoDoMontante ?? 'montante-simples'

  const pedidos: RegistoDePedido[] = []
  const estado = { sondagens: 0 }

  const assinar = (pagamento: typeof PAGAMENTO_BASE): string | undefined => {
    if (opcoes.semAssinatura) return undefined
    if (opcoes.assinaturaForjada) return 'f'.repeat(64)

    const cadeia = [
      String(pagamento.id),
      pagamento.nonce,
      pagamento.externalReference,
      escreverMontante(pagamento.amount, formato),
      pagamento.lastChangeDate,
      merchantExternalId,
    ].join('|')

    return createHmac('sha256', chavePartilhada).update(cadeia, 'utf8').digest('hex')
  }

  const servidor: Server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://simulador')
    const operacao = classificar(req.method ?? 'GET', url.pathname)
    const corpo = await lerCorpo(req)

    pedidos.push({
      operacao,
      metodo: req.method ?? 'GET',
      caminho: url.pathname,
      query: Object.fromEntries(url.searchParams),
      corpo,
      apiKey: req.headers['x-mp-apikey'] as string | undefined,
    })

    if (opcoes.mudo) return // deixa o cliente esgotar o timeout

    const responder = (estatuto: number, conteudo: unknown) => {
      res.writeHead(estatuto, { 'content-type': 'application/json' })
      res.end(typeof conteudo === 'string' ? conteudo : JSON.stringify(conteudo))
    }

    if (opcoes.respostaNaoJson) {
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end('<html><body>Gateway Timeout</body></html>')
      return
    }

    // A chave errada é 401 — e o cliente tem de a traduzir para INVALID_API_KEY,
    // porque a especificação não declara corpo nenhum para os erros HTTP (#C-10).
    if (req.headers['x-mp-apikey'] !== apiKey) {
      return responder(401, { error: 'Unauthorized' })
    }

    const estatutoForcado = operacao !== 'desconhecida' ? opcoes.estatutos?.[operacao] : undefined
    if (estatutoForcado !== undefined) {
      return responder(estatutoForcado, { error: `forçado ${estatutoForcado}` })
    }

    const codigo = (operacao !== 'desconhecida' ? opcoes.codigos?.[operacao] : undefined) ?? 'OK'
    const cabecalho = { responseCode: codigo, message: codigo === 'OK' ? 'Success' : codigo }

    // Um código de erro fecha a resposta aqui: o BAI não manda dados úteis
    // quando recusa. É esse o caso que o cliente tem de apanhar dentro do 200.
    if (codigo !== 'OK' && operacao !== 'percentagensIva' && operacao !== 'calcularCarrinho') {
      return responder(200, cabecalho)
    }

    switch (operacao) {
      case 'validarMsisdn':
        return responder(200, { ...cabecalho, valid: true })

      // As duas operações sem `responseCode` na especificação (#C-09).
      case 'percentagensIva':
        return responder(200, {
          cartItemVatPercentageViewList: [
            { id: 1, description: 'Isento', value: 0 },
            { id: 3, description: 'IVA 14%', value: 14 },
          ],
        })

      case 'calcularCarrinho': {
        const enviado = (corpo as any)?.shoppingCart ?? {}
        const linhas: any[] = enviado.items ?? []
        const semIva = linhas.reduce(
          (soma, l) => soma + (l.amountPerItem ?? 0) * (l.count ?? 0) - (l.discount ?? 0),
          0
        )
        const iva = linhas.reduce((soma, l) => {
          const base = (l.amountPerItem ?? 0) * (l.count ?? 0) - (l.discount ?? 0)
          return soma + (base * (l.vatPercentage?.value ?? 0)) / 100
        }, 0)

        return responder(200, {
          shoppingCart: {
            items: linhas.map((l, i) => ({ ...l, id: i + 1 })),
            totalCartItems: linhas.length,
            totalCartAmount: Math.round(semIva * 100) / 100,
            totalCartDiscount: linhas.reduce((s, l) => s + (l.discount ?? 0), 0),
            totalCartAmountWithVat: Math.round((semIva + iva) * 100) / 100,
            totalCartAmountWithVatGroups: {},
          },
        })
      }

      case 'pontoDeAceitacao':
        return responder(200, { ...cabecalho, friendlyName: 'Loja Central — Balcão 1' })

      case 'pedirPagamento':
        return responder(200, {
          ...cabecalho,
          paymentId: PAGAMENTO_BASE.id,
          expirationDate: '2026-08-31T23:59:59Z',
        })

      case 'iniciarOtp':
        return responder(200, {
          ...cabecalho,
          paymentId: PAGAMENTO_BASE.id,
          confirmationUrl: 'https://ib.bancobai.ao/otp/abc123',
        })

      case 'criarCativo':
      case 'confirmarCativo':
      case 'anularCativo':
        return responder(200, { ...cabecalho, paymentId: PAGAMENTO_BASE.id })

      case 'qrCode':
        return responder(200, {
          ...cabecalho,
          imageExtension: 'png',
          // Um PNG de 1×1 transparente. Chega para provar que o `data:` URI sai
          // montado; não interessa o que a imagem mostra.
          encodeToString:
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        })

      case 'estado': {
        const indice = Math.min(estado.sondagens, estados.length - 1)
        estado.sondagens++

        const pagamento = {
          ...PAGAMENTO_BASE,
          externalReference: url.searchParams.get('externalReference') ?? PAGAMENTO_BASE.externalReference,
        }

        return responder(200, {
          ...cabecalho,
          payment: {
            ...pagamento,
            status: estados[indice],
            statusDescription: estados[indice],
            merchant: { id: 1, externalId: merchantExternalId, name: 'Loja de Teste' },
            signature: assinar(pagamento),
          },
        })
      }

      default:
        return responder(404, { error: 'Not found' })
    }
  })

  await new Promise<void>((resolver) => servidor.listen(0, '127.0.0.1', resolver))
  const porta = (servidor.address() as AddressInfo).port

  return {
    // `http` e não `https` de propósito: um certificado auto-assinado num teste
    // obriga a desligar a verificação de TLS no processo inteiro, e isso é uma
    // porta que fica aberta muito depois de o teste acabar. A `baseUrl` chega ao
    // cliente por `definirConfiguracao()`, que não passa pela validação do
    // ambiente — é exactamente para isto que essa porta existe.
    url: `http://127.0.0.1:${porta}`,
    pedidos,
    get sondagens() {
      return estado.sondagens
    },
    parar: () =>
      new Promise<void>((resolver) => {
        // `close()` sozinho espera que as ligações abertas terminem — e no teste
        // do timeout há de propósito uma que nunca termina. Sem isto, o teste
        // passa e a suite fica pendurada a seguir.
        servidor.closeAllConnections()
        servidor.close(() => resolver())
      }),
  }
}
