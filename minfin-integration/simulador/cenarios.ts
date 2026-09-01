/**
 * Os cenários.
 *
 * "Deve ser simulado os cenários sempre, não assumir que alguma coisa está
 * certa" — é este ficheiro. Cada regra de validação local tem aqui um caso que a
 * faz disparar E um caso vizinho que a faz NÃO disparar; cada modo de falha da
 * rede tem aqui uma simulação; cada divergência do documento que resolvemos por
 * interpretação tem aqui a prova de que a interpretação escolhida é a que o
 * código executa.
 *
 * A lista é consumida por dois corredores:
 *   - `executar.ts`      — `npx tsx minfin-integration/simulador/executar.ts`
 *   - `testes/cenarios.spec.ts` — `node ace test minfin`
 *
 * O mesmo código nos dois, para que "passou nos testes" e "passou no simulador"
 * não possam divergir.
 */

import { generateKeyPairSync } from 'node:crypto'
import { AssinaturaSimulada, JwsCompactoRs256, payloadDocumento } from '../assinatura/jws.js'
import { ClienteAgt, type DocumentoParaRegisto, type Resultado } from '../cliente/cliente_agt.js'
import { lerErros } from '../cliente/normalizacao.js'
import { CONFIGURACAO_DE_TESTE, type ConfiguracaoMinfin } from '../configuracao.js'
import { descreverErro, erroEhTransitorio } from '../dominio/codigos_erro.js'
import { resultadoEFinal } from '../dominio/estados.js'
import { arredondar, montantesIguais } from '../validacao/formatos.js'
import {
  validarConfirmarRejeitar,
  validarListarFacturas,
  validarRegistarFactura,
  validarSolicitarSerie,
  type Violacao,
} from '../validacao/regras.js'
import { igual, naoTemCodigo, temCodigo, verdade } from './assercoes.js'
import {
  facturaAnulada,
  facturaEmDivisa,
  facturaIsenta,
  facturaSimples,
  notaDeCredito,
  recibo,
} from './exemplos.js'
import { ServidorAgtSimulado, type OpcoesDoSimulador } from './servidor_agt_simulado.js'

export interface Cenario {
  grupo: string
  nome: string
  executar(): Promise<void> | void
}

/* ────────────────────────────────────────────────────────────────────────────
 * Andaimes
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Um par de chaves RSA gerado uma vez por processo.
 *
 * 2048 bits porque é o mínimo que se usa a sério, e porque é exactamente esse
 * tamanho que produz os 342 caracteres de assinatura que não cabem nos 256
 * declarados — o cenário "assinatura excede o comprimento declarado" precisa de
 * chaves reais para provar o que prova.
 */
let chaves: { publicKey: string; privateKey: string } | null = null

function chavesDeTeste() {
  chaves ??= generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })
  return chaves
}

export function configuracaoDeCenario(
  sobrepor: Partial<ConfiguracaoMinfin> = {}
): ConfiguracaoMinfin {
  const { privateKey } = chavesDeTeste()

  return {
    ...CONFIGURACAO_DE_TESTE,
    chavePrivadaProdutor: privateKey,
    chavePrivadaEmissor: privateKey,
    ...sobrepor,
  }
}

/** Um cliente com relógio e identificadores fixos — payloads reproduzíveis. */
export function clienteDeCenario(sobrepor: Partial<ConfiguracaoMinfin> = {}) {
  return new ClienteAgt({
    configuracao: configuracaoDeCenario(sobrepor),
    assinatura: new AssinaturaSimulada(),
    relogio: () => new Date('2025-06-15T10:00:00.000Z'),
    gerarId: () => '550e8400-e29b-41d4-a716-446655440000',
  })
}

/** Arranca o simulador, corre o corpo, e desliga-o mesmo que o corpo rebente. */
async function comServidor<T>(
  opcoes: OpcoesDoSimulador,
  corpo: (baseUrl: string, servidor: ServidorAgtSimulado) => Promise<T>
): Promise<T> {
  const servidor = new ServidorAgtSimulado(opcoes)
  const baseUrl = await servidor.iniciar()

  try {
    return await corpo(baseUrl, servidor)
  } finally {
    await servidor.parar()
  }
}

const codigos = (violacoes: Violacao[]) => violacoes.map((v) => v.idError)
const codigosDeFalha = (r: Resultado<unknown>) => (r.ok ? [] : r.erros.map((e) => e.codigo))

function pedidoDe(documentos: DocumentoParaRegisto[], cfg = configuracaoDeCenario()) {
  return clienteDeCenario(cfg).prepararRegisto(documentos).pedido
}

function validar(documentos: DocumentoParaRegisto[], cfg = configuracaoDeCenario()): Violacao[] {
  return validarRegistarFactura(pedidoDe(documentos, cfg), cfg)
}

/* ────────────────────────────────────────────────────────────────────────────
 * Os cenários
 * ──────────────────────────────────────────────────────────────────────────── */

export function construirCenarios(): Cenario[] {
  const cfg = configuracaoDeCenario()

  const cenarios: Cenario[] = []
  const juntar = (grupo: string, nome: string, executar: Cenario['executar']) =>
    cenarios.push({ grupo, nome, executar })

  /* ── Aritmética de dinheiro ─────────────────────────────────────────── */

  juntar('Dinheiro', 'arredonda 1,005 para cima (o caso que o Math.round falha)', () => {
    igual(arredondar(1.005, 2), 1.01, 'arredondar(1.005, 2)')
    igual(arredondar(-1.005, 2), -1.01, 'arredondar(-1.005, 2)')
    igual(arredondar(2.675, 2), 2.68, 'arredondar(2.675, 2)')
  })

  juntar('Dinheiro', 'compara montantes em unidades menores, não em vírgula flutuante', () => {
    verdade(0.1 + 0.2 !== 0.3, 'a premissa: 0,1 + 0,2 não é 0,3 em vírgula flutuante')
    verdade(montantesIguais(0.1 + 0.2, 0.3, 2), '0,1 + 0,2 tem de ser igual a 0,3 em cêntimos')
    verdade(!montantesIguais(10, 10.05, 2), '10,00 não pode ser igual a 10,05')
  })

  /* ── Exemplos válidos: nenhuma regra dispara ────────────────────────── */

  for (const [nome, construir] of [
    ['factura simples', facturaSimples],
    ['factura isenta de IVA', facturaIsenta],
    ['nota de crédito', notaDeCredito],
    ['recibo', recibo],
    ['factura em divisa estrangeira', facturaEmDivisa],
    ['factura anulada', facturaAnulada],
  ] as const) {
    juntar('Validação: casos válidos', `${nome} passa sem violações`, () => {
      const violacoes = validar([construir()])
      verdade(
        violacoes.length === 0,
        `${nome} devia passar, mas deu: ${violacoes.map((v) => `${v.idError} em ${v.campo} (${v.detalhe})`).join(' | ')}`
      )
    })
  }

  juntar('Validação: casos válidos', 'as seis facturas juntas numa só chamada passam', () => {
    const violacoes = validar([
      facturaSimples(),
      facturaIsenta(),
      notaDeCredito(),
      recibo(),
      facturaEmDivisa(),
      facturaAnulada(),
    ])
    verdade(
      violacoes.length === 0,
      `esperava zero violações, obtive ${JSON.stringify(codigos(violacoes))}`
    )
  })

  /* ── Validação: envelope e chamada ──────────────────────────────────── */

  juntar('Validação: envelope', 'E04 quando numberOfEntries não bate com documents', () => {
    const pedido = pedidoDe([facturaSimples()])
    pedido.numberOfEntries = 3
    temCodigo(codigos(validarRegistarFactura(pedido, cfg)), 'E04', 'numberOfEntries mentiroso')
  })

  juntar('Validação: envelope', 'E03 acima de 30 documentos por chamada', () => {
    const trintaEUm = Array.from({ length: 31 }, (_, i) => facturaSimples(`FT AB2025/${i + 1}`))
    temCodigo(codigos(validar(trintaEUm)), 'E03', '31 documentos')
  })

  juntar('Validação: envelope', 'E09 com o mesmo documentNo duas vezes na chamada', () => {
    temCodigo(codigos(validar([facturaSimples(), facturaSimples()])), 'E09', 'documentNo repetido')
  })

  juntar('Validação: envelope', 'E01 sem número de certificação do software', () => {
    const semCertificacao = configuracaoDeCenario({
      software: { nome: 'taesic', versao: '1.0.0', numeroCertificacao: '' },
    })
    temCodigo(codigos(validar([facturaSimples()], semCertificacao)), 'E01', 'sem certificação')
  })

  /* ── Validação: documento ───────────────────────────────────────────── */

  juntar('Validação: documento', 'E02 com documentNo abaixo dos 8 caracteres', () => {
    temCodigo(codigos(validar([facturaSimples('FT/1')])), 'E02', 'documentNo curto')
  })

  juntar('Validação: documento', 'E01 numa factura anulada sem motivo de anulação', () => {
    const d = facturaAnulada()
    delete d.documentCancelReason
    temCodigo(codigos(validar([d])), 'E01', 'anulada sem motivo')
  })

  juntar('Validação: documento', 'E20 com motivo de anulação numa factura não anulada', () => {
    const d = { ...facturaSimples(), documentCancelReason: 'I' as const }
    temCodigo(codigos(validar([d])), 'E20', 'motivo sem anulação')
  })

  juntar('Validação: documento', 'E26 num recibo que leva linhas', () => {
    const d = { ...recibo(), lines: facturaSimples().lines }
    temCodigo(codigos(validar([d])), 'E26', 'recibo com linhas')
  })

  juntar('Validação: documento', 'E27 numa factura que leva dados de recibo', () => {
    const d = { ...facturaSimples(), paymentReceipt: recibo().paymentReceipt }
    temCodigo(codigos(validar([d])), 'E27', 'factura com recibo')
  })

  /* ── Validação: linhas ──────────────────────────────────────────────── */

  juntar('Validação: linhas', 'E12 com a numeração de linhas fora de sequência', () => {
    const d = facturaSimples()
    d.lines![0].lineNumber = 2
    temCodigo(codigos(validar([d])), 'E12', 'lineNumber 2 na primeira linha')
  })

  juntar('Validação: linhas', 'E21 quando o montante não é quantidade × preço base', () => {
    const d = facturaSimples()
    d.lines![0].creditAmount = 1999
    d.documentTotals = { taxPayable: 280, netTotal: 1999, grossTotal: 2279 }
    temCodigo(codigos(validar([d])), 'E21', 'montante da linha errado')
  })

  juntar('Validação: linhas', 'E15 com débito e crédito na mesma linha', () => {
    const d = facturaSimples()
    d.lines![0].debitAmount = 100
    temCodigo(codigos(validar([d])), 'E15', 'débito e crédito juntos')
  })

  juntar('Validação: linhas', 'E01 sem código de isenção numa linha não sujeita a IVA', () => {
    const d = facturaIsenta()
    delete d.lines![0].taxExemptionCode
    temCodigo(codigos(validar([d])), 'E01', 'NS sem taxExemptionCode')
  })

  juntar('Validação: linhas', 'E03 com um código de isenção que não existe na tabela', () => {
    const d = facturaIsenta()
    d.lines![0].taxExemptionCode = 'M99'
    temCodigo(codigos(validar([d])), 'E03', 'M99 não existe no anexo 2.4')
  })

  juntar(
    'Validação: linhas',
    'E13 numa nota de crédito sem referência ao documento de origem',
    () => {
      const d = notaDeCredito()
      delete d.lines![0].referenceInfo
      temCodigo(codigos(validar([d])), 'E13', 'NC sem referência')
    }
  )

  juntar('Validação: linhas', 'E19 com taxBase e creditAmount na mesma linha', () => {
    const d = facturaSimples()
    d.lines![0].taxes![0].taxBase = 500
    temCodigo(codigos(validar([d])), 'E19', 'taxBase com creditAmount')
  })

  juntar('Validação: linhas', 'E43 com taxBase e quantidade diferente de zero', () => {
    const d = facturaSimples()
    delete d.lines![0].creditAmount
    d.lines![0].taxes![0].taxBase = 500
    // quantity continua a 2 — é o que a E43 proíbe.
    temCodigo(codigos(validar([d])), 'E43', 'taxBase com quantidade 2')
  })

  juntar('Validação: linhas', 'E03 com um sistema de imposto desconhecido', () => {
    const d = facturaSimples()
    d.lines![0].taxes![0].taxType = 'XPTO' as any
    temCodigo(codigos(validar([d])), 'E03', 'taxType inventado')
  })

  juntar('Validação: linhas', 'E03 com um taxCode de IVA fora dos cinco permitidos', () => {
    const d = facturaSimples()
    d.lines![0].taxes![0].taxCode = 'ZZZ'
    temCodigo(codigos(validar([d])), 'E03', 'taxCode ZZZ')
  })

  juntar('Validação: linhas', 'AO-CAB é aceite como região de imposto', () => {
    const d = facturaSimples()
    d.lines![0].taxes![0].taxCountryRegion = 'AO-CAB'
    naoTemCodigo(codigos(validar([d])), 'E02', 'Cabinda é uma região válida')
  })

  /* ── Validação: totais ──────────────────────────────────────────────── */

  juntar('Validação: totais', 'E22 com o imposto total diferente da soma das linhas', () => {
    const d = facturaSimples()
    d.documentTotals = { taxPayable: 100, netTotal: 2000, grossTotal: 2100 }
    temCodigo(codigos(validar([d])), 'E22', 'taxPayable errado')
  })

  juntar('Validação: totais', 'E23 com o total sem impostos diferente da soma das linhas', () => {
    const d = facturaSimples()
    d.documentTotals = { taxPayable: 280, netTotal: 1500, grossTotal: 1780 }
    temCodigo(codigos(validar([d])), 'E23', 'netTotal errado')
  })

  juntar('Validação: totais', 'E24 quando grossTotal não é netTotal + taxPayable', () => {
    const d = facturaSimples()
    d.documentTotals = { taxPayable: 280, netTotal: 2000, grossTotal: 9999 }
    temCodigo(codigos(validar([d])), 'E24', 'grossTotal errado')
  })

  juntar('Validação: totais', 'E25 quando o câmbio não dá o total do documento', () => {
    const d = facturaEmDivisa()
    d.documentTotals.currency!.exchangeRate = 500
    temCodigo(codigos(validar([d])), 'E25', 'câmbio errado')
  })

  juntar('Validação: totais', 'E03 com um objecto de divisa em AOA', () => {
    const d = facturaSimples()
    d.documentTotals.currency = { currencyCode: 'AOA', currencyAmount: 2280, exchangeRate: 1 }
    temCodigo(codigos(validar([d])), 'E03', 'divisa AOA não se preenche')
  })

  juntar('Validação: totais', 'E17 numa factura em que os créditos não superam os débitos', () => {
    const d = facturaSimples()
    delete d.lines![0].creditAmount
    d.lines![0].debitAmount = 2000
    // Totais deixados como estavam, positivos: uma factura montada com débitos
    // em vez de créditos está errada nos dois sentidos, e as duas regras
    // disparam. O que este cenário fixa é que E17 é uma delas.
    temCodigo(codigos(validar([d])), 'E17', 'factura com débitos em vez de créditos')
  })

  juntar(
    'Validação: totais',
    'um total negativo é recusado antes de as somas serem comparadas',
    () => {
      // A ordem importa: comparar somas contra um total que nem sequer é um número
      // válido produziria uma segunda queixa sobre a consequência do primeiro erro.
      const d = facturaSimples()
      d.documentTotals = { taxPayable: 280, netTotal: -2000, grossTotal: -1720 }

      const violacoes = validar([d])
      temCodigo(codigos(violacoes), 'E02', 'total negativo')
      naoTemCodigo(codigos(violacoes), 'E23', 'não se compara somas contra um total inválido')
    }
  )

  juntar(
    'Validação: totais',
    'E16 numa nota de crédito em que os créditos superam os débitos',
    () => {
      const d = notaDeCredito()
      delete d.lines![0].debitAmount
      d.lines![0].creditAmount = 500
      temCodigo(codigos(validar([d])), 'E16', 'NC com créditos')
    }
  )

  juntar(
    'Validação: totais',
    'os totais de um recibo não são comparados com linhas que não existem',
    () => {
      // O recibo passa (já provado acima). Este cenário prova o PORQUÊ: com uma
      // regra que não distinguisse recibos, E22 e E23 disparariam contra zero.
      const violacoes = validar([recibo()])
      naoTemCodigo(codigos(violacoes), 'E22', 'recibo não pode disparar E22')
      naoTemCodigo(codigos(violacoes), 'E23', 'recibo não pode disparar E23')
    }
  )

  /* ── Validação: séries e consultas ──────────────────────────────────── */

  const pedidoDeSerie = (sobrepor: Record<string, unknown> = {}) => ({
    ...clienteDeCenario().prepararRegisto([]).pedido,
    jwsSignature: 'x'.repeat(256),
    seriesCode: 'FT12025',
    seriesYear: 2025,
    documentType: 'FT' as const,
    firstDocumentNumber: 1,
    ...sobrepor,
  })

  juntar('Validação: séries', 'uma série bem formada passa (a 15 de Junho de 2025)', () => {
    const violacoes = validarSolicitarSerie(
      pedidoDeSerie() as any,
      cfg,
      new Date('2025-06-15T10:00:00Z')
    )
    verdade(
      violacoes.length === 0,
      `esperava zero violações, obtive ${JSON.stringify(codigos(violacoes))}`
    )
  })

  juntar('Validação: séries', 'E32 quando o código da série não contém o ano', () => {
    const violacoes = validarSolicitarSerie(
      pedidoDeSerie({ seriesCode: 'FTABC' }) as any,
      cfg,
      new Date('2025-06-15T10:00:00Z')
    )
    temCodigo(codigos(violacoes), 'E32', 'FTABC não tem ano')
  })

  juntar('Validação: séries', 'E32 quando o código da série não é alfanumérico', () => {
    const violacoes = validarSolicitarSerie(
      pedidoDeSerie({ seriesCode: 'FT-1/2025' }) as any,
      cfg,
      new Date('2025-06-15T10:00:00Z')
    )
    temCodigo(codigos(violacoes), 'E32', 'FT-1/2025 tem separadores')
  })

  juntar('Validação: séries', 'E33 ao pedir o ano seguinte a 14 de Dezembro', () => {
    const violacoes = validarSolicitarSerie(
      pedidoDeSerie({ seriesCode: 'FT12026', seriesYear: 2026 }) as any,
      cfg,
      new Date('2025-12-14T10:00:00Z')
    )
    temCodigo(codigos(violacoes), 'E33', 'ainda não abriu a janela')
  })

  juntar('Validação: séries', 'o ano seguinte já é aceite a 15 de Dezembro', () => {
    const violacoes = validarSolicitarSerie(
      pedidoDeSerie({ seriesCode: 'FT12026', seriesYear: 2026 }) as any,
      cfg,
      new Date('2025-12-15T10:00:00Z')
    )
    naoTemCodigo(codigos(violacoes), 'E33', 'a partir de 15 de Dezembro pode-se')
  })

  juntar('Validação: consultas', 'E03 com o período de pesquisa invertido', () => {
    const pedido = {
      ...clienteDeCenario().prepararRegisto([]).pedido,
      jwsSignature: 'x'.repeat(256),
      queryStartDate: '2025-03-31',
      queryEndDate: '2025-01-01',
    }
    temCodigo(codigos(validarListarFacturas(pedido as any, cfg)), 'E03', 'início depois do fim')
  })

  juntar('Validação: consultas', 'E03 com uma acção de adquirente que não é C nem R', () => {
    const pedido = {
      ...clienteDeCenario().prepararRegisto([]).pedido,
      jwsSignature: 'x'.repeat(256),
      documentNo: 'FT AB2025/1',
      action: 'X',
    }
    temCodigo(codigos(validarConfirmarRejeitar(pedido as any, cfg)), 'E03', 'acção X')
  })

  /* ── Assinaturas ────────────────────────────────────────────────────── */

  juntar('Assinatura', 'o payload do documento leva os 8 campos pela ordem do Blueprint', () => {
    const payload = payloadDocumento(facturaSimples(), '5000000000')

    igual(
      Object.keys(payload).join(','),
      'documentNo,taxRegistrationNumber,documentType,documentDate,customerTaxID,customerCountry,companyName,documentTotals',
      'ordem das chaves da assinatura do documento'
    )
  })

  juntar('Assinatura', 'a assinatura simulada tem exactamente os 256 caracteres declarados', () => {
    const cliente = clienteDeCenario()
    const avisos: string[] = []
    const assinado = cliente.assinarDocumento(facturaSimples(), avisos)

    igual(assinado.jwsDocumentSignature.length, 256, 'comprimento da assinatura simulada')
    igual(avisos.length, 0, 'não devia haver avisos de comprimento')
  })

  juntar('Assinatura', 'um JWS RS256 real excede os 256 caracteres e produz um aviso', () => {
    const cliente = new ClienteAgt({
      configuracao: configuracaoDeCenario(),
      assinatura: new JwsCompactoRs256(),
      relogio: () => new Date('2025-06-15T10:00:00.000Z'),
    })

    const avisos: string[] = []
    const assinado = cliente.assinarDocumento(facturaSimples(), avisos)

    verdade(
      assinado.jwsDocumentSignature.length > 256,
      `um JWS RS256 de 2048 bits tem de exceder 256 caracteres; tem ${assinado.jwsDocumentSignature.length}`
    )
    igual(avisos.length, 1, 'devia haver exactamente um aviso de comprimento')
    verdade(avisos[0].includes('NÃO foi truncada'), 'o aviso tem de dizer que nada foi truncado')
  })

  juntar(
    'Assinatura',
    'a mesma factura assina sempre igual; um cêntimo a mais muda a assinatura',
    () => {
      const cliente = clienteDeCenario()
      const a = cliente.assinarDocumento(facturaSimples()).jwsDocumentSignature
      const b = cliente.assinarDocumento(facturaSimples()).jwsDocumentSignature
      igual(a, b, 'a assinatura tem de ser determinística')

      const alterada = facturaSimples()
      alterada.documentTotals.grossTotal = 2280.01
      verdade(
        cliente.assinarDocumento(alterada).jwsDocumentSignature !== a,
        'mexer nos totais tem de mudar a assinatura — eles fazem parte do payload assinado'
      )
    }
  )

  /* ── Catálogo de erros ──────────────────────────────────────────────── */

  juntar(
    'Catálogo de erros',
    'E06 quer dizer coisas diferentes em registarFactura e solicitarSerie',
    () => {
      const noRegisto = descreverErro('registarFactura', 'E06') ?? ''
      const naSerie = descreverErro('solicitarSerie', 'E06') ?? ''

      verdade(
        noRegisto.includes('creationDate'),
        `E06 em registarFactura devia falar de creationDate: "${noRegisto}"`
      )
      verdade(
        naSerie.includes('aderiu'),
        `E06 em solicitarSerie devia falar de adesão: "${naSerie}"`
      )
    }
  )

  juntar(
    'Catálogo de erros',
    'E31 quer dizer coisas diferentes em listarFacturas e solicitarSerie',
    () => {
      verdade(
        (descreverErro('listarFacturas', 'E31') ?? '').includes('assinatura'),
        'E31 em listarFacturas é sobre a assinatura do produtor'
      )
      verdade(
        (descreverErro('solicitarSerie', 'E31') ?? '').includes('série'),
        'E31 em solicitarSerie é sobre o código de série já em uso'
      )
    }
  )

  juntar('Catálogo de erros', 'E96 é transitório com 422 e definitivo com 400', () => {
    verdade(
      erroEhTransitorio('E96', 422),
      'E96/422 é "ainda em processamento" — repetir mais tarde'
    )
    verdade(!erroEhTransitorio('E96', 400), 'E96/400 é "erro de estrutura" — repetir não resolve')
  })

  juntar(
    'Catálogo de erros',
    'um código desconhecido devolve null em vez de uma frase inventada',
    () => {
      igual(descreverErro('registarFactura', 'E77'), null, 'E77 não existe no documento')
    }
  )

  juntar('Estados', 'só 0, 1, 2 e 9 terminam o ciclo de obterEstado', () => {
    for (const codigo of [0, 1, 2, 9]) verdade(resultadoEFinal(codigo), `${codigo} é final`)
    for (const codigo of [7, 8]) verdade(!resultadoEFinal(codigo), `${codigo} pede nova chamada`)
  })

  /* ── Rede: caminho feliz ────────────────────────────────────────────── */

  juntar('Rede', 'registarFacturas devolve o requestID', () =>
    comServidor({ cenario: 'sucesso' }, async (baseUrl) => {
      const r = await clienteDeCenario({ baseUrl }).registarFacturas([facturaSimples()])

      verdade(r.ok, `esperava sucesso, obtive ${JSON.stringify(codigosDeFalha(r))}`)
      igual(r.dados.requestID, '123456789012345', 'requestID')
      igual(r.httpStatus, 200, 'estado HTTP')
    })
  )

  juntar('Rede', 'o corpo JSON chega ao servidor num pedido GET', () =>
    comServidor({ cenario: 'sucesso' }, async (baseUrl, servidor) => {
      await clienteDeCenario({ baseUrl }).obterEstado('123456789012345')

      const chamada = servidor.chamadas.at(-1)!
      igual(chamada.metodo, 'GET', 'o documento define obterEstado como GET')
      verdade(
        chamada.trouxeCorpo,
        'o corpo JSON tem de chegar — é o que o fetch() não permite fazer'
      )
      igual(chamada.corpo.requestID, '123456789012345', 'requestID dentro do corpo do GET')
    })
  )

  juntar('Rede', 'a estratégia "query" põe o pedido na query string e não envia corpo', () =>
    comServidor({ cenario: 'sucesso' }, async (baseUrl) => {
      const servidor = new ServidorAgtSimulado({ cenario: 'sucesso' })
      const url = await servidor.iniciar()

      try {
        await clienteDeCenario({ baseUrl: url, estrategiaGet: 'query' }).obterEstado(
          '123456789012345'
        )

        const chamada = servidor.chamadas.at(-1)!
        verdade(!chamada.trouxeCorpo, 'em "query" não pode ir corpo nenhum')
        igual(chamada.emQuery.requestID, '123456789012345', 'requestID na query string')
        verdade(
          chamada.emQuery.softwareInfo?.startsWith('{'),
          'softwareInfo vai como JSON no parâmetro'
        )
      } finally {
        await servidor.parar()
      }

      void baseUrl
    })
  )

  juntar('Rede', 'a estratégia "post" troca o método e anuncia a intenção no cabeçalho', () =>
    comServidor({ cenario: 'sucesso' }, async (baseUrl, servidor) => {
      await clienteDeCenario({ baseUrl, estrategiaGet: 'post' }).obterEstado('123456789012345')

      const chamada = servidor.chamadas.at(-1)!
      igual(chamada.metodo, 'POST', 'método efectivo')
      igual(chamada.cabecalhos['x-http-method-override'] as string, 'GET', 'cabeçalho de intenção')
      verdade(chamada.trouxeCorpo, 'o corpo continua a ir')
    })
  )

  juntar('Rede', 'a nomenclatura "tabelas" muda os nomes dos campos que saem', () =>
    comServidor({ cenario: 'sucesso' }, async (baseUrl, servidor) => {
      await clienteDeCenario({ baseUrl, nomenclatura: 'tabelas' }).registarFacturas([
        facturaSimples(),
      ])

      const enviado = servidor.chamadas.at(-1)!.corpo
      verdade(enviado.submissionId !== undefined, 'em "tabelas" sai submissionId')
      verdade(enviado.submissionGUID === undefined, 'em "tabelas" NÃO sai submissionGUID')
      verdade(
        enviado.softwareInfo.softwareInfoDetail !== undefined,
        'sai softwareInfoDetail (singular)'
      )
      verdade(
        enviado.softwareInfo.softwareInfoDetail.productId !== undefined,
        'os detalhes usam productId/productVersion/softwareValidationNumber'
      )
      verdade(
        /^[A-Z]{5}-\d{8}-\d{4}$/.test(enviado.submissionId),
        `submissionId mal formado: ${enviado.submissionId}`
      )
    })
  )

  juntar('Rede', 'a nomenclatura "exemplos" (omissão) sai com submissionGUID', () =>
    comServidor({ cenario: 'sucesso' }, async (baseUrl, servidor) => {
      await clienteDeCenario({ baseUrl }).registarFacturas([facturaSimples()])

      const enviado = servidor.chamadas.at(-1)!.corpo
      igual(enviado.submissionGUID, '550e8400-e29b-41d4-a716-446655440000', 'submissionGUID')
      verdade(enviado.submissionId === undefined, 'não pode sair submissionId ao mesmo tempo')
      verdade(
        enviado.softwareInfo.softwareInfoDetails.softwareValidationNo !== undefined,
        'softwareValidationNo'
      )
    })
  )

  /* ── Rede: validação diferida ───────────────────────────────────────── */

  juntar('Rede', 'obterEstado devolve 8 enquanto processa e depois o resultado final', () =>
    comServidor(
      { cenario: 'sucesso', ciclosDeProcessamento: 2, resultadoFinal: 0 },
      async (baseUrl) => {
        const cliente = clienteDeCenario({ baseUrl })

        for (const tentativa of [1, 2]) {
          const emCurso = await cliente.obterEstado('123456789012345')
          verdade(emCurso.ok, `tentativa ${tentativa} devia responder`)
          igual(emCurso.dados.resultCode, 8, `tentativa ${tentativa}: ainda em processamento`)
          verdade(!resultadoEFinal(emCurso.dados.resultCode), 'não é um resultado final')
          verdade(!emCurso.dados.documentStatusList, 'com resultCode 8 não vem lista de documentos')
        }

        const final = await cliente.obterEstado('123456789012345')
        verdade(final.ok, 'a terceira tentativa devia responder')
        igual(final.dados.resultCode, 0, 'processamento concluído sem facturas inválidas')
        verdade(resultadoEFinal(final.dados.resultCode), 'é um resultado final')
        igual(final.dados.documentStatusList?.[0].documentStatus, 'V', 'a factura é válida')
      }
    )
  )

  juntar('Rede', 'obterEstado traz os erros por documento quando há facturas inválidas', () =>
    comServidor(
      { cenario: 'sucesso', resultadoFinal: 1, documentosInvalidos: ['FT AB2025/9'] },
      async (baseUrl) => {
        const r = await clienteDeCenario({ baseUrl }).obterEstado('123456789012345')

        verdade(r.ok, 'devia responder')
        igual(r.dados.resultCode, 1, 'válidas e inválidas')

        const invalida = r.dados.documentStatusList!.find((d) => d.documentStatus === 'I')
        verdade(!!invalida, 'tinha de vir uma factura inválida')
        igual(invalida!.documentNo, 'FT AB2025/9', 'documento inválido')
        igual(invalida!.errorList?.[0].errorCode, 'E22', 'com o erro que a invalidou')
      }
    )
  )

  /* ── Rede: os outros serviços ───────────────────────────────────────── */

  juntar('Rede', 'listarFacturas lê a forma normativa (tabelas)', () =>
    comServidor({ cenario: 'sucesso' }, async (baseUrl) => {
      const r = await clienteDeCenario({ baseUrl }).listarFacturas('2025-01-01', '2025-01-31')

      verdade(r.ok, `esperava sucesso, obtive ${JSON.stringify(codigosDeFalha(r))}`)
      igual(r.dados.documentResultCount, 2, 'contagem')
      igual(r.dados.documentResultList[0].documentNo, 'FT AB2025/1', 'primeiro documento')
    })
  )

  juntar('Rede', 'listarFacturas lê também a forma dos exemplos (statusFEListResult)', () =>
    comServidor({ cenario: 'sucesso-forma-de-exemplo' }, async (baseUrl) => {
      const r = await clienteDeCenario({ baseUrl }).listarFacturas('2025-01-01', '2025-01-31')

      verdade(r.ok, 'a normalização tem de aceitar a segunda forma do documento')
      igual(r.dados.documentResultCount, 2, 'contagem')
      igual(r.dados.documentResultList[1].documentDate, '2025-01-04', 'segunda data')
    })
  )

  juntar('Rede', 'consultarFactura devolve o histórico do documento', () =>
    comServidor({ cenario: 'sucesso' }, async (baseUrl) => {
      const r = await clienteDeCenario({ baseUrl }).consultarFactura('FT AB2025/1')

      verdade(r.ok, `esperava sucesso, obtive ${JSON.stringify(codigosDeFalha(r))}`)
      igual(r.dados.documentNo, 'FT AB2025/1', 'documentNo')
      igual(r.dados.documents.length, 1, 'uma versão do documento')
      igual(r.dados.documents[0].hash, 'XXXXXXXXX', 'o hash que só aparece nos exemplos')
    })
  )

  juntar('Rede', 'solicitarSerie com resultCode 1 é sucesso', () =>
    comServidor({ cenario: 'sucesso', resultadoDaSerie: 1 }, async (baseUrl) => {
      const r = await clienteDeCenario({ baseUrl }).solicitarSerie({
        seriesCode: 'FT12025',
        seriesYear: 2025,
        documentType: 'FT',
        firstDocumentNumber: 1,
      })

      verdade(r.ok, `esperava sucesso, obtive ${JSON.stringify(codigosDeFalha(r))}`)
      verdade(r.dados.sucesso, 'resultCode 1 é sucesso')
    })
  )

  juntar('Rede', 'solicitarSerie com resultCode 0 é uma recusa comunicada com HTTP 200', () =>
    comServidor({ cenario: 'sucesso', resultadoDaSerie: 0 }, async (baseUrl) => {
      const r = await clienteDeCenario({ baseUrl }).solicitarSerie({
        seriesCode: 'FT12025',
        seriesYear: 2025,
        documentType: 'FT',
        firstDocumentNumber: 1,
      })

      // A distinção que este cenário existe para fixar: a CHAMADA correu bem
      // (ok: true), a OPERAÇÃO falhou (sucesso: false). Colapsar as duas cria
      // séries que a AGT nunca registou.
      verdade(r.ok, 'a chamada em si correu bem')
      verdade(!r.dados.sucesso, 'mas a série não foi criada')
    })
  )

  juntar('Rede', 'listarSeries devolve as séries do contribuinte', () =>
    comServidor({ cenario: 'sucesso' }, async (baseUrl) => {
      const r = await clienteDeCenario({ baseUrl }).listarSeries({ documentType: 'FT' })

      verdade(r.ok, `esperava sucesso, obtive ${JSON.stringify(codigosDeFalha(r))}`)
      igual(r.dados.seriesResultCount, 1, 'contagem')
      igual(r.dados.seriesInfo[0].seriesCode, 'FT12025', 'código da série')
      igual(r.dados.seriesInfo[0].invoicingMethod, 'FESF', 'emissão via software de facturação')
    })
  )

  juntar('Rede', 'confirmarRejeitarDocumento devolve C_OK e R_OK', () =>
    comServidor({ cenario: 'sucesso' }, async (baseUrl) => {
      const cliente = clienteDeCenario({ baseUrl })

      const confirmado = await cliente.confirmarRejeitarDocumento('FT AB2025/1', 'C')
      verdade(confirmado.ok, 'confirmação devia correr')
      igual(confirmado.dados.actionResultCode, 'C_OK', 'confirmação')

      const rejeitado = await cliente.confirmarRejeitarDocumento('FT AB2025/1', 'R')
      verdade(rejeitado.ok, 'rejeição devia correr')
      igual(rejeitado.dados.actionResultCode, 'R_OK', 'rejeição')
    })
  )

  /* ── Rede: modos de falha ───────────────────────────────────────────── */

  juntar('Falhas', '400 com errorList: erros por documento, sem repetição', () =>
    comServidor({ cenario: 'erro-de-validacao' }, async (baseUrl) => {
      const r = await clienteDeCenario({ baseUrl }).registarFacturas([facturaSimples()])

      verdade(!r.ok, 'devia ser recusado')
      igual(r.tipo, 'recusado', 'tipo de falha')
      igual(r.repetivel, false, 'repetir o mesmo conteúdo dá o mesmo erro')
      temCodigo(codigosDeFalha(r), 'E05', 'primeiro erro')
      temCodigo(codigosDeFalha(r), 'E22', 'segundo erro')

      const porDocumento = r.erros.find((e) => e.codigo === 'E22')
      igual(
        porDocumento!.documentNo,
        'FT AB2025/1',
        'o erro tem de dizer a que documento se refere'
      )
    })
  )

  const falhasDeChamada = [
    { cenario: 'nif-diferente', codigo: 'E95', status: 422, repetivel: false },
    { cenario: 'prematura', codigo: 'E97', status: 422, repetivel: true },
    { cenario: 'em-processamento', codigo: 'E96', status: 422, repetivel: true },
    { cenario: 'demasiadas-solicitacoes', codigo: 'E98', status: 429, repetivel: true },
    { cenario: 'erro-de-estrutura', codigo: 'E96', status: 400, repetivel: false },
  ] as const

  for (const caso of falhasDeChamada) {
    juntar('Falhas', `${caso.status} ${caso.codigo} → recusado, repetível: ${caso.repetivel}`, () =>
      comServidor({ cenario: caso.cenario }, async (baseUrl) => {
        const r = await clienteDeCenario({ baseUrl }).obterEstado('123456789012345')

        verdade(!r.ok, 'devia falhar')
        igual(r.tipo, 'recusado', 'tipo')
        igual(r.httpStatus, caso.status, 'estado HTTP')
        temCodigo(codigosDeFalha(r), caso.codigo, 'código devolvido')
        igual(r.repetivel, caso.repetivel, 'decisão de repetir')
      })
    )
  }

  juntar('Falhas', 'um errorEntry que vem como objecto único é lido na mesma', () =>
    comServidor({ cenario: 'nif-diferente' }, async (baseUrl, servidor) => {
      const r = await clienteDeCenario({ baseUrl }).obterEstado('123456789012345')

      // O simulador devolve `{ errorEntry: {...} }` — objecto, não array —
      // porque é isso que as tabelas de saída do documento dizem. Enquanto a
      // normalização só aceitava arrays, os cinco erros de chamada (E94–E98)
      // chegavam todos como "E99 — sem detalhe".
      verdade(!r.ok, 'devia falhar')
      igual(r.erros.length, 1, 'um erro, não zero')
      igual(r.erros[0].codigo, 'E95', 'o código que o servidor mandou')
      verdade(
        r.erros[0].descricao.includes('NIF emissor diferente'),
        `a descrição devia ser a do servidor: "${r.erros[0].descricao}"`
      )
      igual(servidor.chamadas.length, 1, 'uma só chamada — não é repetível')
    })
  )

  juntar('Falhas', 'um corpo sem códigos de erro não inventa erros', () => {
    // O caminho de fallback passa o corpo inteiro ao leitor de erros. Sem o
    // filtro por código, um corpo que não é um erro produzia um "erro" de código
    // vazio e descrição vazia — que parece informação e não é.
    igual(lerErros({ qualquerCoisa: 'sem erros aqui' }).length, 0, 'corpo sem erros')
    igual(lerErros(null).length, 0, 'corpo vazio')
    igual(
      lerErros({ errorEntry: { errorCode: 'E98', errorDescription: 'x' } }).length,
      1,
      'objecto único'
    )
  })

  juntar('Falhas', 'timeout → indisponível e repetível, sem lançar', () =>
    comServidor({ cenario: 'sem-resposta' }, async (baseUrl) => {
      const r = await clienteDeCenario({ baseUrl, timeoutMs: 300 }).obterEstado('123456789012345')

      verdade(!r.ok, 'devia falhar')
      igual(r.tipo, 'indisponivel', 'um serviço em baixo não é uma recusa')
      igual(r.repetivel, true, 'repetir mais tarde faz sentido')
      igual(r.httpStatus, null, 'não houve resposta HTTP')
    })
  )

  juntar('Falhas', 'resposta em HTML → resposta-inválida, não repetível', () =>
    comServidor({ cenario: 'corpo-nao-json' }, async (baseUrl) => {
      const r = await clienteDeCenario({ baseUrl }).obterEstado('123456789012345')

      verdade(!r.ok, 'devia falhar')
      igual(r.tipo, 'resposta-invalida', 'HTML onde devia vir JSON')
      igual(r.repetivel, false, 'repetir não transforma HTML em JSON')
    })
  )

  juntar('Falhas', '500 sem corpo → recusado mas repetível', () =>
    comServidor({ cenario: 'avaria' }, async (baseUrl) => {
      const r = await clienteDeCenario({ baseUrl }).obterEstado('123456789012345')

      verdade(!r.ok, 'devia falhar')
      igual(r.httpStatus, 500, 'estado HTTP')
      igual(r.repetivel, true, 'uma avaria do lado deles passa')
    })
  )

  juntar('Falhas', 'a validação local trava o pedido antes de ele sair', () =>
    comServidor({ cenario: 'sucesso' }, async (baseUrl, servidor) => {
      const invalida = facturaSimples()
      invalida.documentTotals.grossTotal = 9999

      const r = await clienteDeCenario({ baseUrl }).registarFacturas([invalida])

      verdade(!r.ok, 'devia falhar')
      igual(r.tipo, 'validacao-local', 'apanhado aqui, não lá')
      igual(servidor.chamadas.length, 0, 'nenhuma chamada pode ter chegado ao servidor')
      temCodigo(codigosDeFalha(r), 'E24', 'com o código que a AGT usaria')
    })
  )

  juntar('Falhas', 'o servidor errado (porta fechada) → indisponível, sem lançar', async () => {
    // Porta 1 em 127.0.0.1: recusa de ligação imediata e determinística.
    const r = await clienteDeCenario({
      baseUrl: 'http://127.0.0.1:1/facturaElectronica',
    }).obterEstado('1')

    verdade(!r.ok, 'devia falhar')
    igual(r.tipo, 'indisponivel', 'ligação recusada')
    igual(r.repetivel, true, 'pode voltar')
  })

  return cenarios
}
