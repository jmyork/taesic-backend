/**
 * O transporte.
 *
 * ── Porque é que isto não usa `fetch()` ───────────────────────────────────────
 *
 * Porque quatro dos sete serviços — `obterEstado`, `listarFacturas`,
 * `consultarFactura` e `listarSeries` — são definidos como **GET com um corpo
 * JSON**, e o `fetch()` do Node recusa-se a fazê-lo:
 *
 *     TypeError: Request with GET/HEAD method cannot have body.
 *
 * Não é uma limitação do Node: a especificação do Fetch proíbe-o. Mas o HTTP/1.1
 * não proíbe, e é isso que o documento da AGT pede. O `node:http` faz o que lhe
 * mandam, e é por isso que está aqui em vez do `fetch()`.
 *
 * Isto não resolve o problema todo. Um corpo em GET atravessa mal a
 * infra-estrutura real: proxies, WAFs, balanceadores e caches descartam-no com
 * frequência — e quando o descartam, o pedido chega à AGT vazio e volta com um
 * erro de estrutura que não diz que o corpo se perdeu pelo caminho. Daí as três
 * estratégias de `configuracao.estrategiaGet`: quando `corpo-em-get` falhar
 * contra o ambiente deles, há duas alternativas prontas e o diagnóstico já está
 * escrito. Ver `DIVERGENCIAS.md` #T-01.
 */

import { request as pedidoHttp } from 'node:http'
import { request as pedidoHttps } from 'node:https'
import type { EstrategiaGet } from '../configuracao.js'

export type TipoDeFalha = 'timeout' | 'rede' | 'resposta-nao-json'

export class ErroDeTransporte extends Error {
  constructor(
    readonly tipo: TipoDeFalha,
    mensagem: string,
    readonly causa?: unknown
  ) {
    super(mensagem)
    this.name = 'ErroDeTransporte'
  }
}

export interface RespostaHttp {
  status: number
  /** O corpo já em JSON, ou `null` se a resposta veio vazia. */
  corpo: unknown
  /** O corpo tal como chegou — o que se guarda para auditoria. */
  corpoBruto: string
  cabecalhos: Record<string, string | string[] | undefined>
  duracaoMs: number
}

export interface OpcoesDeEnvio {
  url: string
  /** O método que o documento define para o serviço. */
  metodo: 'GET' | 'POST'
  corpo: Record<string, unknown>
  timeoutMs: number
  /** Só se aplica quando `metodo === 'GET'`. */
  estrategiaGet: EstrategiaGet
  cabecalhosExtra?: Record<string, string>
}

/**
 * Achata o envelope na query string.
 *
 * Os campos escalares vão como estão; os objectos (`softwareInfo`) vão como JSON
 * codificado no valor do parâmetro. Não há forma canónica de pôr um objecto
 * aninhado numa query string, e esta pelo menos é reversível. É por isso que
 * `query` é a última das três estratégias e não a primeira: exige que a AGT
 * concorde com uma convenção que o documento não escreve.
 */
function paraQueryString(corpo: Record<string, unknown>): string {
  const params = new URLSearchParams()

  for (const [chave, valor] of Object.entries(corpo)) {
    if (valor === undefined || valor === null) continue

    if (typeof valor === 'object') {
      params.set(chave, JSON.stringify(valor))
    } else {
      params.set(chave, String(valor))
    }
  }

  return params.toString()
}

/**
 * Um pedido HTTP, com corpo em qualquer método.
 *
 * O `timeout` é aplicado em dois sítios porque cobrem coisas diferentes: o
 * `req.setTimeout` mede inactividade do socket, e o temporizador explícito mede
 * o pedido inteiro. Um servidor que envie um byte de dez em dez segundos nunca
 * dispara o primeiro e fica pendurado para sempre sem o segundo.
 */
function executar(
  url: URL,
  metodo: string,
  corpoSerializado: string | null,
  cabecalhos: Record<string, string>,
  timeoutMs: number
): Promise<RespostaHttp> {
  const inicio = Date.now()
  const pedir = url.protocol === 'https:' ? pedidoHttps : pedidoHttp

  return new Promise<RespostaHttp>((resolver, rejeitar) => {
    let resolvido = false

    const terminar = (accao: () => void) => {
      if (resolvido) return
      resolvido = true
      clearTimeout(cronometro)
      accao()
    }

    const req = pedir(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method: metodo,
        headers: cabecalhos,
      },
      (res) => {
        const pedacos: Buffer[] = []
        res.on('data', (p: Buffer) => pedacos.push(p))

        res.on('end', () =>
          terminar(() => {
            const corpoBruto = Buffer.concat(pedacos).toString('utf8')
            let corpo: unknown = null

            if (corpoBruto.trim() !== '') {
              try {
                corpo = JSON.parse(corpoBruto)
              } catch (erro) {
                rejeitar(
                  new ErroDeTransporte(
                    'resposta-nao-json',
                    `O serviço respondeu ${res.statusCode} com um corpo que não é JSON (${corpoBruto.length} bytes).`,
                    erro
                  )
                )
                return
              }
            }

            resolver({
              status: res.statusCode ?? 0,
              corpo,
              corpoBruto,
              cabecalhos: res.headers,
              duracaoMs: Date.now() - inicio,
            })
          })
        )

        res.on('error', (erro) =>
          terminar(() =>
            rejeitar(new ErroDeTransporte('rede', 'A leitura da resposta falhou.', erro))
          )
        )
      }
    )

    const cronometro = setTimeout(() => {
      terminar(() => {
        req.destroy()
        rejeitar(
          new ErroDeTransporte('timeout', `O serviço não respondeu dentro de ${timeoutMs} ms.`)
        )
      })
    }, timeoutMs)

    req.setTimeout(timeoutMs, () => req.destroy())

    req.on('error', (erro: NodeJS.ErrnoException) =>
      terminar(() =>
        rejeitar(
          new ErroDeTransporte(
            erro.code === 'ECONNRESET' || erro.code === 'ETIMEDOUT' ? 'timeout' : 'rede',
            `Não foi possível contactar o serviço (${erro.code ?? erro.message}).`,
            erro
          )
        )
      )
    )

    if (corpoSerializado !== null) req.write(corpoSerializado)
    req.end()
  })
}

export async function enviar(opcoes: OpcoesDeEnvio): Promise<RespostaHttp> {
  const url = new URL(opcoes.url)
  const corpoSerializado = JSON.stringify(opcoes.corpo)

  const cabecalhos: Record<string, string> = {
    Accept: 'application/json',
    ...opcoes.cabecalhosExtra,
  }

  let metodo: string = opcoes.metodo
  let corpoAEnviar: string | null = corpoSerializado

  if (opcoes.metodo === 'GET') {
    switch (opcoes.estrategiaGet) {
      case 'query':
        url.search = paraQueryString(opcoes.corpo)
        corpoAEnviar = null
        break

      case 'post':
        metodo = 'POST'
        // O cabeçalho diz ao servidor que a INTENÇÃO era um GET. É convenção, não
        // norma — só serve se a AGT o reconhecer.
        cabecalhos['X-HTTP-Method-Override'] = 'GET'
        break

      case 'corpo-em-get':
        // Nada a fazer: GET, com corpo, tal como o documento pede.
        break
    }
  }

  if (corpoAEnviar !== null) {
    cabecalhos['Content-Type'] = 'application/json; charset=utf-8'
    cabecalhos['Content-Length'] = String(Buffer.byteLength(corpoAEnviar))
  }

  return executar(url, metodo, corpoAEnviar, cabecalhos, opcoes.timeoutMs)
}
