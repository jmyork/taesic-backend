/**
 * O transporte.
 *
 * ── Porque é que isto usa `fetch()` e o do MINFIN não ─────────────────────────
 *
 * Porque o BAI Paga é uma API REST normal: os POST levam o corpo em JSON, os
 * GET levam os parâmetros na query string, e nenhum dos onze endpoints pede um
 * corpo num GET. O `minfin-integration/transporte/http.ts` teve de descer ao
 * `node:http` por causa disso; aqui não há nada que o `fetch()` não faça, e o
 * `fetch()` traz o `AbortSignal.timeout` já feito.
 *
 * Os dois módulos continuam a não partilhar transporte de propósito. São duas
 * integrações independentes com dois terceiros independentes, e um `http.ts`
 * comum seria a primeira peça a acumular condições para servir os dois — até que
 * mudar uma coisa para o BAI parte a facturação electrónica.
 *
 * ── O que este ficheiro NUNCA faz ─────────────────────────────────────────────
 *
 * Escrever a `apiKey` em lado nenhum que possa vir a ser lido. `cabecalhosSeguros()`
 * é o que sai daqui para o registo, e não devolve o cabeçalho de autenticação —
 * um pedido guardado para auditoria com a credencial lá dentro é a credencial
 * publicada em toda a gente que tenha acesso aos registos.
 */

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
  /**
   * O corpo tal como chegou.
   *
   * Guardado por duas razões, e a segunda não é óbvia: além da auditoria, é a
   * única forma de ver a grafia ORIGINAL dos números. O `JSON.parse` transforma
   * `1500.00` em `1500` e a forma perde-se — e é dessa forma que depende a
   * verificação da assinatura (ver `assinatura/hmac.ts`).
   */
  corpoBruto: string
  cabecalhos: Record<string, string>
  duracaoMs: number
}

export interface OpcoesDeEnvio {
  /** URL absoluto, já com o caminho do endpoint. */
  url: string
  metodo: 'GET' | 'POST'
  /** Só em POST. */
  corpo?: Record<string, unknown>
  /** Só em GET. Valores `undefined` e `null` são omitidos. */
  query?: Record<string, string | number | undefined | null>
  apiKey: string
  timeoutMs: number
}

/** O nome do cabeçalho de autenticação, escrito uma vez só. */
export const CABECALHO_API_KEY = 'X-MP-ApiKey'

/**
 * Os cabeçalhos que se podem registar.
 *
 * Devolve tudo menos o de autenticação, e no lugar dele deixa uma marca — para
 * que quem lê um registo veja que a chave FOI enviada, sem ver qual.
 */
export function cabecalhosSeguros(cabecalhos: Record<string, string>): Record<string, string> {
  const seguros: Record<string, string> = {}

  for (const [nome, valor] of Object.entries(cabecalhos)) {
    seguros[nome] = nome.toLowerCase() === CABECALHO_API_KEY.toLowerCase() ? '<omitida>' : valor
  }

  return seguros
}

function montarUrl(base: string, query?: OpcoesDeEnvio['query']): string {
  const url = new URL(base)

  for (const [chave, valor] of Object.entries(query ?? {})) {
    if (valor === undefined || valor === null) continue
    url.searchParams.set(chave, String(valor))
  }

  return url.toString()
}

export async function enviar(opcoes: OpcoesDeEnvio): Promise<RespostaHttp> {
  const inicio = Date.now()
  const url = montarUrl(opcoes.url, opcoes.query)

  const cabecalhos: Record<string, string> = {
    Accept: 'application/json',
    [CABECALHO_API_KEY]: opcoes.apiKey,
  }

  let corpoSerializado: string | undefined
  if (opcoes.metodo === 'POST') {
    corpoSerializado = JSON.stringify(opcoes.corpo ?? {})
    cabecalhos['Content-Type'] = 'application/json; charset=utf-8'
  }

  let resposta: Response

  try {
    resposta = await fetch(url, {
      method: opcoes.metodo,
      headers: cabecalhos,
      body: corpoSerializado,
      signal: AbortSignal.timeout(opcoes.timeoutMs),
      // Um 3xx numa API de pagamentos não é uma mudança de morada — é sinal de
      // que se está a falar com outra coisa (um portal de captura, uma página de
      // erro). Segui-lo em silêncio mandaria a `apiKey` para o destino do
      // redireccionamento.
      redirect: 'manual',
    })
  } catch (erro: any) {
    const expirou = erro?.name === 'TimeoutError' || erro?.name === 'AbortError'

    throw new ErroDeTransporte(
      expirou ? 'timeout' : 'rede',
      expirou
        ? `O BAI não respondeu dentro de ${opcoes.timeoutMs} ms.`
        : `Não foi possível contactar o BAI (${erro?.cause?.code ?? erro?.message ?? 'erro de rede'}).`,
      erro
    )
  }

  const corpoBruto = await resposta.text()
  let corpo: unknown = null

  if (corpoBruto.trim() !== '') {
    try {
      corpo = JSON.parse(corpoBruto)
    } catch (erro) {
      throw new ErroDeTransporte(
        'resposta-nao-json',
        `O BAI respondeu ${resposta.status} com um corpo que não é JSON (${corpoBruto.length} bytes).`,
        erro
      )
    }
  }

  const cabecalhosRecebidos: Record<string, string> = {}
  resposta.headers.forEach((valor, nome) => {
    cabecalhosRecebidos[nome] = valor
  })

  return {
    status: resposta.status,
    corpo,
    corpoBruto,
    cabecalhos: cabecalhosRecebidos,
    duracaoMs: Date.now() - inicio,
  }
}
