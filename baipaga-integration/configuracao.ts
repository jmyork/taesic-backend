/**
 * Configuração da integração com o BAI Paga (Mobile Payments API do Banco BAI).
 *
 * ── Porque é que isto não está em `start/env.ts` ──────────────────────────────
 *
 * Pela mesma razão que `minfin-integration/configuracao.ts`: o módulo inteiro
 * vive dentro de `baipaga-integration/`, arranca, valida-se e falha sozinho, e
 * pode ser copiado para outro serviço sem arrastar meio `start/`. O preço é não
 * haver validação no arranque da aplicação — quem quiser essa rede acrescenta o
 * bloco do fim do `README.md` a `start/env.ts` e nada aqui muda.
 *
 * A validação acontece na PRIMEIRA utilização, não na importação: importar este
 * ficheiro num teste que só quer as tabelas de estados não pode exigir uma chave
 * de API no ambiente.
 *
 * ── O ambiente que o BAI entregou ─────────────────────────────────────────────
 *
 * O `servers` da especificação diz
 * `https://ib.bancobai.ao/QUAMDW-3G/internet-banking/api`. O `QUAMDW-3G` é o
 * identificador do ambiente de QUALIDADE deles — não é um caminho fixo da API, é
 * o nome de uma instância. Em produção esse segmento muda, e é por isso que o
 * URL inteiro é configurável e não há aqui nenhuma constante com "QUAMDW" lá
 * dentro à espera de ir para produção por distracção.
 */

/**
 * Como se constrói a cadeia que o BAI assina em `MobilePaymentView.signature`.
 *
 * A especificação escreve a fórmula:
 *
 *   HMAC(sharedKey, id|nonce|externalReference|amount|lastChangeDate|merchant.externalId)
 *
 * e não escreve mais nada. Falta exactamente o que decide se a verificação bate
 * ou não: como se escreve o `amount`, que é um NÚMERO em JSON. `1500`, `1500.0`
 * e `1500.00` são o mesmo número e três cadeias diferentes, e o `JSON.parse` do
 * Node perde a forma original das três — fica `1500` nas três.
 *
 * Daí estas três leituras. Ver `DIVERGENCIAS.md` #A-01.
 *
 * - `montante-simples` — `String(1500)` → `"1500"`. É o que produz um `long` de
 *   Java, e o que sobra de um `double` inteiro depois do `JSON.parse`.
 * - `montante-1-casa`  — `(1500).toFixed(1)` → `"1500.0"`. É o que produz o
 *   `Double.toString()` de Java, que nunca escreve um `double` sem casa decimal.
 * - `montante-2-casas` — `(1500).toFixed(2)` → `"1500.00"`. É o que produz um
 *   `BigDecimal` com escala 2, que é como se representa dinheiro em Java.
 *
 * `auto` (omissão) aceita a assinatura se ela bater com QUALQUER uma das três, e
 * diz num aviso qual bateu. Não enfraquece a verificação — continua a ser
 * preciso a chave partilhada para produzir qualquer das três — mas deixa a
 * ambiguidade viva. Assim que a primeira resposta real disser qual é, fixa-se em
 * `BAIPAGA_CANONICALIZACAO` e a ambiguidade fecha-se.
 */
export type Canonicalizacao = 'auto' | 'montante-simples' | 'montante-1-casa' | 'montante-2-casas'

export const CANONICALIZACOES = [
  'auto',
  'montante-simples',
  'montante-1-casa',
  'montante-2-casas',
] as const

export interface ConfiguracaoBaipaga {
  /**
   * Raiz da API, sem barra final.
   * Ex.: `https://ib.bancobai.ao/QUAMDW-3G/internet-banking/api`.
   */
  baseUrl: string
  /** Valor do cabeçalho `X-MP-ApiKey`, exigido nos onze endpoints. */
  apiKey: string
  /**
   * Chave partilhada com que o BAI calcula o HMAC-SHA256 de
   * `MobilePaymentView.signature`. É um segredo DIFERENTE da `apiKey`: a
   * `apiKey` autentica-nos a NÓS perante eles; esta autentica as respostas
   * DELES perante nós.
   *
   * Opcional porque a especificação não a nomeia em lado nenhum — chega por
   * fora, no acordo de integração. Sem ela a verificação fica desligada e cada
   * consulta de estado traz um aviso a dizer porquê.
   */
  chavePartilhada: string | null
  /**
   * `merchant.externalId` — o último campo da cadeia assinada, e por isso
   * indispensável para verificar a assinatura.
   *
   * ⚠️ Não serve usar o `merchant.externalId` que vem DENTRO da resposta para
   * verificar a assinatura DESSA resposta: quem forjar a resposta forja também
   * esse campo, e a verificação passaria sempre. Tem de vir de fora — daqui.
   */
  merchantExternalId: string | null
  /** `merchantId` numérico, usado como omissão em `pedirPagamento`. */
  merchantId: number | null
  /** Ponto de aceitação (loja) usado como omissão em `gerarQrCode`. */
  acceptancePointId: number | null
  /** ISO 4217. `AOA` salvo indicação em contrário. */
  moeda: string
  /**
   * Indicativo do país, sem `+`, para normalizar MSISDN escritos à angolana
   * (`923 456 789`) para a forma que a API quer (`244923456789`).
   */
  indicativoPais: string
  timeoutMs: number
  /**
   * Casas decimais com que os montantes são comparados. 2 é o que faz sentido
   * para AOA. Existe como variável porque a validação do carrinho compara somas
   * de linhas com totais, e a tolerância certa é uma pergunta para o BAI e não
   * uma constante óbvia.
   */
  casasDecimais: number
  /** Verificar o HMAC das respostas de consulta de estado. */
  verificarAssinatura: boolean
  canonicalizacao: Canonicalizacao
  /** Ligar o registo do pedido/resposta para auditoria. */
  registarPayloads: boolean
}

let cache: ConfiguracaoBaipaga | null = null

class ConfiguracaoInvalida extends Error {
  constructor(problemas: string[]) {
    super(
      'Configuração da integração BAI Paga incompleta ou inválida:\n' +
        problemas.map((p) => `  - ${p}`).join('\n') +
        '\n\nVer baipaga-integration/README.md, secção "Variáveis de ambiente".'
    )
    this.name = 'ConfiguracaoInvalida'
  }
}

function texto(nome: string): string | undefined {
  const valor = process.env[nome]
  return valor === undefined || valor.trim() === '' ? undefined : valor.trim()
}

function inteiro(nome: string, omissao: number, problemas: string[]): number {
  const bruto = texto(nome)
  if (bruto === undefined) return omissao

  const valor = Number(bruto)
  if (!Number.isFinite(valor) || !Number.isInteger(valor) || valor < 0) {
    problemas.push(`${nome} tem de ser um inteiro não negativo (recebido: "${bruto}").`)
    return omissao
  }
  return valor
}

function inteiroOpcional(nome: string, problemas: string[]): number | null {
  const bruto = texto(nome)
  if (bruto === undefined) return null

  const valor = Number(bruto)
  if (!Number.isSafeInteger(valor) || valor <= 0) {
    problemas.push(`${nome} tem de ser um inteiro positivo (recebido: "${bruto}").`)
    return null
  }
  return valor
}

function booleano(nome: string, omissao: boolean): boolean {
  const bruto = texto(nome)?.toLowerCase()
  if (bruto === undefined) return omissao
  return bruto === 'true' || bruto === '1' || bruto === 'sim'
}

function ler(): ConfiguracaoBaipaga {
  const problemas: string[] = []

  const baseUrl = texto('BAIPAGA_BASE_URL')
  if (baseUrl === undefined) {
    problemas.push(
      'BAIPAGA_BASE_URL é obrigatória (qualidade: "https://ib.bancobai.ao/QUAMDW-3G/internet-banking/api"; o segmento do ambiente muda em produção).'
    )
  } else if (!/^https:\/\//i.test(baseUrl)) {
    // Exigimos HTTPS, e não "http ou https": a `apiKey` viaja num cabeçalho em
    // todos os pedidos, e em claro é uma credencial oferecida a quem estiver no
    // caminho.
    problemas.push(`BAIPAGA_BASE_URL tem de começar por https:// (recebido: "${baseUrl}").`)
  }

  const apiKey = texto('BAIPAGA_API_KEY')
  if (apiKey === undefined) {
    problemas.push(
      'BAIPAGA_API_KEY é obrigatória (cabeçalho X-MP-ApiKey; sem ela todas as chamadas devolvem 401).'
    )
  }

  const chavePartilhada = texto('BAIPAGA_CHAVE_PARTILHADA') ?? null
  const merchantExternalId = texto('BAIPAGA_MERCHANT_EXTERNAL_ID') ?? null
  const verificarPedida = booleano('BAIPAGA_VERIFICAR_ASSINATURA', true)

  // Pedir a verificação EXPLICITAMENTE sem os dois ingredientes não é um aviso —
  // é uma configuração que promete uma garantia que não pode cumprir, e uma
  // promessa dessas é pior do que não a ter feito. Falha em vez de degradar em
  // silêncio. Quando a variável está ausente estamos na omissão, e aí degradar é
  // o comportamento certo: ainda não há chave partilhada acordada.
  if (verificarPedida && texto('BAIPAGA_VERIFICAR_ASSINATURA') !== undefined) {
    if (chavePartilhada === null) {
      problemas.push(
        'BAIPAGA_VERIFICAR_ASSINATURA está ligada mas BAIPAGA_CHAVE_PARTILHADA não está definida — sem a chave não há nada com que verificar.'
      )
    }
    if (merchantExternalId === null) {
      problemas.push(
        'BAIPAGA_VERIFICAR_ASSINATURA está ligada mas BAIPAGA_MERCHANT_EXTERNAL_ID não está definido — é o último campo da cadeia assinada e tem de vir de fora da resposta.'
      )
    }
  }

  const moeda = (texto('BAIPAGA_MOEDA') ?? 'AOA').toUpperCase()
  if (!/^[A-Z]{3}$/.test(moeda)) {
    problemas.push(`BAIPAGA_MOEDA tem de ser um código ISO 4217 de três letras (recebido: "${moeda}").`)
  }

  const indicativoPais = texto('BAIPAGA_INDICATIVO_PAIS') ?? '244'
  if (!/^\d{1,4}$/.test(indicativoPais)) {
    problemas.push(
      `BAIPAGA_INDICATIVO_PAIS tem de ser 1 a 4 dígitos, sem "+" (recebido: "${indicativoPais}").`
    )
  }

  const canonicalizacao = texto('BAIPAGA_CANONICALIZACAO') ?? 'auto'
  if (!(CANONICALIZACOES as readonly string[]).includes(canonicalizacao)) {
    problemas.push(
      `BAIPAGA_CANONICALIZACAO tem de ser uma de ${CANONICALIZACOES.join(', ')} (recebido: "${canonicalizacao}").`
    )
  }

  const merchantId = inteiroOpcional('BAIPAGA_MERCHANT_ID', problemas)
  const acceptancePointId = inteiroOpcional('BAIPAGA_ACCEPTANCE_POINT_ID', problemas)
  const timeoutMs = inteiro('BAIPAGA_TIMEOUT_MS', 30_000, problemas)
  const casasDecimais = inteiro('BAIPAGA_CASAS_DECIMAIS', 2, problemas)

  if (problemas.length > 0) throw new ConfiguracaoInvalida(problemas)

  return {
    baseUrl: baseUrl!.replace(/\/+$/, ''),
    apiKey: apiKey!,
    chavePartilhada,
    merchantExternalId,
    merchantId,
    acceptancePointId,
    moeda,
    indicativoPais,
    timeoutMs,
    casasDecimais,
    verificarAssinatura: verificarPedida && chavePartilhada !== null && merchantExternalId !== null,
    canonicalizacao: canonicalizacao as Canonicalizacao,
    registarPayloads: booleano('BAIPAGA_REGISTAR_PAYLOADS', true),
  }
}

/** A configuração, lida e validada uma vez. Lança se estiver incompleta. */
export function configuracao(): ConfiguracaoBaipaga {
  cache ??= ler()
  return cache
}

/**
 * Substitui a configuração — para testes e para apontar o cliente a um servidor
 * local sem mexer no ambiente do processo.
 */
export function definirConfiguracao(parcial: Partial<ConfiguracaoBaipaga>): ConfiguracaoBaipaga {
  cache = { ...(cache ?? CONFIGURACAO_DE_TESTE), ...parcial }
  return cache
}

/** Volta a ler do ambiente na próxima chamada. */
export function limparConfiguracao(): void {
  cache = null
}

/**
 * Base neutra para `definirConfiguracao()`. A chave de API e a chave partilhada
 * são placeholders óbvios de propósito: uma credencial de aspecto plausível aqui
 * era uma armadilha à espera de ser copiada para produção.
 */
export const CONFIGURACAO_DE_TESTE: ConfiguracaoBaipaga = {
  baseUrl: 'https://127.0.0.1:1/api',
  apiKey: 'CHAVE-DE-TESTE',
  chavePartilhada: 'SEGREDO-DE-TESTE',
  merchantExternalId: 'MERCH-TESTE',
  merchantId: 1,
  acceptancePointId: 1,
  moeda: 'AOA',
  indicativoPais: '244',
  timeoutMs: 30_000,
  casasDecimais: 2,
  verificarAssinatura: true,
  canonicalizacao: 'auto',
  registarPayloads: false,
}
