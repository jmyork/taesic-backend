/**
 * Leitura tolerante das respostas.
 *
 * ── Porque é que isto existe ──────────────────────────────────────────────────
 *
 * Porque o Blueprint descreve cada resposta duas vezes, com nomes diferentes, e
 * nós não sabemos qual das duas o servidor da AGT devolve. Exemplos, todos reais:
 *
 *   listarFacturas   tabela → `documentListResult.documentResultList[]`
 *                    exemplo → `statusFEListResult.resultEntryList[].documentEntryResult`
 *
 *   listarSeries     tabela → `seriesListResult.seriesInfo[]`
 *                    exemplo → o pedido e a resposta estão TROCADOS na secção 1.6.1
 *
 *   confirmar        tabela de saída → `statusFEResult`
 *                    composição      → `confirmRejectResult`
 *                    exemplo         → `statusFEResult` com um `statusResult` dentro
 *
 * Escolher uma e falhar contra a outra dá o mesmo sintoma nos dois casos — um
 * campo `undefined` a meio de um fluxo que já gravou coisas — e obriga a um
 * deploy para descobrir qual era. Ler as duas custa vinte linhas e resolve o
 * problema antes de ele acontecer. Ver `DIVERGENCIAS.md` #C-11, #C-13, #C-15.
 *
 * Nada aqui inventa dados: o que não vier fica `null` e é o chamador que decide.
 */

import type {
  ConfirmRejectResult,
  DocumentListResult,
  ErroDeResposta,
  FacturaListada,
  SerieInfo,
  SeriesListResult,
  StatusFEResult,
  StatusResult,
} from '../contratos/contratos.js'

type Obj = Record<string, any>

function obj(valor: unknown): Obj | null {
  return valor !== null && typeof valor === 'object' && !Array.isArray(valor)
    ? (valor as Obj)
    : null
}

/** O primeiro dos nomes dados que exista no objecto. */
function primeiro(fonte: Obj | null, ...nomes: string[]): any {
  if (!fonte) return undefined
  for (const nome of nomes) {
    if (fonte[nome] !== undefined && fonte[nome] !== null) return fonte[nome]
  }
  return undefined
}

/**
 * Um array que pode vir liso (`[{...}]`) ou com cada item embrulhado numa chave
 * (`[{ documentEntryResult: {...} }]`), que é como os exemplos do documento o
 * mostram.
 *
 * Um OBJECTO solto conta como uma lista de um. Não é tolerância gratuita: as
 * tabelas de saída de 1.2.3, 1.3.3, 1.4.3 e 1.7.3 dizem "Object errorEntry" no
 * singular para os 400/422/429, enquanto 1.1.3 diz "array errorList" para o 400
 * do registarFactura. O mesmo conceito, uma vez em array e outra em objecto, no
 * mesmo documento — e sem isto todos os erros de chamada (E94–E98) eram lidos
 * como lista vazia e reportados como "erro sem detalhe".
 */
function desembrulhar(valor: unknown, ...chaves: string[]): Obj[] {
  const lista = Array.isArray(valor) ? valor : obj(valor) ? [valor] : []

  return lista
    .map((item) => {
      const o = obj(item)
      if (!o) return null
      for (const chave of chaves) {
        const dentro = obj(o[chave])
        if (dentro) return dentro
      }
      return o
    })
    .filter((item): item is Obj => item !== null)
}

/**
 * Descarta o que não tem código de erro.
 *
 * Existe por causa da tolerância acima: quando nem `errorList` nem `errorEntry`
 * estão presentes, quem chama passa o CORPO INTEIRO a `lerErros()` na esperança
 * de que os campos estejam à raiz. Sem este filtro, um corpo que não é um erro
 * produzia um "erro" com código vazio e descrição vazia — pior do que dizer que
 * a resposta não trazia detalhe, porque parece informação.
 */
function comCodigo<T extends { errorCode: string }>(erros: T[]): T[] {
  return erros.filter((e) => e.errorCode.trim() !== '')
}

export function lerErros(valor: unknown): ErroDeResposta[] {
  return comCodigo(
    desembrulhar(valor, 'errorEntry', 'error').map((e) => ({
      errorCode: String(primeiro(e, 'errorCode', 'idError', 'code') ?? ''),
      errorDescription: String(
        primeiro(e, 'errorDescription', 'descriptionError', 'description') ?? ''
      ),
    }))
  )
}

/**
 * `errorList` de `registarFactura` (1.1.3.1), que tem um `documentNo` a mais e
 * usa `idError`/`descriptionError` em vez de `errorCode`/`errorDescription`.
 */
export function lerErrosDeEntrada(
  valor: unknown
): Array<ErroDeResposta & { documentNo: string | null }> {
  return comCodigo(
    desembrulhar(valor, 'errorEntry', 'error').map((e) => {
      // `primeiro()` já salta valores nulos, portanto `undefined` cobre os dois
      // casos — e lido uma vez só, em vez de duas vezes com o resultado a poder
      // divergir se a fonte for um getter.
      const documentNo = primeiro(e, 'documentNo')

      return {
        errorCode: String(primeiro(e, 'idError', 'errorCode', 'code') ?? ''),
        errorDescription: String(
          primeiro(e, 'descriptionError', 'errorDescription', 'description') ?? ''
        ),
        documentNo: documentNo === undefined ? null : String(documentNo),
      }
    })
  )
}

/**
 * `requestID` de `registarFactura`.
 *
 * A tabela 1.1.3 diz que o 200 devolve "string requestID" — o que se lê tanto
 * como `{"requestID": "..."}` quanto como a string nua. As duas são aceites.
 */
export function lerRequestId(corpo: unknown): string | null {
  if (typeof corpo === 'string' && corpo.trim() !== '') return corpo.trim()

  const raiz = obj(corpo)
  const valor = primeiro(raiz, 'requestID', 'requestId', 'idRequest')

  return valor === undefined ? null : String(valor)
}

export function lerStatusResult(corpo: unknown): StatusResult | null {
  const raiz = obj(corpo)
  const alvo = obj(primeiro(raiz, 'statusResult')) ?? raiz

  if (!alvo || primeiro(alvo, 'resultCode') === undefined) return null

  const lista = primeiro(alvo, 'documentStatusList', 'documentStatus', 'documents')

  return {
    requestID: String(primeiro(alvo, 'requestID', 'requestId') ?? ''),
    resultCode: Number(primeiro(alvo, 'resultCode')) as StatusResult['resultCode'],
    documentStatusList:
      lista === undefined
        ? null
        : desembrulhar(lista, 'documentStatus', 'documentStatusEntry').map((d) => ({
            documentNo: String(primeiro(d, 'documentNo') ?? ''),
            documentStatus: String(primeiro(d, 'documentStatus') ?? '') as 'V' | 'I',
            errorList: d.errorList === undefined ? null : lerErros(d.errorList),
          })),
  }
}

export function lerListaDeFacturas(corpo: unknown): DocumentListResult | null {
  const raiz = obj(corpo)
  const alvo = obj(primeiro(raiz, 'documentListResult', 'statusFEListResult')) ?? raiz

  if (!alvo) return null

  const bruta = primeiro(alvo, 'documentResultList', 'resultEntryList', 'documents')
  if (bruta === undefined) return null

  const itens: FacturaListada[] = desembrulhar(bruta, 'documentEntryResult', 'documentResult').map(
    (d) => ({
      documentNo: String(primeiro(d, 'documentNo') ?? ''),
      documentDate: String(primeiro(d, 'documentDate') ?? ''),
    })
  )

  const contagem = primeiro(alvo, 'documentResultCount', 'resultCount')

  return {
    // Se a contagem não vier, a que vale é o comprimento do array — nunca o
    // contrário. Uma contagem declarada que não bate com os itens recebidos é
    // um sinal de resposta truncada, e quem chama tem de o poder ver: por isso
    // preserva-se o valor declarado em vez de o substituir pelo comprimento.
    documentResultCount: contagem === undefined ? itens.length : Number(contagem),
    documentResultList: itens,
  }
}

export function lerFacturaConsultada(corpo: unknown): StatusFEResult | null {
  const raiz = obj(corpo)
  const alvo = obj(primeiro(raiz, 'statusFEResult', 'statusResult')) ?? raiz

  if (!alvo) return null

  const bruta = primeiro(alvo, 'documents', 'document')
  if (bruta === undefined) return null

  // `documents` é um array (1.4.3.1), mas o exemplo mostra um `document` único.
  const lista = Array.isArray(bruta) ? bruta : [bruta]

  return {
    documentNo: String(primeiro(alvo, 'documentNo') ?? ''),
    documents: desembrulhar(lista, 'document') as StatusFEResult['documents'],
  }
}

/** `resultCode` de `solicitarSerie`: 1 = sucesso, 0 = insucesso. */
export function lerResultadoDaSerie(corpo: unknown): number | null {
  const raiz = obj(corpo)
  const valor = primeiro(raiz, 'resultCode')

  if (valor === undefined) return null

  const numero = Number(valor)
  return Number.isFinite(numero) ? numero : null
}

export function lerListaDeSeries(corpo: unknown): SeriesListResult | null {
  const raiz = obj(corpo)
  const alvo = obj(primeiro(raiz, 'seriesListResult', 'statusSeriesListResult')) ?? raiz

  if (!alvo) return null

  const bruta = primeiro(alvo, 'seriesInfo', 'seriesResultList', 'series')
  if (bruta === undefined) return null

  const itens = desembrulhar(bruta, 'seriesInfo', 'seriesEntry') as unknown as SerieInfo[]
  const contagem = primeiro(alvo, 'seriesResultCount', 'resultCount')

  return {
    seriesResultCount: contagem === undefined ? itens.length : Number(contagem),
    seriesInfo: itens,
  }
}

export function lerConfirmarRejeitar(corpo: unknown): ConfirmRejectResult | null {
  const raiz = obj(corpo)
  const alvo = obj(primeiro(raiz, 'confirmRejectResult', 'statusFEResult')) ?? raiz

  if (!alvo) return null

  const codigo = primeiro(alvo, 'actionResultCode')
  if (codigo === undefined) return null

  return {
    actionResultCode: String(codigo) as ConfirmRejectResult['actionResultCode'],
    errorList: alvo.errorList === undefined ? null : lerErros(alvo.errorList),
  }
}
