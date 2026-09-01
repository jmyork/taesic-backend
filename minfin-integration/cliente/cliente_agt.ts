/**
 * `ClienteAgt` — a classe que trata da integração.
 *
 * Um objecto, sete métodos, um por serviço do Blueprint. Monta o envelope,
 * assina, valida localmente, envia, e devolve sempre a mesma forma de resultado.
 *
 * ── A decisão que molda tudo o resto: isto NÃO lança por falha da AGT ─────────
 *
 * Um serviço do Estado em baixo, um timeout, um 429 — nada disso é uma excepção
 * neste código. São respostas, com o mesmo estatuto de uma resposta boa, e vêm
 * num `Resultado` que quem chama tem de abrir.
 *
 * A razão é a mesma que já está escrita em `app/repositories/nif_repository.ts`
 * deste projecto: quem chama isto está a meio de uma venda. Se a integração
 * lançar, o `try/catch` mais próximo decide o destino da factura — e o mais
 * próximo é quase sempre um que não sabe nada de facturação electrónica. Com um
 * `Resultado`, a decisão "gravar como pendente e tentar mais tarde" fica onde
 * tem de ficar, e o TypeScript obriga a tomá-la.
 *
 * Lança em dois casos, os dois de programação e não de operação: configuração
 * inválida (`configuracao.ts`) e assinatura pedida sem chave (`assinatura/jws.ts`).
 */

import { randomUUID } from 'node:crypto'
import { configuracao as lerConfiguracao, type ConfiguracaoMinfin } from '../configuracao.js'
import type {
  ConfirmRejectResult,
  Documento,
  DocumentListResult,
  EnvelopeComum,
  PedidoConfirmarRejeitar,
  PedidoConsultarFactura,
  PedidoListarFacturas,
  PedidoListarSeries,
  PedidoObterEstado,
  PedidoRegistarFactura,
  PedidoSolicitarSerie,
  SeriesListResult,
  SoftwareInfo,
  SoftwareInfoDetalhes,
  StatusFEResult,
  StatusResult,
} from '../contratos/contratos.js'
import {
  descreverErro,
  descreverErroDeChamada,
  erroEhTransitorio,
  type Servico,
} from '../dominio/codigos_erro.js'
import type { AccaoAdquirente, EstadoSerie } from '../dominio/estados.js'
import type { TipoDocumento } from '../dominio/tipos_documento.js'
import {
  JwsCompactoRs256,
  payloadConfirmarRejeitar,
  payloadConsultarFactura,
  payloadDocumento,
  payloadListarFacturas,
  payloadListarSeries,
  payloadObterEstado,
  payloadSoftware,
  payloadSolicitarSerie,
  verificarComprimento,
  type EstrategiaDeAssinatura,
} from '../assinatura/jws.js'
import {
  lerConfirmarRejeitar,
  lerErros,
  lerErrosDeEntrada,
  lerFacturaConsultada,
  lerListaDeFacturas,
  lerListaDeSeries,
  lerRequestId,
  lerResultadoDaSerie,
  lerStatusResult,
} from './normalizacao.js'
import { enviar, ErroDeTransporte } from '../transporte/http.js'
import {
  validarConfirmarRejeitar,
  validarConsultarFactura,
  validarListarFacturas,
  validarObterEstado,
  validarRegistarFactura,
  validarSolicitarSerie,
  type Violacao,
} from '../validacao/regras.js'

/* ────────────────────────────────────────────────────────────────────────────
 * Resultado
 * ──────────────────────────────────────────────────────────────────────────── */

export interface ErroNormalizado {
  codigo: string
  /** A descrição da AGT quando ela mandou uma; a do catálogo quando não mandou. */
  descricao: string
  /** Caminho do campo, quando a falha foi apanhada localmente. */
  campo?: string
  documentNo?: string
  /** Vale a pena repetir a chamada mais tarde com o mesmo conteúdo? */
  transitorio: boolean
}

export type TipoDeFalhaDeChamada =
  /** O pedido nem chegou a sair: falhou a validação local. */
  | 'validacao-local'
  /** A AGT respondeu, e recusou. Repetir com o mesmo conteúdo dá o mesmo. */
  | 'recusado'
  /** Não houve resposta: rede, timeout, serviço em baixo. Repetir mais tarde. */
  | 'indisponivel'
  /** Houve resposta, mas não é a que o documento descreve. */
  | 'resposta-invalida'

export interface Sucesso<T> {
  ok: true
  dados: T
  httpStatus: number
  duracaoMs: number
  avisos: string[]
  /** O que foi enviado — para gravar em `minfin_submissao`. */
  pedido: Record<string, unknown>
  /** O que voltou, tal como voltou. */
  respostaBruta: string
}

export interface Falha {
  ok: false
  tipo: TipoDeFalhaDeChamada
  erros: ErroNormalizado[]
  httpStatus: number | null
  duracaoMs: number
  avisos: string[]
  pedido: Record<string, unknown>
  respostaBruta: string | null
  /** Vale a pena repetir? Verdadeiro para `indisponivel` e para erros transitórios. */
  repetivel: boolean
}

export type Resultado<T> = Sucesso<T> | Falha

/* ────────────────────────────────────────────────────────────────────────────
 * Cliente
 * ──────────────────────────────────────────────────────────────────────────── */

/** Um documento tal como o chamador o entrega: sem a assinatura, que é nossa. */
export type DocumentoParaRegisto = Omit<Documento, 'jwsDocumentSignature'>

export interface OpcoesDoCliente {
  configuracao?: ConfiguracaoMinfin
  assinatura?: EstrategiaDeAssinatura
  /** Injectável para os testes das regras que dependem da data (E33). */
  relogio?: () => Date
  /** Injectável para tornar os payloads reproduzíveis nos testes. */
  gerarId?: () => string
}

export class ClienteAgt {
  private readonly cfg: ConfiguracaoMinfin
  private readonly assinatura: EstrategiaDeAssinatura
  private readonly relogio: () => Date
  private readonly gerarId: () => string

  constructor(opcoes: OpcoesDoCliente = {}) {
    this.cfg = opcoes.configuracao ?? lerConfiguracao()
    this.assinatura = opcoes.assinatura ?? new JwsCompactoRs256()
    this.relogio = opcoes.relogio ?? (() => new Date())
    this.gerarId = opcoes.gerarId ?? randomUUID
  }

  /* ── Envelope ─────────────────────────────────────────────────────────── */

  private detalhesDoSoftware(): SoftwareInfoDetalhes {
    const { nome, versao, numeroCertificacao } = this.cfg.software

    return this.cfg.nomenclatura === 'exemplos'
      ? { softwareName: nome, softwareVersion: versao, softwareValidationNo: numeroCertificacao }
      : { productId: nome, productVersion: versao, softwareValidationNumber: numeroCertificacao }
  }

  private softwareInfo(avisos: string[]): SoftwareInfo {
    const detalhes = this.detalhesDoSoftware()
    const jws = this.assinatura.assinar(payloadSoftware(detalhes), this.cfg.chavePrivadaProdutor)

    this.registarAvisoDeComprimento('jwsSoftwareSignature', jws, avisos)

    return this.cfg.nomenclatura === 'exemplos'
      ? { softwareInfoDetails: detalhes, jwsSoftwareSignature: jws }
      : { softwareInfoDetail: detalhes, jwsSoftwareSignature: jws }
  }

  private registarAvisoDeComprimento(campo: string, valor: string, avisos: string[]): void {
    const diagnostico = verificarComprimento(valor)
    if (diagnostico.aviso) avisos.push(`${campo}: ${diagnostico.aviso}`)
  }

  /**
   * O cabeçalho comum. `submissionGUID` ou `submissionId` consoante a
   * nomenclatura configurada — nunca os dois, porque enviar os dois é a forma
   * mais rápida de descobrir que o servidor valida "campo não esperado".
   */
  private envelope(avisos: string[]): EnvelopeComum {
    const base = {
      schemaVersion: this.cfg.schemaVersion,
      taxRegistrationNumber: this.cfg.nif,
      submissionTimeStamp: this.relogio()
        .toISOString()
        .replace(/\.\d{3}Z$/, 'Z'),
      softwareInfo: this.softwareInfo(avisos),
    }

    return this.cfg.nomenclatura === 'exemplos'
      ? { ...base, submissionGUID: this.gerarId() }
      : { ...base, submissionId: this.gerarSubmissionId() }
  }

  /**
   * `xxxxx-99999999-9999`: cinco letras, oito dígitos, quatro dígitos.
   *
   * O documento diz que este identificador é "fornecido pelo barramento" — ou
   * seja, em rigor não é nosso para gerar. Geramos um que respeita o formato
   * porque o pedido não sai sem ele e o documento não descreve como pedi-lo ao
   * barramento. Ver `DIVERGENCIAS.md` #C-16.
   */
  private gerarSubmissionId(): string {
    const letras = Array.from({ length: 5 }, () =>
      String.fromCharCode(65 + Math.floor(Math.random() * 26))
    ).join('')

    const agora = this.relogio()
    const data = `${agora.getFullYear()}${String(agora.getMonth() + 1).padStart(2, '0')}${String(agora.getDate()).padStart(2, '0')}`
    const sequencia = String(Math.floor(Math.random() * 10_000)).padStart(4, '0')

    return `${letras}-${data}-${sequencia}`
  }

  private assinarChamada(payload: Record<string, unknown>, avisos: string[]): string {
    const jws = this.assinatura.assinar(payload, this.cfg.chavePrivadaEmissor)
    this.registarAvisoDeComprimento('jwsSignature', jws, avisos)
    return jws
  }

  /**
   * Assina um documento com a chave do emissor, sobre os oito campos que o
   * Blueprint nomeia (1.1.2.4).
   *
   * Público de propósito: quem quiser guardar a assinatura junto da factura
   * interna, ou reconstruí-la para conferir uma submissão antiga, precisa disto
   * sem passar por uma chamada de rede.
   */
  assinarDocumento(documento: DocumentoParaRegisto, avisos: string[] = []): Documento {
    const jws = this.assinatura.assinar(
      payloadDocumento(documento, this.cfg.nif),
      this.cfg.chavePrivadaEmissor
    )

    this.registarAvisoDeComprimento(`jwsDocumentSignature (${documento.documentNo})`, jws, avisos)

    return { ...documento, jwsDocumentSignature: jws }
  }

  /* ── Execução comum ───────────────────────────────────────────────────── */

  private falhaDeValidacao(
    violacoes: Violacao[],
    servico: Servico,
    pedido: Record<string, unknown>,
    avisos: string[]
  ): Falha {
    return {
      ok: false,
      tipo: 'validacao-local',
      httpStatus: null,
      duracaoMs: 0,
      avisos,
      pedido,
      respostaBruta: null,
      repetivel: false,
      erros: violacoes.map((v) => ({
        codigo: v.idError,
        // A frase local é mais útil que a do catálogo — diz o campo e o valor.
        // A do catálogo fica como fundo para os códigos sem frase própria.
        descricao: v.detalhe || descreverErro(servico, v.idError) || 'Erro de validação.',
        campo: v.campo,
        documentNo: v.documentNo,
        transitorio: false,
      })),
    }
  }

  /**
   * Faz a chamada e classifica a resposta.
   *
   * `interpretar` só corre quando o HTTP foi 2xx — assim cada serviço só escreve
   * a leitura do caso bom, e todo o tratamento de erro (rede, timeout, 4xx, 5xx,
   * corpo que não é o esperado) está aqui uma vez só.
   */
  private async chamar<T>(
    servico: Servico,
    metodo: 'GET' | 'POST',
    pedido: Record<string, unknown>,
    avisos: string[],
    interpretar: (corpo: unknown) => T | null
  ): Promise<Resultado<T>> {
    let resposta: Awaited<ReturnType<typeof enviar>>

    try {
      resposta = await enviar({
        url: `${this.cfg.baseUrl}/${servico}/`,
        metodo,
        corpo: pedido,
        timeoutMs: this.cfg.timeoutMs,
        estrategiaGet: this.cfg.estrategiaGet,
      })
    } catch (erro) {
      const transporte = erro instanceof ErroDeTransporte ? erro : null

      return {
        ok: false,
        tipo: transporte?.tipo === 'resposta-nao-json' ? 'resposta-invalida' : 'indisponivel',
        httpStatus: null,
        duracaoMs: 0,
        avisos,
        pedido,
        respostaBruta: null,
        // Uma resposta que não é JSON não melhora por se repetir o pedido.
        repetivel: transporte?.tipo !== 'resposta-nao-json',
        erros: [
          {
            codigo: 'E99',
            descricao:
              transporte?.message ??
              'Não foi possível contactar o serviço de facturação electrónica.',
            transitorio: transporte?.tipo !== 'resposta-nao-json',
          },
        ],
      }
    }

    const base = {
      httpStatus: resposta.status,
      duracaoMs: resposta.duracaoMs,
      avisos,
      pedido,
      respostaBruta: resposta.corpoBruto,
    }

    if (resposta.status >= 200 && resposta.status < 300) {
      const dados = interpretar(resposta.corpo)

      if (dados === null) {
        return {
          ok: false,
          tipo: 'resposta-invalida',
          repetivel: false,
          erros: [
            {
              codigo: 'E99',
              descricao:
                `O serviço respondeu ${resposta.status} mas o corpo não tem a forma que o Blueprint descreve para ${servico}. ` +
                'A resposta completa foi guardada para diagnóstico.',
              transitorio: false,
            },
          ],
          ...base,
        }
      }

      return { ok: true, dados, ...base }
    }

    return {
      ok: false,
      tipo: 'recusado',
      ...this.erroDeResposta(servico, resposta.status, resposta.corpo),
      ...base,
    }
  }

  /**
   * Extrai os erros de uma resposta não-2xx.
   *
   * Três formas possíveis, todas no documento: `errorList` de `registarFactura`
   * (com `idError`/`documentNo`), `errorList` dos restantes (com `errorCode`), e
   * o `errorEntry` solto das respostas 400/422/429. Nenhuma resposta traz as
   * três, e é por isso que se tenta pela ordem do mais específico para o mais
   * genérico.
   */
  private erroDeResposta(
    servico: Servico,
    status: number,
    corpo: unknown
  ): { erros: ErroNormalizado[]; repetivel: boolean } {
    const deEntrada = lerErrosDeEntrada((corpo as any)?.errorList)

    const brutos =
      deEntrada.length > 0
        ? deEntrada
        : lerErros((corpo as any)?.errorList ?? (corpo as any)?.errorEntry ?? corpo).map((e) => ({
            ...e,
            documentNo: null as string | null,
          }))

    if (brutos.length === 0) {
      return {
        repetivel: status === 429 || status >= 500,
        erros: [
          {
            codigo: 'E99',
            descricao: `O serviço respondeu ${status} sem detalhar o erro.`,
            transitorio: status === 429 || status >= 500,
          },
        ],
      }
    }

    const erros = brutos.map((e) => {
      const transitorio = erroEhTransitorio(e.errorCode, status)

      return {
        codigo: e.errorCode,
        descricao:
          e.errorDescription ||
          descreverErroDeChamada(e.errorCode, status) ||
          descreverErro(servico, e.errorCode) ||
          `Erro ${e.errorCode} devolvido pelo serviço.`,
        documentNo: e.documentNo ?? undefined,
        transitorio,
      }
    })

    return { erros, repetivel: erros.some((e) => e.transitorio) || status >= 500 }
  }

  /* ── 1.1 registarFactura ──────────────────────────────────────────────── */

  /**
   * Monta o pedido sem o enviar. Público para o simulador, para os testes e para
   * quem quiser inspeccionar exactamente o que vai sair antes de sair.
   */
  prepararRegisto(documentos: DocumentoParaRegisto[]): {
    pedido: PedidoRegistarFactura
    avisos: string[]
  } {
    const avisos: string[] = []
    const assinados = documentos.map((d) => this.assinarDocumento(d, avisos))

    return {
      pedido: {
        ...this.envelope(avisos),
        numberOfEntries: assinados.length,
        documents: assinados,
      },
      avisos,
    }
  }

  /**
   * Submete facturas para registo. Assíncrono do lado da AGT: o `requestID` que
   * volta não diz que as facturas são válidas, só que o pedido foi aceite. O
   * veredicto vem de `obterEstado`.
   */
  async registarFacturas(
    documentos: DocumentoParaRegisto[]
  ): Promise<Resultado<{ requestID: string }>> {
    const { pedido, avisos } = this.prepararRegisto(documentos)
    const violacoes = validarRegistarFactura(pedido, this.cfg)

    if (violacoes.length > 0) {
      return this.falhaDeValidacao(violacoes, 'registarFactura', pedido as any, avisos)
    }

    return this.chamar('registarFactura', 'POST', pedido as any, avisos, (corpo) => {
      const requestID = lerRequestId(corpo)
      return requestID === null ? null : { requestID }
    })
  }

  /* ── 1.2 obterEstado ──────────────────────────────────────────────────── */

  async obterEstado(requestID: string): Promise<Resultado<StatusResult>> {
    const avisos: string[] = []
    const envelope = this.envelope(avisos)

    const pedido: PedidoObterEstado = {
      ...envelope,
      requestID,
      jwsSignature: this.assinarChamada(
        payloadObterEstado({ taxRegistrationNumber: envelope.taxRegistrationNumber, requestID }),
        avisos
      ),
    }

    const violacoes = validarObterEstado(pedido, this.cfg)
    if (violacoes.length > 0)
      return this.falhaDeValidacao(violacoes, 'obterEstado', pedido as any, avisos)

    return this.chamar('obterEstado', 'GET', pedido as any, avisos, lerStatusResult)
  }

  /* ── 1.3 listarFacturas ───────────────────────────────────────────────── */

  async listarFacturas(
    queryStartDate: string,
    queryEndDate: string
  ): Promise<Resultado<DocumentListResult>> {
    const avisos: string[] = []
    const envelope = this.envelope(avisos)

    const pedido: PedidoListarFacturas = {
      ...envelope,
      queryStartDate,
      queryEndDate,
      jwsSignature: this.assinarChamada(
        payloadListarFacturas({
          taxRegistrationNumber: envelope.taxRegistrationNumber,
          queryStartDate,
          queryEndDate,
        }),
        avisos
      ),
    }

    const violacoes = validarListarFacturas(pedido, this.cfg)
    if (violacoes.length > 0)
      return this.falhaDeValidacao(violacoes, 'listarFacturas', pedido as any, avisos)

    return this.chamar('listarFacturas', 'GET', pedido as any, avisos, lerListaDeFacturas)
  }

  /* ── 1.4 consultarFactura ─────────────────────────────────────────────── */

  async consultarFactura(documentNo: string): Promise<Resultado<StatusFEResult>> {
    const avisos: string[] = []
    const envelope = this.envelope(avisos)

    const pedido: PedidoConsultarFactura = {
      ...envelope,
      documentNo,
      jwsSignature: this.assinarChamada(
        payloadConsultarFactura({
          taxRegistrationNumber: envelope.taxRegistrationNumber,
          documentNo,
        }),
        avisos
      ),
    }

    const violacoes = validarConsultarFactura(pedido, this.cfg)
    if (violacoes.length > 0)
      return this.falhaDeValidacao(violacoes, 'consultarFactura', pedido as any, avisos)

    return this.chamar('consultarFactura', 'GET', pedido as any, avisos, lerFacturaConsultada)
  }

  /* ── 1.5 solicitarSerie ───────────────────────────────────────────────── */

  async solicitarSerie(dados: {
    seriesCode: string
    seriesYear: number
    documentType: TipoDocumento
    firstDocumentNumber: number
  }): Promise<Resultado<{ resultCode: number; sucesso: boolean }>> {
    const avisos: string[] = []
    const envelope = this.envelope(avisos)

    const pedido: PedidoSolicitarSerie = {
      ...envelope,
      ...dados,
      jwsSignature: this.assinarChamada(
        payloadSolicitarSerie({ taxRegistrationNumber: envelope.taxRegistrationNumber, ...dados }),
        avisos
      ),
    }

    const violacoes = validarSolicitarSerie(pedido, this.cfg, this.relogio())
    if (violacoes.length > 0)
      return this.falhaDeValidacao(violacoes, 'solicitarSerie', pedido as any, avisos)

    return this.chamar('solicitarSerie', 'POST', pedido as any, avisos, (corpo) => {
      const resultCode = lerResultadoDaSerie(corpo)
      // Um 200 com resultCode 0 é um INSUCESSO comunicado com sucesso. O
      // `ok: true` diz que a chamada correu; `sucesso` diz o que ela respondeu.
      // Confundir os dois é criar séries que a AGT nunca registou.
      return resultCode === null ? null : { resultCode, sucesso: resultCode === 1 }
    })
  }

  /* ── 1.6 listarSeries ─────────────────────────────────────────────────── */

  async listarSeries(
    filtros: {
      seriesCode?: string
      seriesYear?: number
      documentType?: TipoDocumento
      seriesStatus?: EstadoSerie
    } = {}
  ): Promise<Resultado<SeriesListResult>> {
    const avisos: string[] = []
    const envelope = this.envelope(avisos)

    const pedido: PedidoListarSeries = {
      ...envelope,
      ...filtros,
      jwsSignature: this.assinarChamada(
        payloadListarSeries({ taxRegistrationNumber: envelope.taxRegistrationNumber }),
        avisos
      ),
    }

    return this.chamar('listarSeries', 'GET', pedido as any, avisos, lerListaDeSeries)
  }

  /* ── 1.7 confirmarRejeitarDocumento ───────────────────────────────────── */

  /**
   * Confirmar ou rejeitar, como ADQUIRENTE, um documento emitido em nosso nome.
   *
   * É o único dos sete serviços em que o NIF do envelope é o de quem COMPRA, não
   * o de quem emite. Com uma única configuração por instalação isso não se nota;
   * numa instalação multi-empresa, o `ClienteAgt` tem de ser construído com a
   * configuração da empresa adquirente — ver `MinfinService`.
   */
  async confirmarRejeitarDocumento(
    documentNo: string,
    action: AccaoAdquirente
  ): Promise<Resultado<ConfirmRejectResult>> {
    const avisos: string[] = []
    const envelope = this.envelope(avisos)

    const pedido: PedidoConfirmarRejeitar = {
      ...envelope,
      documentNo,
      action,
      jwsSignature: this.assinarChamada(
        payloadConfirmarRejeitar({
          taxRegistrationNumber: envelope.taxRegistrationNumber,
          documentNo,
        }),
        avisos
      ),
    }

    const violacoes = validarConfirmarRejeitar(pedido, this.cfg)
    if (violacoes.length > 0) {
      return this.falhaDeValidacao(violacoes, 'confirmarRejeitarDocumento', pedido as any, avisos)
    }

    return this.chamar(
      'confirmarRejeitarDocumento',
      'POST',
      pedido as any,
      avisos,
      lerConfirmarRejeitar
    )
  }
}
