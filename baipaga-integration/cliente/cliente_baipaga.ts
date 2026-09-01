/**
 * `ClienteBaipaga` — a classe que trata da integração.
 *
 * Um objecto, um método por endpoint, mais um (`esperarDesfecho`) que resolve a
 * única coisa que a API não resolve: um pagamento por notificação é assíncrono e
 * alguém tem de esperar por ele.
 *
 * ── A decisão que molda tudo o resto: isto NÃO lança por falha do BAI ─────────
 *
 * Um banco em baixo, um timeout, um `CORE_BANKING_UNAVAILABLE` — nada disso é
 * uma excepção neste código. São respostas, com o mesmo estatuto de uma resposta
 * boa, e vêm num `Resultado` que quem chama tem de abrir.
 *
 * A razão é a mesma que já está escrita em `minfin-integration/cliente/cliente_agt.ts`
 * e em `app/repositories/nif_repository.ts`: quem chama isto está a meio de uma
 * venda. Se a integração lançar, o `try/catch` mais próximo decide o destino do
 * pagamento — e o mais próximo é quase sempre um que não sabe nada de
 * pagamentos. Com um `Resultado`, a decisão "gravar como pendente e voltar a
 * perguntar" fica onde tem de ficar, e o TypeScript obriga a tomá-la.
 *
 * Lança em dois casos, os dois de programação e não de operação: configuração
 * inválida (`configuracao.ts`) e assinatura pedida sem chave (`assinatura/hmac.ts`).
 *
 * ── A regra que atravessa a classe inteira ────────────────────────────────────
 *
 * **HTTP 200 não é sucesso.** Dez dos onze endpoints devolvem o veredicto de
 * negócio num `responseCode` DENTRO de um 200. `chamar()` só devolve `ok: true`
 * quando os dois concordam, e é a única razão pela qual esta classe existe em
 * vez de meia dúzia de `fetch()` espalhados.
 */

import { configuracao as lerConfiguracao, type ConfiguracaoBaipaga } from '../configuracao.js'
import type {
  CarrinhoCalculado,
  Carrinho,
  PagamentoView,
  PedidoAnularCativo,
  PedidoCativo,
  PedidoConfirmarCativo,
  PedidoPagamento,
  PedidoPagamentoOtp,
  PedidoQrCode,
  PercentagemIva,
} from '../contratos/contratos.js'
import {
  descrever,
  eSucesso,
  eTransitorio,
  EXIGE_CONSULTA_ANTES_DE_REPETIR,
  mensagemParaUtilizador,
} from '../dominio/codigos_resposta.js'
import { estadoEFinal, estadoEPendente } from '../dominio/estados.js'
import { montantesCrusDaResposta, verificar } from '../assinatura/hmac.js'
import { cabecalhosSeguros, enviar, ErroDeTransporte } from '../transporte/http.js'
import { normalizarMsisdn } from '../validacao/formatos.js'
import {
  validarAnularCativo,
  validarCativo,
  validarConfirmarCativo,
  validarConsulta,
  validarPedidoOtp,
  validarPedidoPagamento,
  validarQrCode,
  type Violacao,
} from '../validacao/regras.js'
import {
  avisosDePrecisao,
  lerCarrinhoCalculado,
  lerCodigoResposta,
  lerConfirmationUrl,
  lerExpirationDate,
  lerMensagem,
  lerPagamento,
  lerPaymentId,
  lerPercentagensIva,
  lerPontoDeAceitacao,
  lerQrCode,
  lerValidacaoMsisdn,
  type QrCodeLido,
} from './normalizacao.js'

/* ────────────────────────────────────────────────────────────────────────────
 * Resultado
 * ──────────────────────────────────────────────────────────────────────────── */

export interface ErroNormalizado {
  /** O código do catálogo do BAI — o mesmo, venha a falha de lá ou daqui. */
  codigo: string
  /** A descrição técnica. Para o registo. */
  descricao: string
  /** O texto para o ecrã: português, linguagem de negócio, sem detalhe interno. */
  mensagem: string
  /** Caminho do campo, quando a falha foi apanhada localmente. */
  campo?: string
  /** Vale a pena repetir a chamada mais tarde com o mesmo conteúdo? */
  transitorio: boolean
  /**
   * ⚠️ Repetir esta chamada pode cobrar o cliente duas vezes — é preciso
   * consultar o estado primeiro. Ver `EXIGE_CONSULTA_ANTES_DE_REPETIR`.
   */
  consultarAntesDeRepetir: boolean
}

export type TipoDeFalhaDeChamada =
  /** O pedido nem chegou a sair: falhou a validação local. */
  | 'validacao-local'
  /** O BAI respondeu, e recusou. Repetir com o mesmo conteúdo dá o mesmo. */
  | 'recusado'
  /** Não houve resposta: rede, timeout, serviço em baixo. Repetir mais tarde. */
  | 'indisponivel'
  /** Houve resposta, mas não é a que a especificação descreve. */
  | 'resposta-invalida'

export interface Sucesso<T> {
  ok: true
  dados: T
  httpStatus: number
  duracaoMs: number
  avisos: string[]
  /** O que foi enviado — para auditoria. Nunca inclui a chave de API. */
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
  /** Vale a pena repetir? */
  repetivel: boolean
}

export type Resultado<T> = Sucesso<T> | Falha

/** A primeira mensagem de uma falha, pronta para um ecrã. */
export function mensagemDaFalha(falha: Falha): string {
  return falha.erros[0]?.mensagem ?? 'Não foi possível processar o pagamento. Contacte o suporte.'
}

/* ────────────────────────────────────────────────────────────────────────────
 * Dados de saída dos métodos
 * ──────────────────────────────────────────────────────────────────────────── */

export interface PagamentoCriado {
  paymentId: number
  /** Depois disto o pedido caduca sem o cliente ter respondido. */
  expiraEm: string | null
}

export interface PagamentoOtpIniciado extends PagamentoCriado {
  /** Para onde encaminhar o cliente. */
  urlDeConfirmacao: string
}

export interface EstadoDoPagamento {
  pagamento: PagamentoView
  estado: string
  /** `true` só quando o dinheiro saiu da conta do cliente. */
  liquidado: boolean
  /** O estado ainda pode mudar sozinho? */
  pendente: boolean
  /**
   * O que a verificação do HMAC concluiu.
   *
   * `null` quando a verificação está desligada. Quando está ligada e devolve
   * `valida: false` sem `naoVerificavel`, a resposta é para deitar fora: ou não
   * veio do BAI, ou veio adulterada.
   */
  assinatura: {
    valida: boolean
    naoVerificavel: string | null
  } | null
}

/* ────────────────────────────────────────────────────────────────────────────
 * Cliente
 * ──────────────────────────────────────────────────────────────────────────── */

/** Os caminhos, escritos uma vez. Relativos à `baseUrl`. */
const CAMINHOS = {
  calcularCarrinho: '/rest/partners/external/calculateCart',
  percentagensIva: '/rest/partners/external/cartVatPercentages',
  pedirPagamento: '/rest/partners/external/payment/request',
  iniciarOtp: '/rest/partners/external/payment/initiate',
  criarCativo: '/rest/partners/external/payment/captive',
  confirmarCativo: '/rest/partners/external/payment/captive/confirm',
  anularCativo: '/rest/partners/external/payment/captive/cancel',
  qrCode: '/rest/partners/external/qrCode',
  estado: '/rest/partners/external/payment',
} as const

export interface OpcoesDoCliente {
  configuracao?: ConfiguracaoBaipaga
  /** Injectável para tornar as esperas instantâneas nos testes. */
  dormir?: (ms: number) => Promise<void>
}

interface OpcoesDeChamada<T> {
  /** Nome legível da operação, para as mensagens. */
  operacao: string
  metodo: 'GET' | 'POST'
  caminho: string
  corpo?: Record<string, unknown>
  query?: Record<string, string | number | undefined>
  /**
   * Este endpoint devolve `responseCode`?
   *
   * `calculateCart` e `cartVatPercentages` não devolvem — são os dois únicos, e
   * exigir-lhes um código faria toda a chamada bem sucedida parecer falhada.
   */
  temCodigoResposta: boolean
  interpretar: (contexto: { corpo: unknown; corpoBruto: string; avisos: string[] }) => T | null
}

export class ClienteBaipaga {
  private readonly cfg: ConfiguracaoBaipaga
  private readonly dormir: (ms: number) => Promise<void>

  constructor(opcoes: OpcoesDoCliente = {}) {
    this.cfg = opcoes.configuracao ?? lerConfiguracao()
    this.dormir = opcoes.dormir ?? ((ms) => new Promise((r) => setTimeout(r, ms)))
  }

  /** A configuração em uso. Útil para quem monta pedidos antes de os enviar. */
  get configuracao(): ConfiguracaoBaipaga {
    return this.cfg
  }

  /* ── Execução comum ───────────────────────────────────────────────────── */

  private falhaDeValidacao(violacoes: Violacao[], pedido: Record<string, unknown>): Falha {
    return {
      ok: false,
      tipo: 'validacao-local',
      httpStatus: null,
      duracaoMs: 0,
      avisos: [],
      pedido,
      respostaBruta: null,
      repetivel: false,
      erros: violacoes.map((v) => ({
        codigo: v.codigo,
        // A frase local é mais útil que a do catálogo — diz o campo e o valor.
        descricao: `${v.campo}: ${v.detalhe}`,
        mensagem: mensagemParaUtilizador(v.codigo),
        campo: v.campo,
        transitorio: false,
        consultarAntesDeRepetir: false,
      })),
    }
  }

  private erroDoCodigo(codigo: string, mensagemDoBai: string | null): ErroNormalizado {
    return {
      codigo,
      // A frase do BAI, quando ele manda uma, vale mais do que a do catálogo:
      // sabe do caso concreto. O catálogo é o fundo para quando ele não manda.
      descricao: mensagemDoBai ?? descrever(codigo),
      mensagem: mensagemParaUtilizador(codigo),
      transitorio: eTransitorio(codigo),
      consultarAntesDeRepetir: (EXIGE_CONSULTA_ANTES_DE_REPETIR as readonly string[]).includes(codigo),
    }
  }

  /**
   * Faz a chamada e classifica a resposta.
   *
   * `interpretar` só corre quando o HTTP foi 2xx E o `responseCode` disse `OK`.
   * Assim cada método só escreve a leitura do caso bom, e todo o tratamento de
   * erro (rede, timeout, 4xx, 5xx, código de negócio, corpo inesperado) está
   * aqui uma vez só.
   */
  private async chamar<T>(opcoes: OpcoesDeChamada<T>): Promise<Resultado<T>> {
    const avisos: string[] = []

    // O que se guarda para auditoria: o pedido, sem a chave de API. Ver
    // `cabecalhosSeguros()` — a credencial nunca entra num registo.
    const pedidoRegistado: Record<string, unknown> = {
      operacao: opcoes.operacao,
      metodo: opcoes.metodo,
      caminho: opcoes.caminho,
      ...(opcoes.query ? { query: opcoes.query } : {}),
      ...(this.cfg.registarPayloads && opcoes.corpo ? { corpo: opcoes.corpo } : {}),
      cabecalhos: cabecalhosSeguros({ 'X-MP-ApiKey': this.cfg.apiKey }),
    }

    let resposta: Awaited<ReturnType<typeof enviar>>

    try {
      resposta = await enviar({
        url: `${this.cfg.baseUrl}${opcoes.caminho}`,
        metodo: opcoes.metodo,
        corpo: opcoes.corpo,
        query: opcoes.query,
        apiKey: this.cfg.apiKey,
        timeoutMs: this.cfg.timeoutMs,
      })
    } catch (erro) {
      const transporte = erro instanceof ErroDeTransporte ? erro : null
      const naoEJson = transporte?.tipo === 'resposta-nao-json'

      return {
        ok: false,
        tipo: naoEJson ? 'resposta-invalida' : 'indisponivel',
        httpStatus: null,
        duracaoMs: 0,
        avisos,
        pedido: pedidoRegistado,
        respostaBruta: null,
        // Uma resposta que não é JSON não melhora por se repetir o pedido.
        repetivel: !naoEJson,
        erros: [
          {
            codigo: naoEJson ? 'FATAL' : 'CORE_BANKING_UNAVAILABLE',
            descricao: transporte?.message ?? 'Não foi possível contactar o serviço de pagamentos do BAI.',
            mensagem: mensagemParaUtilizador(naoEJson ? 'FATAL' : 'CORE_BANKING_UNAVAILABLE'),
            transitorio: !naoEJson,
            // Um timeout é o caso perigoso: o pedido pode ter chegado e sido
            // aceite, e nós não sabemos. Repetir às cegas cria um segundo
            // pagamento.
            consultarAntesDeRepetir: transporte?.tipo === 'timeout',
          },
        ],
      }
    }

    const base = {
      httpStatus: resposta.status,
      duracaoMs: resposta.duracaoMs,
      avisos,
      pedido: pedidoRegistado,
      respostaBruta: resposta.corpoBruto,
    }

    const mensagemDoBai = lerMensagem(resposta.corpo)

    if (resposta.status < 200 || resposta.status >= 300) {
      // 401/403/404/400/500 — o BAI não põe `responseCode` nestes, só o corpo de
      // erro do servidor de aplicação. Traduz-se pelo estatuto HTTP.
      const codigo =
        resposta.status === 401 || resposta.status === 403
          ? 'INVALID_API_KEY'
          : resposta.status === 404
            ? 'INVALID_EXTERNAL_REFERENCE'
            : resposta.status === 400
              ? 'INVALID_PARAMETERS'
              : resposta.status >= 500
                ? 'CORE_BANKING_UNAVAILABLE'
                : 'UNKNOWN'

      const erro = this.erroDoCodigo(codigo, mensagemDoBai)
      erro.descricao = `${erro.descricao} (HTTP ${resposta.status})`

      return {
        ok: false,
        tipo: 'recusado',
        erros: [erro],
        repetivel: resposta.status === 429 || resposta.status >= 500,
        ...base,
      }
    }

    if (opcoes.temCodigoResposta) {
      const codigo = lerCodigoResposta(resposta.corpo)

      if (!eSucesso(codigo)) {
        const erro = this.erroDoCodigo(codigo, mensagemDoBai)

        return {
          ok: false,
          tipo: 'recusado',
          erros: [erro],
          repetivel: erro.transitorio,
          ...base,
        }
      }
    }

    const dados = opcoes.interpretar({
      corpo: resposta.corpo,
      corpoBruto: resposta.corpoBruto,
      avisos,
    })

    if (dados === null) {
      return {
        ok: false,
        tipo: 'resposta-invalida',
        repetivel: false,
        erros: [
          {
            codigo: 'FATAL',
            descricao:
              `O BAI respondeu ${resposta.status} mas o corpo não tem a forma que a especificação ` +
              `descreve para ${opcoes.operacao}. A resposta completa foi guardada para diagnóstico.`,
            mensagem: mensagemParaUtilizador('FATAL'),
            transitorio: false,
            consultarAntesDeRepetir: false,
          },
        ],
        ...base,
      }
    }

    return { ok: true, dados, ...base }
  }

  /* ── Carrinho ─────────────────────────────────────────────────────────── */

  /**
   * As percentagens de IVA que o BAI aceita.
   *
   * É preciso chamar isto antes de montar um carrinho com IVA: as linhas
   * identificam a taxa pelo `id` desta tabela, não pelo valor. Enviar
   * `{ value: 14 }` sem `id` devolve `SHOPPING_CART_VAT_PERCENTAGES_NOT_FOUND`.
   *
   * A tabela muda raramente e vale a pena guardá-la em cache do lado de quem
   * chama; este módulo não a guarda porque não sabe quanto tempo é aceitável ter
   * uma taxa de imposto desactualizada, e essa não é uma decisão de um cliente
   * HTTP.
   */
  async percentagensDeIva(): Promise<Resultado<PercentagemIva[]>> {
    return this.chamar({
      operacao: 'percentagensDeIva',
      metodo: 'GET',
      caminho: CAMINHOS.percentagensIva,
      // Esta resposta não traz `responseCode` — ver `OpcoesDeChamada`.
      temCodigoResposta: false,
      interpretar: ({ corpo }) => lerPercentagensIva(corpo),
    })
  }

  /**
   * Manda o BAI calcular os totais e o IVA do carrinho.
   *
   * Usar isto e enviar o carrinho devolvido é a forma de nunca ver um
   * `SHOPPING_CART_AMOUNT_NOT_EQUAL_TO_TOTAL_AMOUNT`: os totais passam a ser os
   * que ELES calcularam, e não os nossos arredondados de outra maneira.
   */
  async calcularCarrinho(carrinho: Carrinho): Promise<Resultado<CarrinhoCalculado>> {
    return this.chamar({
      operacao: 'calcularCarrinho',
      metodo: 'POST',
      caminho: CAMINHOS.calcularCarrinho,
      corpo: { shoppingCart: carrinho },
      temCodigoResposta: false,
      interpretar: ({ corpo }) => lerCarrinhoCalculado(corpo),
    })
  }

  /* ── Cliente ──────────────────────────────────────────────────────────── */

  /**
   * O número tem conta no BAI e pode receber pedidos de pagamento?
   *
   * Vale a pena chamar antes de criar o pagamento: um número sem conta devolve
   * aqui um `false` limpo, e no pedido de pagamento devolveria
   * `CUSTOMER_NOT_FOUND_FOR_MSISDN` depois de já se ter consumido uma
   * referência externa.
   *
   * O número é normalizado à entrada — `923 456 789` chega aqui e sai
   * `244923456789`.
   */
  async validarMsisdn(msisdn: string): Promise<Resultado<{ valido: boolean; msisdn: string }>> {
    const normalizado = normalizarMsisdn(msisdn, this.cfg.indicativoPais)

    if (normalizado === null) {
      return this.falhaDeValidacao(
        [
          {
            codigo: 'INVALID_MSISDN_FORMAT',
            campo: 'msisdn',
            detalhe: `"${msisdn}" não é um número de telemóvel reconhecível.`,
          },
        ],
        { operacao: 'validarMsisdn', msisdn }
      )
    }

    return this.chamar({
      operacao: 'validarMsisdn',
      metodo: 'GET',
      // O MSISDN vai no caminho: tem de ser escapado, mesmo sendo só dígitos
      // depois da normalização — a normalização é uma garantia deste módulo, não
      // do URL.
      caminho: `/rest/partners/external/msisdn/${encodeURIComponent(normalizado)}/validate`,
      temCodigoResposta: true,
      interpretar: ({ corpo }) => {
        const lido = lerValidacaoMsisdn(corpo)
        return lido === null ? null : { valido: lido.valido, msisdn: normalizado }
      },
    })
  }

  /** O nome de uma loja, para mostrar ao cliente antes de ele confirmar. */
  async pontoDeAceitacao(
    merchantId: number,
    acceptancePointId: number
  ): Promise<Resultado<{ friendlyName: string }>> {
    return this.chamar({
      operacao: 'pontoDeAceitacao',
      metodo: 'GET',
      caminho: `/rest/partners/external/merchants/${merchantId}/acceptancePoint/${acceptancePointId}`,
      temCodigoResposta: true,
      interpretar: ({ corpo }) => lerPontoDeAceitacao(corpo),
    })
  }

  /* ── Pagamento de valor fixo ──────────────────────────────────────────── */

  /**
   * Pede um pagamento de valor fixo. O cliente recebe uma notificação na
   * aplicação do banco e confirma lá.
   *
   * ⚠️ A `externalReference` é a única defesa contra cobrar duas vezes. O BAI
   * recusa uma referência repetida com `EXISTING_EXTERNAL_REFERENCE` — e é por
   * isso que ela tem de ser derivada da encomenda e não gerada a cada tentativa.
   * Uma referência nova por cada carregamento do ecrã transforma a protecção em
   * decoração.
   *
   * Devolve quando o pedido foi ACEITE, não quando foi pago. O que fica pago
   * sabe-se por `esperarDesfecho()` ou por `consultarPagamento()`.
   */
  async pedirPagamento(dados: {
    msisdn: string
    total: number
    referencia: string
    descricao?: string
    notas?: string
    carrinho?: Carrinho
    moeda?: string
    merchantId?: number
  }): Promise<Resultado<PagamentoCriado>> {
    const msisdn = normalizarMsisdn(dados.msisdn, this.cfg.indicativoPais) ?? dados.msisdn

    const pedido: PedidoPagamento = {
      merchantId: dados.merchantId ?? this.cfg.merchantId ?? undefined,
      customerMsisdn: msisdn,
      totalAmount: dados.total,
      currency: dados.moeda ?? this.cfg.moeda,
      shoppingCart: dados.carrinho,
      externalReference: dados.referencia,
      description: dados.descricao,
      merchantNotes: dados.notas,
    }

    const violacoes = validarPedidoPagamento(pedido, this.cfg)
    if (violacoes.length > 0) return this.falhaDeValidacao(violacoes, pedido as any)

    return this.chamar({
      operacao: 'pedirPagamento',
      metodo: 'POST',
      caminho: CAMINHOS.pedirPagamento,
      corpo: pedido as any,
      temCodigoResposta: true,
      interpretar: ({ corpo }) => {
        const paymentId = lerPaymentId(corpo)
        return paymentId === null ? null : { paymentId, expiraEm: lerExpirationDate(corpo) }
      },
    })
  }

  /* ── Pagamento com confirmação por OTP ────────────────────────────────── */

  /**
   * Inicia um pagamento que o cliente confirma numa página, com um código.
   *
   * É o fluxo para compras na web, onde não se pode contar com o cliente ter a
   * aplicação do banco à mão. O `urlDeConfirmacao` é para onde se encaminha o
   * browser dele.
   */
  async iniciarPagamentoComOtp(dados: {
    msisdn: string
    total: number
    referencia: string
    descricao?: string
    carrinho?: Carrinho
    moeda?: string
  }): Promise<Resultado<PagamentoOtpIniciado>> {
    const msisdn = normalizarMsisdn(dados.msisdn, this.cfg.indicativoPais) ?? dados.msisdn

    const pedido: PedidoPagamentoOtp = {
      customerMsisdn: msisdn,
      totalAmount: dados.total,
      currency: dados.moeda ?? this.cfg.moeda,
      shoppingCart: dados.carrinho,
      externalReference: dados.referencia,
      description: dados.descricao,
    }

    const violacoes = validarPedidoOtp(pedido, this.cfg)
    if (violacoes.length > 0) return this.falhaDeValidacao(violacoes, pedido as any)

    return this.chamar({
      operacao: 'iniciarPagamentoComOtp',
      metodo: 'POST',
      caminho: CAMINHOS.iniciarOtp,
      corpo: pedido as any,
      temCodigoResposta: true,
      interpretar: ({ corpo }) => {
        const paymentId = lerPaymentId(corpo)
        const url = lerConfirmationUrl(corpo)
        // Sem o URL não há como o cliente confirmar: uma resposta assim é
        // inútil e não deve passar por boa.
        return paymentId === null || url === null
          ? null
          : { paymentId, urlDeConfirmacao: url, expiraEm: lerExpirationDate(corpo) }
      },
    })
  }

  /* ── Cativo (pré-autorização) ─────────────────────────────────────────── */

  /**
   * Pré-autoriza um valor. Para bombas de combustível, hotéis — os casos em que
   * o valor final só se sabe no fim.
   *
   * O cliente vê o `estimado` e autoriza até ao `maximo`. Depois disso é
   * OBRIGATÓRIO chamar `confirmarCativo()` (cobra) ou `anularCativo()`
   * (liberta): um cativo esquecido deixa o dinheiro do cliente retido até
   * `captiveValidUntil`, e isso é uma reclamação garantida.
   */
  async criarCativo(dados: {
    msisdn: string
    estimado: number
    maximo: number
    referencia: string
    descricao?: string
    carrinho?: Carrinho
    moeda?: string
  }): Promise<Resultado<{ paymentId: number }>> {
    const msisdn = normalizarMsisdn(dados.msisdn, this.cfg.indicativoPais) ?? dados.msisdn

    const pedido: PedidoCativo = {
      customerMsisdn: msisdn,
      estimatedAmount: dados.estimado,
      maxAmount: dados.maximo,
      currency: dados.moeda ?? this.cfg.moeda,
      shoppingCart: dados.carrinho,
      externalReference: dados.referencia,
      description: dados.descricao,
    }

    const violacoes = validarCativo(pedido, this.cfg)
    if (violacoes.length > 0) return this.falhaDeValidacao(violacoes, pedido as any)

    return this.chamar({
      operacao: 'criarCativo',
      metodo: 'POST',
      caminho: CAMINHOS.criarCativo,
      corpo: pedido as any,
      temCodigoResposta: true,
      interpretar: ({ corpo }) => {
        const paymentId = lerPaymentId(corpo)
        return paymentId === null ? null : { paymentId }
      },
    })
  }

  /**
   * Cobra o valor final de um cativo. `final` tem de caber no `maximo` da
   * pré-autorização.
   *
   * `maximoConhecido` é opcional e serve para apanhar aqui o excesso, em vez de
   * o descobrir numa recusa do BAI com o cliente à frente.
   */
  async confirmarCativo(dados: {
    paymentId?: number
    referencia?: string
    final: number
    maximoConhecido?: number
  }): Promise<Resultado<{ paymentId: number | null }>> {
    const pedido: PedidoConfirmarCativo = {
      paymentId: dados.paymentId,
      externalReference: dados.referencia,
      finalAmount: dados.final,
    }

    const violacoes = validarConfirmarCativo(pedido, this.cfg, dados.maximoConhecido)
    if (violacoes.length > 0) return this.falhaDeValidacao(violacoes, pedido as any)

    return this.chamar({
      operacao: 'confirmarCativo',
      metodo: 'POST',
      caminho: CAMINHOS.confirmarCativo,
      corpo: pedido as any,
      temCodigoResposta: true,
      // O `paymentId` da resposta é redundante com o que já se enviou, e a
      // especificação declara-o opcional. Um `null` aqui não é motivo para dar a
      // confirmação por falhada — o veredicto foi o `responseCode`.
      interpretar: ({ corpo }) => ({ paymentId: lerPaymentId(corpo) }),
    })
  }

  /** Liberta um cativo sem cobrar. */
  async anularCativo(dados: {
    paymentId?: number
    referencia?: string
  }): Promise<Resultado<{ paymentId: number | null }>> {
    const pedido: PedidoAnularCativo = {
      paymentId: dados.paymentId,
      externalReference: dados.referencia,
    }

    const violacoes = validarAnularCativo(pedido)
    if (violacoes.length > 0) return this.falhaDeValidacao(violacoes, pedido as any)

    return this.chamar({
      operacao: 'anularCativo',
      metodo: 'POST',
      caminho: CAMINHOS.anularCativo,
      corpo: pedido as any,
      temCodigoResposta: true,
      interpretar: ({ corpo }) => ({ paymentId: lerPaymentId(corpo) }),
    })
  }

  /* ── QR Code ──────────────────────────────────────────────────────────── */

  /**
   * Gera o QR Code de um pagamento num ponto de aceitação.
   *
   * ⚠️ Este endpoint não recebe MSISDN: quem paga é quem ler o código. Isso quer
   * dizer que não há aqui um `paymentId` para acompanhar — o pagamento só passa a
   * existir quando alguém lê o código. Para o encontrar depois é preciso ter
   * passado uma `externalReference` e consultar por ela.
   */
  async gerarQrCode(dados: {
    valor: number
    referencia?: string
    acceptancePointId?: number
    largura?: number
    altura?: number
    moeda?: string
  }): Promise<Resultado<QrCodeLido>> {
    const pedido: PedidoQrCode = {
      externalReference: dados.referencia,
      acceptancePointId: dados.acceptancePointId ?? this.cfg.acceptancePointId ?? 0,
      width: dados.largura,
      height: dados.altura,
      amount: dados.valor,
      currency: dados.moeda ?? this.cfg.moeda,
    }

    const violacoes = validarQrCode(pedido)
    if (violacoes.length > 0) return this.falhaDeValidacao(violacoes, pedido as any)

    return this.chamar({
      operacao: 'gerarQrCode',
      metodo: 'POST',
      caminho: CAMINHOS.qrCode,
      corpo: pedido as any,
      temCodigoResposta: true,
      interpretar: ({ corpo }) => lerQrCode(corpo),
    })
  }

  /* ── Estado ───────────────────────────────────────────────────────────── */

  /**
   * O estado de um pagamento, por `paymentId` ou por `referencia`.
   *
   * É aqui que a assinatura é verificada. Quando `verificarAssinatura` está
   * ligada e o HMAC não bate, isto devolve FALHA e não um estado — uma resposta
   * cuja origem não se consegue provar não pode ser a base para entregar
   * mercadoria, por muito que diga `SUCCESS`.
   *
   * Preferir a `referencia` ao `paymentId` quando as duas existirem: o
   * `paymentId` é um `int64` e pode perder precisão ao ser lido em JavaScript
   * (ver `avisosDePrecisao`).
   */
  async consultarPagamento(criterio: {
    paymentId?: number
    referencia?: string
  }): Promise<Resultado<EstadoDoPagamento>> {
    const violacoes = validarConsulta({
      paymentId: criterio.paymentId,
      externalReference: criterio.referencia,
    })

    if (violacoes.length > 0) {
      return this.falhaDeValidacao(violacoes, { operacao: 'consultarPagamento', ...criterio })
    }

    const resultado = await this.chamar<EstadoDoPagamento>({
      operacao: 'consultarPagamento',
      metodo: 'GET',
      caminho: CAMINHOS.estado,
      query: {
        paymentId: criterio.paymentId,
        externalReference: criterio.referencia,
      },
      temCodigoResposta: true,
      interpretar: ({ corpo, corpoBruto, avisos }) => {
        const pagamento = lerPagamento(corpo)
        if (pagamento === null) return null

        avisos.push(...avisosDePrecisao(pagamento))

        const estado = String(pagamento.status)
        const assinatura = this.verificarAssinatura(pagamento, corpoBruto, avisos)

        return {
          pagamento,
          estado,
          liquidado: estado === 'SUCCESS',
          pendente: estadoEPendente(estado),
          assinatura,
        }
      },
    })

    // A assinatura inválida é a única razão pela qual um 200 com `OK` se
    // transforma numa falha. Fica aqui, fora do `interpretar`, porque não é um
    // problema de FORMA da resposta — é um problema de ORIGEM.
    if (resultado.ok && resultado.dados.assinatura?.valida === false) {
      const { naoVerificavel } = resultado.dados.assinatura

      if (naoVerificavel === null) {
        return {
          ok: false,
          tipo: 'resposta-invalida',
          httpStatus: resultado.httpStatus,
          duracaoMs: resultado.duracaoMs,
          avisos: resultado.avisos,
          pedido: resultado.pedido,
          respostaBruta: resultado.respostaBruta,
          repetivel: false,
          erros: [
            {
              codigo: 'FATAL',
              descricao:
                'A assinatura HMAC da resposta não confere. A resposta não pode ser atribuída ao BAI ' +
                'e o estado do pagamento não foi aceite. Ver assinatura/hmac.ts e DIVERGENCIAS.md #A-01.',
              mensagem: mensagemParaUtilizador('FATAL'),
              transitorio: false,
              consultarAntesDeRepetir: false,
            },
          ],
        }
      }
    }

    return resultado
  }

  /**
   * Verifica o HMAC da resposta.
   *
   * O `merchantExternalId` vem da CONFIGURAÇÃO e nunca de `pagamento.merchant`,
   * pela razão que está escrita em `configuracao.ts`: quem forja a resposta forja
   * também o campo, e a verificação passaria sempre.
   */
  private verificarAssinatura(
    pagamento: PagamentoView,
    corpoBruto: string,
    avisos: string[]
  ): EstadoDoPagamento['assinatura'] {
    if (!this.cfg.verificarAssinatura) {
      avisos.push(
        'Assinatura da resposta NÃO verificada (BAIPAGA_CHAVE_PARTILHADA / BAIPAGA_MERCHANT_EXTERNAL_ID por definir).'
      )
      return null
    }

    const resultado = verificar({
      assinatura: pagamento.signature,
      campos: {
        id: pagamento.id,
        nonce: pagamento.nonce,
        externalReference: pagamento.externalReference,
        amount: pagamento.amount,
        lastChangeDate: pagamento.lastChangeDate,
        merchantExternalId: this.cfg.merchantExternalId!,
      },
      chavePartilhada: this.cfg.chavePartilhada,
      canonicalizacao: this.cfg.canonicalizacao,
      montantesAlternativos: montantesCrusDaResposta(corpoBruto),
    })

    if (resultado.naoVerificavel !== null) {
      avisos.push(`Assinatura não verificada: ${resultado.naoVerificavel}`)
    } else if (resultado.valida && this.cfg.canonicalizacao === 'auto') {
      avisos.push(
        `Assinatura válida com o formato "${resultado.formato ?? 'montante em bruto'}" (${resultado.codificacao}). ` +
          'Fixar em BAIPAGA_CANONICALIZACAO para fechar a ambiguidade #A-01.'
      )
    }

    return { valida: resultado.valida, naoVerificavel: resultado.naoVerificavel }
  }

  /**
   * Espera pelo desfecho de um pagamento, perguntando de tempos a tempos.
   *
   * ── Porque é que isto é sondagem e não um webhook ─────────────────────────
   *
   * Porque a especificação não descreve nenhum. Fala de um `callbackResult` —
   * "result of the callback notification to the merchant" — o que diz que existe
   * um mecanismo de notificação do lado deles, mas não diz o URL, nem o formato,
   * nem como se autentica. Enquanto não disser, sondar é o que há. Ver
   * `DIVERGENCIAS.md` #C-07.
   *
   * ── As duas coisas que isto NUNCA faz ──────────────────────────────────────
   *
   * Sondar para sempre, e devolver "não pago" quando desiste. Ao fim das
   * tentativas devolve o ÚLTIMO estado observado com `pendente: true`, e cabe a
   * quem chama decidir — e voltar a perguntar mais tarde. Um pagamento que ainda
   * está `PROCESSING` quando desistimos de esperar pode ficar `SUCCESS` um
   * minuto depois, e tratá-lo como falhado é entregar mercadoria de graça ou
   * cobrar duas vezes, conforme o lado por onde se erra.
   */
  async esperarDesfecho(
    criterio: { paymentId?: number; referencia?: string },
    opcoes: {
      tentativas?: number
      intervaloInicialMs?: number
      /** Multiplicador do intervalo a cada tentativa. */
      factor?: number
      tectoMs?: number
      sinal?: AbortSignal
    } = {}
  ): Promise<Resultado<EstadoDoPagamento>> {
    const tentativas = opcoes.tentativas ?? 10
    const factor = opcoes.factor ?? 1.5
    const tectoMs = opcoes.tectoMs ?? 15_000
    let intervalo = opcoes.intervaloInicialMs ?? 2_000

    let ultimo: Resultado<EstadoDoPagamento> | null = null

    for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
      if (opcoes.sinal?.aborted) break

      const resultado = await this.consultarPagamento(criterio)
      ultimo = resultado

      // Uma falha de transporte a meio da sondagem não é motivo para desistir: é
      // exactamente o caso em que voltar a perguntar resolve. Uma recusa de
      // negócio (`recusado`) é — o pagamento não existe, ou não é nosso.
      if (!resultado.ok) {
        if (!resultado.repetivel) return resultado
      } else if (estadoEFinal(resultado.dados.estado)) {
        return resultado
      }

      if (tentativa < tentativas) {
        await this.dormir(intervalo)
        intervalo = Math.min(Math.round(intervalo * factor), tectoMs)
      }
    }

    return (
      ultimo ?? {
        ok: false,
        tipo: 'indisponivel',
        httpStatus: null,
        duracaoMs: 0,
        avisos: [],
        pedido: { operacao: 'esperarDesfecho', ...criterio },
        respostaBruta: null,
        repetivel: true,
        erros: [
          {
            codigo: 'CORE_BANKING_UNAVAILABLE',
            descricao: 'A espera pelo desfecho foi interrompida antes da primeira consulta.',
            mensagem: mensagemParaUtilizador('CORE_BANKING_UNAVAILABLE'),
            transitorio: true,
            consultarAntesDeRepetir: true,
          },
        ],
      }
    )
  }
}
