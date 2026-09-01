/**
 * Configuração da integração com a facturação electrónica da AGT.
 *
 * ── Porque é que isto não está em `start/env.ts` ──────────────────────────────
 *
 * Por decisão deliberada de manter o módulo inteiro dentro de
 * `minfin-integration/`: ele arranca, valida-se e falha sozinho, e pode ser
 * copiado para outro serviço sem arrastar meio `start/`. O preço é não haver
 * validação no arranque da aplicação — quem quiser essa rede acrescenta o bloco
 * do fim do `README.md` a `start/env.ts` e nada aqui muda.
 *
 * A validação acontece na PRIMEIRA utilização, não na importação: importar este
 * ficheiro num teste que só quer as tabelas do domínio não pode exigir chaves
 * RSA no ambiente.
 */

import { readFileSync } from 'node:fs'

/**
 * Qual das duas grafias do documento se emite.
 *
 * - `exemplos` (omissão) — `submissionGUID`, `softwareInfoDetails`,
 *   `softwareName`/`softwareVersion`/`softwareValidationNo`.
 * - `tabelas` — `submissionId`, `softwareInfoDetail`,
 *   `productId`/`productVersion`/`softwareValidationNumber`.
 *
 * As duas estão no mesmo documento a descrever a mesma chamada. Isto é o
 * interruptor para quando a AGT disser qual vale, e é uma variável de ambiente
 * porque a resposta pode ser diferente entre o ambiente de testes e o de
 * produção deles. Ver `DIVERGENCIAS.md` #C-02.
 */
export type Nomenclatura = 'exemplos' | 'tabelas'

/**
 * Como se envia o corpo JSON dos quatro serviços que o documento define como
 * `GET` (`obterEstado`, `listarFacturas`, `consultarFactura`, `listarSeries`).
 *
 * - `corpo-em-get` (omissão) — GET com corpo, literalmente o que o documento
 *   pede. Exige o cliente HTTP de baixo nível (`node:http`), porque o `fetch()`
 *   do Node RECUSA-SE a enviar corpo num GET: lança
 *   `TypeError: Request with GET/HEAD method cannot have body`.
 * - `post` — POST com o mesmo corpo, mais `X-HTTP-Method-Override: GET`.
 * - `query` — os campos de topo achatados na query string, sem corpo.
 *
 * Não é uma preferência de estilo: intermediários (proxies, WAFs, balanceadores)
 * descartam corpos de GET com frequência, e nesse caso a chamada chega à AGT
 * vazia e é rejeitada com um erro de estrutura que não diz porquê. Ver
 * `DIVERGENCIAS.md` #T-01.
 */
export type EstrategiaGet = 'corpo-em-get' | 'post' | 'query'

export interface ConfiguracaoMinfin {
  /** Ex.: `https://sigt.minfin.gv.ao:8443/facturaElectronica`. Sem barra final. */
  baseUrl: string
  /** NIF do contribuinte emissor. */
  nif: string
  schemaVersion: string
  software: {
    nome: string
    versao: string
    /** Número de certificação atribuído pela AGT ao software. */
    numeroCertificacao: string
  }
  /** Chave privada do PRODUTOR de software, PEM. Assina `softwareInfo`. */
  chavePrivadaProdutor: string
  /** Chave privada do CONTRIBUINTE emissor, PEM. Assina documentos e chamadas. */
  chavePrivadaEmissor: string
  nomenclatura: Nomenclatura
  estrategiaGet: EstrategiaGet
  timeoutMs: number
  /**
   * Casas decimais com que os totais são comparados às somas das linhas.
   *
   * 2 é o que faz sentido para AOA. Existe como variável porque as regras E22 a
   * E25 comparam números que passaram por divisões (rateio de desconto global,
   * câmbio) e a tolerância certa é uma pergunta para a AGT, não uma constante
   * óbvia.
   */
  casasDecimais: number
  /** Ligar o registo do pedido/resposta em `minfin_submissao`. */
  registarPayloads: boolean
}

let cache: ConfiguracaoMinfin | null = null

class ConfiguracaoInvalida extends Error {
  constructor(problemas: string[]) {
    super(
      'Configuração da integração MINFIN incompleta ou inválida:\n' +
        problemas.map((p) => `  - ${p}`).join('\n') +
        '\n\nVer minfin-integration/README.md, secção "Variáveis de ambiente".'
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

function booleano(nome: string, omissao: boolean): boolean {
  const bruto = texto(nome)?.toLowerCase()
  if (bruto === undefined) return omissao
  return bruto === 'true' || bruto === '1' || bruto === 'sim'
}

/**
 * Lê a chave de `<NOME>` (PEM literal) ou de `<NOME>_FILE` (caminho).
 *
 * As duas formas existem porque as duas aparecem na prática: um PEM inteiro numa
 * variável de ambiente sobrevive mal a `\n` mal escapados, e um caminho não
 * serve num contentor sem volume. Se as duas estiverem presentes ganha o
 * ficheiro — é a que se consegue rodar sem reiniciar o processo.
 */
function chavePem(nome: string, problemas: string[]): string {
  const caminho = texto(`${nome}_FILE`)

  if (caminho !== undefined) {
    try {
      const conteudo = readFileSync(caminho, 'utf8')
      if (!conteudo.includes('PRIVATE KEY')) {
        problemas.push(
          `${nome}_FILE aponta para "${caminho}", que não contém uma chave privada PEM.`
        )
      }
      return conteudo
    } catch (erro: any) {
      problemas.push(
        `${nome}_FILE aponta para "${caminho}", que não pôde ser lido: ${erro?.code ?? erro?.message}.`
      )
      return ''
    }
  }

  const literal = texto(nome)
  if (literal === undefined) {
    problemas.push(`${nome} (ou ${nome}_FILE) é obrigatória.`)
    return ''
  }

  // Um PEM colado numa variável de ambiente chega quase sempre com os `\n`
  // literais em vez de quebras de linha. Sem isto, o `node:crypto` recusa a
  // chave com "error:09... PEM routines::no start line", que não diz porquê.
  const normalizada = literal.includes('\\n') ? literal.replace(/\\n/g, '\n') : literal

  if (!normalizada.includes('PRIVATE KEY')) {
    problemas.push(
      `${nome} não parece uma chave privada PEM (falta o cabeçalho "-----BEGIN ... PRIVATE KEY-----").`
    )
  }

  return normalizada
}

function ler(): ConfiguracaoMinfin {
  const problemas: string[] = []

  const baseUrl = texto('MINFIN_BASE_URL')
  if (baseUrl === undefined) {
    problemas.push(
      'MINFIN_BASE_URL é obrigatória (o Blueprint entrega os endpoints como "http://xxx.xxx.xxx.xxx:yyyy/facturaElectronica/", por preencher).'
    )
  } else if (!/^https?:\/\//i.test(baseUrl)) {
    problemas.push(
      `MINFIN_BASE_URL tem de começar por http:// ou https:// (recebido: "${baseUrl}").`
    )
  }

  const nif = texto('MINFIN_NIF')
  if (nif === undefined) {
    problemas.push('MINFIN_NIF é obrigatória.')
  } else if (nif.length > 15) {
    problemas.push(
      `MINFIN_NIF excede os 15 caracteres do campo taxRegistrationNumber (${nif.length}).`
    )
  }

  const nome = texto('MINFIN_SOFTWARE_NOME')
  const versao = texto('MINFIN_SOFTWARE_VERSAO')
  const certificacao = texto('MINFIN_SOFTWARE_CERTIFICACAO')

  if (nome === undefined) problemas.push('MINFIN_SOFTWARE_NOME é obrigatória.')
  if (versao === undefined) problemas.push('MINFIN_SOFTWARE_VERSAO é obrigatória.')
  if (certificacao === undefined) {
    problemas.push(
      'MINFIN_SOFTWARE_CERTIFICACAO é obrigatória (número de certificação do software junto da AGT; sem ele a chamada devolve E07).'
    )
  }

  const chavePrivadaProdutor = chavePem('MINFIN_CHAVE_PRODUTOR', problemas)
  const chavePrivadaEmissor = chavePem('MINFIN_CHAVE_EMISSOR', problemas)

  const nomenclaturaBruta = texto('MINFIN_NOMENCLATURA') ?? 'exemplos'
  if (nomenclaturaBruta !== 'exemplos' && nomenclaturaBruta !== 'tabelas') {
    problemas.push(
      `MINFIN_NOMENCLATURA tem de ser "exemplos" ou "tabelas" (recebido: "${nomenclaturaBruta}").`
    )
  }

  const estrategiaBruta = texto('MINFIN_ESTRATEGIA_GET') ?? 'corpo-em-get'
  if (!['corpo-em-get', 'post', 'query'].includes(estrategiaBruta)) {
    problemas.push(
      `MINFIN_ESTRATEGIA_GET tem de ser "corpo-em-get", "post" ou "query" (recebido: "${estrategiaBruta}").`
    )
  }

  const timeoutMs = inteiro('MINFIN_TIMEOUT_MS', 30_000, problemas)
  const casasDecimais = inteiro('MINFIN_CASAS_DECIMAIS', 2, problemas)

  if (problemas.length > 0) throw new ConfiguracaoInvalida(problemas)

  return {
    baseUrl: baseUrl!.replace(/\/+$/, ''),
    nif: nif!,
    schemaVersion: texto('MINFIN_SCHEMA_VERSION') ?? '1.0',
    software: { nome: nome!, versao: versao!, numeroCertificacao: certificacao! },
    chavePrivadaProdutor,
    chavePrivadaEmissor,
    nomenclatura: nomenclaturaBruta as Nomenclatura,
    estrategiaGet: estrategiaBruta as EstrategiaGet,
    timeoutMs,
    casasDecimais,
    registarPayloads: booleano('MINFIN_REGISTAR_PAYLOADS', true),
  }
}

/** A configuração, lida e validada uma vez. Lança se estiver incompleta. */
export function configuracao(): ConfiguracaoMinfin {
  cache ??= ler()
  return cache
}

/**
 * Substitui a configuração — para testes e para o simulador, que precisam de
 * apontar o cliente a um servidor local sem mexer no ambiente do processo.
 */
export function definirConfiguracao(parcial: Partial<ConfiguracaoMinfin>): ConfiguracaoMinfin {
  cache = { ...(cache ?? CONFIGURACAO_DE_TESTE), ...parcial }
  return cache
}

/** Volta a ler do ambiente na próxima chamada. */
export function limparConfiguracao(): void {
  cache = null
}

/**
 * Base neutra para `definirConfiguracao()`. Chaves vazias de propósito: quem a
 * usa tem de fornecer as suas, e uma chave falsa aqui seria uma armadilha à
 * espera de ser copiada para produção.
 */
export const CONFIGURACAO_DE_TESTE: ConfiguracaoMinfin = {
  baseUrl: 'http://127.0.0.1:0',
  nif: '5000000000',
  schemaVersion: '1.0',
  software: { nome: 'taesic', versao: '0.0.0', numeroCertificacao: '000000000' },
  chavePrivadaProdutor: '',
  chavePrivadaEmissor: '',
  nomenclatura: 'exemplos',
  estrategiaGet: 'corpo-em-get',
  timeoutMs: 30_000,
  casasDecimais: 2,
  registarPayloads: false,
}
