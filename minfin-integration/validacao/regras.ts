/**
 * Validação LOCAL, antes de a chamada sair.
 *
 * ── Porquê validar aqui o que a AGT já valida ─────────────────────────────────
 *
 * Porque a validação da AGT em `registarFactura` é DIFERIDA: a chamada devolve um
 * `requestID` e a resposta a sério só aparece mais tarde, num `obterEstado`. Uma
 * factura com um total mal somado só se descobre inválida horas depois, já com o
 * documento entregue ao cliente e o número da série gasto. Tudo o que se possa
 * verificar antes de sair, verifica-se antes de sair.
 *
 * ── O que NÃO está aqui, e porquê ─────────────────────────────────────────────
 *
 * As regras que dependem do estado do sistema da AGT — se o NIF tem actividade
 * registada (E05), se o contribuinte aderiu à facturação electrónica (E28), se
 * a factura já consta no repositório (E09), se o documento de referência existe
 * (E14), se o montante a regularizar excede o remanescente (E41/E42). Nada disso
 * é verificável deste lado, e fingir que é seria pior do que não tentar.
 *
 * Cada violação leva o código de erro da AGT que lhe corresponde, para que a
 * mensagem que o utilizador vê antes do envio seja a mesma que veria depois.
 */

import type { ConfiguracaoMinfin } from '../configuracao.js'
import type {
  Documento,
  Imposto,
  Linha,
  PedidoConfirmarRejeitar,
  PedidoConsultarFactura,
  PedidoListarFacturas,
  PedidoObterEstado,
  PedidoRegistarFactura,
  PedidoSolicitarSerie,
} from '../contratos/contratos.js'
import { ACCOES_ADQUIRENTE, ESTADOS_DOCUMENTO, MOTIVOS_ANULACAO } from '../dominio/estados.js'
import {
  codigoDeImpostoValido,
  regiaoDeImpostoValida,
  TIPOS_IMPOSTO,
  TIPOS_RETENCAO,
} from '../dominio/impostos.js'
import { isencaoIvaValida } from '../dominio/isencoes_iva.js'
import { eNotaDeCredito, eTipoDocumento, exigeRecibo } from '../dominio/tipos_documento.js'
import {
  arredondar,
  eData,
  eInteiroDesde,
  eNumeroNaoNegativo,
  eNumeroPositivo,
  eSubmissionId,
  eTextoEntre,
  eTimestampComFuso,
  eTimestampLocal,
  eUuid,
  formatarMontante,
  montantesIguais,
  preenchido,
  somar,
} from './formatos.js'

/** Máximo de documentos por chamada — "prevê-se um máximo de 30" (1.1.2). */
export const MAXIMO_DOCUMENTOS = 30

export interface Violacao {
  /** Código do catálogo da AGT que corresponde a esta falha. */
  idError: string
  /** Caminho do campo, ex.: `documents[0].lines[2].quantity`. */
  campo: string
  /** Frase em português, para quem emitiu a factura. */
  detalhe: string
  /** Presente quando a falha é dentro de um documento concreto. */
  documentNo?: string
}

function v(idError: string, campo: string, detalhe: string, documentNo?: string): Violacao {
  return documentNo ? { idError, campo, detalhe, documentNo } : { idError, campo, detalhe }
}

/* ────────────────────────────────────────────────────────────────────────────
 * Envelope — comum aos sete serviços
 * ──────────────────────────────────────────────────────────────────────────── */

function validarEnvelope(
  pedido: Record<string, any>,
  cfg: ConfiguracaoMinfin,
  opcoes: { exigeJwsSignature: boolean }
): Violacao[] {
  const erros: Violacao[] = []

  if (!preenchido(pedido.schemaVersion)) {
    erros.push(v('E01', 'schemaVersion', 'Falta a versão do schema do serviço.'))
  }

  if (!preenchido(pedido.taxRegistrationNumber)) {
    erros.push(v('E01', 'taxRegistrationNumber', 'Falta o número fiscal do contribuinte emissor.'))
  } else if (!eTextoEntre(pedido.taxRegistrationNumber, 1, 15)) {
    erros.push(
      v(
        'E02',
        'taxRegistrationNumber',
        'O número fiscal do emissor excede os 15 caracteres permitidos.'
      )
    )
  }

  if (!eTimestampComFuso(pedido.submissionTimeStamp)) {
    erros.push(
      v(
        'E02',
        'submissionTimeStamp',
        'A data/hora de submissão tem de estar em ISO 8601 com fuso horário (ex.: 2025-05-27T14:30:00Z).'
      )
    )
  }

  // Exactamente um dos dois identificadores, consoante a nomenclatura escolhida.
  if (cfg.nomenclatura === 'exemplos') {
    if (!preenchido(pedido.submissionGUID)) {
      erros.push(v('E01', 'submissionGUID', 'Falta o identificador único da solicitação.'))
    } else if (!eUuid(pedido.submissionGUID)) {
      erros.push(
        v('E02', 'submissionGUID', 'O identificador da solicitação tem de ser um UUID válido.')
      )
    }
  } else {
    if (!preenchido(pedido.submissionId)) {
      erros.push(v('E01', 'submissionId', 'Falta o identificador da solicitação.'))
    } else if (!eSubmissionId(pedido.submissionId)) {
      erros.push(
        v(
          'E02',
          'submissionId',
          'O identificador da solicitação tem de seguir o formato xxxxx-99999999-9999.'
        )
      )
    }
  }

  const info = pedido.softwareInfo
  if (!info || typeof info !== 'object') {
    erros.push(v('E01', 'softwareInfo', 'Faltam os dados do software de facturação.'))
  } else {
    const detalhes = info.softwareInfoDetails ?? info.softwareInfoDetail
    if (!detalhes || typeof detalhes !== 'object') {
      erros.push(
        v(
          'E01',
          'softwareInfo.softwareInfoDetails',
          'Faltam os detalhes do software de facturação.'
        )
      )
    } else {
      const certificacao = detalhes.softwareValidationNo ?? detalhes.softwareValidationNumber
      if (!preenchido(certificacao)) {
        erros.push(
          v(
            'E01',
            'softwareInfo.softwareInfoDetails.softwareValidationNo',
            'Falta o número de certificação do software junto da AGT.'
          )
        )
      }
    }

    if (!preenchido(info.jwsSoftwareSignature)) {
      erros.push(
        v('E01', 'softwareInfo.jwsSoftwareSignature', 'Falta a assinatura do produtor de software.')
      )
    }
  }

  if (opcoes.exigeJwsSignature && !preenchido(pedido.jwsSignature)) {
    erros.push(v('E01', 'jwsSignature', 'Falta a assinatura do contribuinte emissor.'))
  }

  return erros
}

/* ────────────────────────────────────────────────────────────────────────────
 * 1.1 registarFactura
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Total de imposto de uma linha de impostos.
 *
 * Devolve `null` quando não há informação suficiente para o calcular — e nesse
 * caso a regra E22 é SALTADA em vez de dar por errado o que não conseguiu
 * verificar. Um validador que inventa o valor que lhe falta rejeita facturas
 * boas, que é o pior erro que um validador local pode cometer.
 *
 * Ordem de preferência:
 *  1. `taxContribution` — o valor já calculado, se veio.
 *  2. `taxAmount` — verba fixa de Imposto de Selo. O documento diz que "concorre
 *     após multiplicado pela quantidade (quantity)".
 *  3. `taxPercentage` sobre a base: `taxBase` se existir, senão o montante da
 *     linha.
 */
export function contribuicaoDeImposto(
  imposto: Imposto,
  linha: Linha,
  casas: number
): number | null {
  if (typeof imposto.taxContribution === 'number') return arredondar(imposto.taxContribution, casas)

  if (typeof imposto.taxAmount === 'number') {
    return arredondar(imposto.taxAmount * linha.quantity, casas)
  }

  if (typeof imposto.taxPercentage === 'number') {
    const base =
      typeof imposto.taxBase === 'number'
        ? imposto.taxBase
        : (linha.creditAmount ?? linha.debitAmount ?? null)

    if (base === null) return null
    return arredondar((base * imposto.taxPercentage) / 100, casas)
  }

  return null
}

function validarImpostos(
  linha: Linha,
  caminho: string,
  documentNo: string,
  cfg: ConfiguracaoMinfin
): Violacao[] {
  const erros: Violacao[] = []
  const impostos = linha.taxes ?? []

  let temNaoSujeito = false

  impostos.forEach((imposto, i) => {
    const c = `${caminho}.taxes[${i}]`

    if (!(imposto.taxType in TIPOS_IMPOSTO)) {
      erros.push(
        v(
          'E03',
          `${c}.taxType`,
          `Sistema de imposto desconhecido: "${imposto.taxType}".`,
          documentNo
        )
      )
    }

    if (imposto.taxType === 'NS') temNaoSujeito = true

    if (!preenchido(imposto.taxCountryRegion)) {
      erros.push(
        v('E01', `${c}.taxCountryRegion`, 'Falta o país ou região do imposto.', documentNo)
      )
    } else if (!regiaoDeImpostoValida(imposto.taxCountryRegion)) {
      erros.push(
        v(
          'E02',
          `${c}.taxCountryRegion`,
          `País ou região do imposto inválido: "${imposto.taxCountryRegion}". Use um código ISO de dois caracteres, ou AO-CAB para Cabinda.`,
          documentNo
        )
      )
    }

    if (!codigoDeImpostoValido(imposto.taxType, imposto.taxCode)) {
      erros.push(
        v(
          'E03',
          `${c}.taxCode`,
          `Código de imposto inválido ou em falta para o sistema ${imposto.taxType}: "${imposto.taxCode ?? ''}".`,
          documentNo
        )
      )
    }

    // E19 — taxBase é exclusivo com o montante da linha.
    if (typeof imposto.taxBase === 'number') {
      if (typeof linha.debitAmount === 'number' || typeof linha.creditAmount === 'number') {
        erros.push(
          v(
            'E19',
            `${c}.taxBase`,
            'O valor tributável (taxBase) não pode ser preenchido ao mesmo tempo que o montante da linha (debitAmount/creditAmount).',
            documentNo
          )
        )
      }

      // E43 — correcções com taxBase têm quantidade zero.
      if (linha.quantity !== 0) {
        erros.push(
          v(
            'E43',
            `${caminho}.quantity`,
            `A quantidade tem de ser zero quando a linha é uma correcção com valor tributável (taxBase); está ${linha.quantity}.`,
            documentNo
          )
        )
      }
    }

    for (const [campo, valor] of [
      ['taxBase', imposto.taxBase],
      ['taxPercentage', imposto.taxPercentage],
      ['taxAmount', imposto.taxAmount],
      ['taxContribution', imposto.taxContribution],
    ] as const) {
      if (valor !== null && valor !== undefined && !eNumeroNaoNegativo(valor)) {
        erros.push(
          v(
            'E02',
            `${c}.${campo}`,
            `O campo ${campo} tem de ser um número não negativo.`,
            documentNo
          )
        )
      }
    }
  })

  // taxExemptionCode: obrigatório quando há uma linha de imposto não sujeita.
  if (temNaoSujeito && !preenchido(linha.taxExemptionCode)) {
    erros.push(
      v(
        'E01',
        `${caminho}.taxExemptionCode`,
        'Falta o código de motivo de isenção: a linha tem imposto marcado como não sujeito (taxType = NS).',
        documentNo
      )
    )
  }

  if (preenchido(linha.taxExemptionCode) && !isencaoIvaValida(linha.taxExemptionCode!)) {
    erros.push(
      v(
        'E03',
        `${caminho}.taxExemptionCode`,
        `Código de isenção de IVA desconhecido: "${linha.taxExemptionCode}".`,
        documentNo
      )
    )
  }

  void cfg
  return erros
}

function validarLinhas(documento: Documento, cfg: ConfiguracaoMinfin): Violacao[] {
  const erros: Violacao[] = []
  const linhas = documento.lines ?? []
  const documentNo = documento.documentNo

  linhas.forEach((linha, i) => {
    const c = `lines[${i}]`

    // E12 — sequência sem repetições nem saltos, a começar em 1.
    if (linha.lineNumber !== i + 1) {
      erros.push(
        v(
          'E12',
          `${c}.lineNumber`,
          `O número de linha devia ser ${i + 1} e é ${linha.lineNumber}: a numeração das linhas tem de começar em 1 e crescer de um em um.`,
          documentNo
        )
      )
    }

    if (!eTextoEntre(linha.productCode, 1, 60)) {
      erros.push(
        v(
          'E02',
          `${c}.productCode`,
          'O código do produto tem de ter entre 1 e 60 caracteres.',
          documentNo
        )
      )
    }

    if (!eTextoEntre(linha.productDescription, 1, 200)) {
      erros.push(
        v(
          'E02',
          `${c}.productDescription`,
          'A descrição do produto tem de ter entre 1 e 200 caracteres.',
          documentNo
        )
      )
    }

    if (!eTextoEntre(linha.unitOfMeasure, 1, 20)) {
      erros.push(
        v(
          'E02',
          `${c}.unitOfMeasure`,
          'A unidade de medida tem de ter entre 1 e 20 caracteres.',
          documentNo
        )
      )
    }

    for (const [campo, valor] of [
      ['quantity', linha.quantity],
      ['unitPrice', linha.unitPrice],
      ['unitPriceBase', linha.unitPriceBase],
      ['settlementAmount', linha.settlementAmount],
    ] as const) {
      if (!eNumeroNaoNegativo(valor)) {
        erros.push(
          v(
            'E02',
            `${c}.${campo}`,
            `O campo ${campo} tem de ser um número não negativo.`,
            documentNo
          )
        )
      }
    }

    // E15 — débito e crédito são exclusivos.
    const temDebito = typeof linha.debitAmount === 'number'
    const temCredito = typeof linha.creditAmount === 'number'

    if (temDebito && temCredito) {
      erros.push(
        v(
          'E15',
          `${c}.debitAmount`,
          'Só um dos campos debitAmount e creditAmount pode estar preenchido nesta linha.',
          documentNo
        )
      )
    }

    // E21 — o montante da linha é quantity * unitPriceBase.
    //
    // Salta-se quando a linha é uma correcção por taxBase (que tem quantidade
    // zero e nenhum dos dois montantes, por E19/E43) — aí a fórmula não se
    // aplica e exigi-la seria contradizer as outras duas regras.
    const montante = temCredito ? linha.creditAmount! : temDebito ? linha.debitAmount! : null

    if (
      montante !== null &&
      eNumeroNaoNegativo(linha.quantity) &&
      eNumeroNaoNegativo(linha.unitPriceBase)
    ) {
      const esperado = arredondar(linha.quantity * linha.unitPriceBase, cfg.casasDecimais)

      if (!montantesIguais(montante, esperado, cfg.casasDecimais)) {
        erros.push(
          v(
            'E21',
            `${c}.${temCredito ? 'creditAmount' : 'debitAmount'}`,
            `O montante da linha (${formatarMontante(montante, cfg.casasDecimais)}) não coincide com quantidade × preço unitário base (${formatarMontante(esperado, cfg.casasDecimais)}).`,
            documentNo
          )
        )
      }
    }

    if (linha.referenceInfo && !eTextoEntre(linha.referenceInfo.reference, 1, 60)) {
      erros.push(
        v(
          'E02',
          `${c}.referenceInfo.reference`,
          'A referência ao documento de origem tem de ter entre 1 e 60 caracteres.',
          documentNo
        )
      )
    }

    erros.push(...validarImpostos(linha, c, documentNo, cfg))
  })

  // E13 — uma nota de crédito tem de dizer que documento está a corrigir.
  if (eNotaDeCredito(documento.documentType) && linhas.length > 0) {
    const semReferencia = linhas.every((l) => !preenchido(l.referenceInfo?.reference))

    if (semReferencia) {
      erros.push(
        v(
          'E13',
          'lines[].referenceInfo.reference',
          'Uma nota de crédito tem de indicar, em pelo menos uma linha, a factura de origem a que se refere.',
          documentNo
        )
      )
    }
  }

  return erros
}

function validarTotais(documento: Documento, cfg: ConfiguracaoMinfin): Violacao[] {
  const erros: Violacao[] = []
  const documentNo = documento.documentNo
  const totais = documento.documentTotals
  const casas = cfg.casasDecimais

  if (!totais || typeof totais !== 'object') {
    return [v('E01', 'documentTotals', 'Faltam os totais do documento.', documentNo)]
  }

  for (const campo of ['taxPayable', 'netTotal', 'grossTotal'] as const) {
    if (!eNumeroNaoNegativo(totais[campo])) {
      erros.push(
        v(
          'E02',
          `documentTotals.${campo}`,
          `O total ${campo} tem de ser um número não negativo.`,
          documentNo
        )
      )
    }
  }

  if (erros.length > 0) return erros

  // E24 — o único total cuja fórmula o documento escreve por palavras:
  // "Soma do valor total sem imposto e do valor total de imposto devido" (1.1.2.12).
  const grossEsperado = arredondar(totais.netTotal + totais.taxPayable, casas)

  if (!montantesIguais(totais.grossTotal, grossEsperado, casas)) {
    erros.push(
      v(
        'E24',
        'documentTotals.grossTotal',
        `O total com impostos (${formatarMontante(totais.grossTotal, casas)}) não é a soma do total sem impostos com o imposto devido (${formatarMontante(grossEsperado, casas)}).`,
        documentNo
      )
    )
  }

  const linhas = documento.lines ?? []

  /*
   * E22 e E23 só se verificam contra LINHAS.
   *
   * Nos recibos (AR/RC/RG) não há linhas: o documento manda apurar estes totais
   * "somando os valores dos diferentes documentos origem regularizados pelo
   * recibo, sendo as NC contabilizadas com sinal negativo" — e esses documentos
   * de origem estão na AGT, não aqui. Verificar E22/E23 num recibo seria
   * compará-los contra zero e reprovar todos os recibos válidos.
   */
  if (linhas.length > 0) {
    // E22 — o imposto total é a soma do imposto das linhas.
    const contribuicoes = linhas.flatMap((linha) =>
      (linha.taxes ?? []).map((imposto) => contribuicaoDeImposto(imposto, linha, casas))
    )

    if (contribuicoes.length > 0 && contribuicoes.every((c) => c !== null)) {
      const impostoEsperado = somar(contribuicoes, casas)

      if (!montantesIguais(totais.taxPayable, impostoEsperado, casas)) {
        erros.push(
          v(
            'E22',
            'documentTotals.taxPayable',
            `O imposto total do documento (${formatarMontante(totais.taxPayable, casas)}) não corresponde à soma do imposto das linhas (${formatarMontante(impostoEsperado, casas)}).`,
            documentNo
          )
        )
      }
    }

    /*
     * E23 — o total sem imposto é a soma dos montantes das linhas.
     *
     * Créditos menos débitos, ou o contrário numa nota de crédito. A leitura vem
     * das regras E16/E17 do próprio documento: numa NC os créditos têm de ser
     * INFERIORES aos débitos, em qualquer outro documento têm de ser
     * SUPERIORES. Ou seja, as linhas de uma venda normal levam `creditAmount` e
     * as de uma nota de crédito levam `debitAmount` — a convenção do SAF-T.
     */
    const creditos = somar(
      linhas.map((l) => l.creditAmount),
      casas
    )
    const debitos = somar(
      linhas.map((l) => l.debitAmount),
      casas
    )
    const liquidoEsperado = eNotaDeCredito(documento.documentType)
      ? arredondar(debitos - creditos, casas)
      : arredondar(creditos - debitos, casas)

    if (!montantesIguais(totais.netTotal, liquidoEsperado, casas)) {
      erros.push(
        v(
          'E23',
          'documentTotals.netTotal',
          `O total sem impostos (${formatarMontante(totais.netTotal, casas)}) não corresponde à soma dos montantes das linhas (${formatarMontante(liquidoEsperado, casas)}).`,
          documentNo
        )
      )
    }

    // E16 / E17 — o sentido do documento.
    if (eNotaDeCredito(documento.documentType)) {
      if (creditos >= debitos) {
        erros.push(
          v(
            'E16',
            'lines[].creditAmount',
            `Numa nota de crédito o total a crédito (${formatarMontante(creditos, casas)}) tem de ser inferior ao total a débito (${formatarMontante(debitos, casas)}).`,
            documentNo
          )
        )
      }
    } else if (creditos <= debitos) {
      erros.push(
        v(
          'E17',
          'lines[].creditAmount',
          `Neste tipo de documento o total a crédito (${formatarMontante(creditos, casas)}) tem de ser superior ao total a débito (${formatarMontante(debitos, casas)}).`,
          documentNo
        )
      )
    }
  }

  // Divisa.
  const divisa = totais.currency
  if (divisa) {
    if (!eTextoEntre(divisa.currencyCode, 3, 3)) {
      erros.push(
        v(
          'E02',
          'documentTotals.currency.currencyCode',
          'O código da divisa tem de ter 3 caracteres (ISO 4217).',
          documentNo
        )
      )
    } else if (divisa.currencyCode.toUpperCase() === 'AOA') {
      erros.push(
        v(
          'E03',
          'documentTotals.currency.currencyCode',
          'O objecto de divisa não deve ser preenchido quando o pagamento é em AOA.',
          documentNo
        )
      )
    }

    if (!eNumeroPositivo(divisa.currencyAmount)) {
      erros.push(
        v(
          'E02',
          'documentTotals.currency.currencyAmount',
          'O valor na moeda estrangeira tem de ser maior que zero.',
          documentNo
        )
      )
    }

    if (!eNumeroPositivo(divisa.exchangeRate)) {
      erros.push(
        v(
          'E02',
          'documentTotals.currency.exchangeRate',
          'A taxa de câmbio tem de ser maior que zero.',
          documentNo
        )
      )
    }

    // E25 — o total em AOA tem de bater com o valor na divisa ao câmbio dado.
    if (eNumeroPositivo(divisa.currencyAmount) && eNumeroPositivo(divisa.exchangeRate)) {
      const convertido = arredondar(divisa.currencyAmount * divisa.exchangeRate, casas)

      if (!montantesIguais(totais.grossTotal, convertido, casas)) {
        erros.push(
          v(
            'E25',
            'documentTotals.grossTotal',
            `O total do documento (${formatarMontante(totais.grossTotal, casas)}) não corresponde ao valor na divisa ao câmbio indicado (${formatarMontante(convertido, casas)}).`,
            documentNo
          )
        )
      }
    }
  }

  return erros
}

function validarDocumento(documento: Documento, cfg: ConfiguracaoMinfin): Violacao[] {
  const erros: Violacao[] = []
  const documentNo = documento.documentNo

  /*
   * Lido ANTES da verificação, e não dentro do ramo de erro.
   *
   * `eTextoEntre` é um predicado de tipo (`valor is string`), portanto no ramo
   * negativo o TypeScript estreita um `string` declarado para `never` — e
   * `never.length` não compila. O tipo diz `string`; o valor que chega aqui vem
   * de quem chamou a integração e pode ser qualquer coisa. É por isso que a
   * leitura é defensiva e é feita fora do ramo.
   */
  const comprimento = typeof documentNo === 'string' ? documentNo.length : 0

  if (!eTextoEntre(documentNo, 8, 60)) {
    erros.push(
      v(
        'E02',
        'documentNo',
        `A identificação do documento tem de ter entre 8 e 60 caracteres (tem ${comprimento}).`,
        comprimento > 0 ? String(documentNo) : undefined
      )
    )
  }

  if (!(documento.documentStatus in ESTADOS_DOCUMENTO)) {
    erros.push(
      v(
        'E03',
        'documentStatus',
        `Estado de documento desconhecido: "${documento.documentStatus}".`,
        documentNo
      )
    )
  }

  // O motivo de anulação é obrigatório se, e só se, o documento vai anulado.
  if (documento.documentStatus === 'A') {
    if (!preenchido(documento.documentCancelReason)) {
      erros.push(
        v(
          'E01',
          'documentCancelReason',
          'Falta o motivo de anulação: o documento é transmitido como anulado.',
          documentNo
        )
      )
    } else if (!(documento.documentCancelReason! in MOTIVOS_ANULACAO)) {
      erros.push(
        v(
          'E03',
          'documentCancelReason',
          `Motivo de anulação desconhecido: "${documento.documentCancelReason}".`,
          documentNo
        )
      )
    }
  } else if (preenchido(documento.documentCancelReason)) {
    erros.push(
      v(
        'E20',
        'documentCancelReason',
        'O motivo de anulação só pode ser preenchido quando o documento é transmitido como anulado.',
        documentNo
      )
    )
  }

  if (!preenchido(documento.jwsDocumentSignature)) {
    erros.push(v('E01', 'jwsDocumentSignature', 'Falta a assinatura do documento.', documentNo))
  }

  if (!eData(documento.documentDate)) {
    erros.push(
      v('E02', 'documentDate', 'A data de emissão tem de estar no formato AAAA-MM-DD.', documentNo)
    )
  }

  if (!eTipoDocumento(documento.documentType)) {
    erros.push(
      v(
        'E03',
        'documentType',
        `Tipo de documento desconhecido: "${documento.documentType}".`,
        documentNo
      )
    )
  }

  if (!eTimestampLocal(documento.systemEntryDate)) {
    erros.push(
      v(
        'E02',
        'systemEntryDate',
        'A data de gravação tem de estar em ISO 8601 (AAAA-MM-DDThh:mm:ss).',
        documentNo
      )
    )
  }

  if (!eTextoEntre(documento.customerCountry, 2, 2)) {
    erros.push(
      v(
        'E02',
        'customerCountry',
        'O país do cliente tem de ser um código ISO de dois caracteres (AO para Angola).',
        documentNo
      )
    )
  }

  if (!preenchido(documento.customerTaxID)) {
    erros.push(
      v('E01', 'customerTaxID', 'Falta o número de identificação fiscal do cliente.', documentNo)
    )
  }

  if (!eTextoEntre(documento.companyName, 1, 200)) {
    erros.push(
      v('E02', 'companyName', 'O nome do cliente tem de ter entre 1 e 200 caracteres.', documentNo)
    )
  }

  if (preenchido(documento.eacCode) && !eTextoEntre(documento.eacCode, 5, 5)) {
    erros.push(
      v('E02', 'eacCode', 'O código de actividade económica tem de ter 5 caracteres.', documentNo)
    )
  }

  // E26 / E27 — lines e paymentReceipt são mutuamente exclusivos, e qual deles é
  // obrigatório depende do tipo de documento.
  const temLinhas = Array.isArray(documento.lines) && documento.lines.length > 0
  const temRecibo = !!documento.paymentReceipt

  if (exigeRecibo(documento.documentType)) {
    if (temLinhas) {
      erros.push(
        v(
          'E26',
          'lines',
          `O tipo de documento ${documento.documentType} não leva linhas de artigos — leva os dados do recibo (paymentReceipt).`,
          documentNo
        )
      )
    }
    if (!temRecibo) {
      erros.push(
        v(
          'E01',
          'paymentReceipt',
          `O tipo de documento ${documento.documentType} tem de levar os dados do recibo.`,
          documentNo
        )
      )
    }
  } else {
    if (temRecibo) {
      erros.push(
        v(
          'E27',
          'paymentReceipt',
          `O tipo de documento ${documento.documentType} não leva dados de recibo — leva linhas de artigos.`,
          documentNo
        )
      )
    }
    if (!temLinhas) {
      erros.push(
        v(
          'E01',
          'lines',
          `O tipo de documento ${documento.documentType} tem de levar pelo menos uma linha.`,
          documentNo
        )
      )
    }
  }

  if (temRecibo) {
    const origens = documento.paymentReceipt!.sourceDocuments ?? []

    if (origens.length === 0) {
      erros.push(
        v(
          'E01',
          'paymentReceipt.sourceDocuments',
          'O recibo tem de indicar pelo menos um documento de origem.',
          documentNo
        )
      )
    }

    origens.forEach((origem, i) => {
      const c = `paymentReceipt.sourceDocuments[${i}]`

      if (!eInteiroDesde(origem.lineNo, 1)) {
        erros.push(
          v(
            'E02',
            `${c}.lineNo`,
            'O número de linha do recibo tem de ser um inteiro a partir de 1.',
            documentNo
          )
        )
      } else if (origem.lineNo !== i + 1) {
        erros.push(
          v(
            'E12',
            `${c}.lineNo`,
            `O número de linha devia ser ${i + 1} e é ${origem.lineNo}.`,
            documentNo
          )
        )
      }

      if (!preenchido(origem.sourceDocumentID?.OriginatingON)) {
        erros.push(
          v(
            'E01',
            `${c}.sourceDocumentID.OriginatingON`,
            'Falta o número do documento regularizado.',
            documentNo
          )
        )
      }

      if (!eData(origem.sourceDocumentID?.documentDate)) {
        erros.push(
          v(
            'E02',
            `${c}.sourceDocumentID.documentDate`,
            'A data do documento regularizado tem de estar em AAAA-MM-DD.',
            documentNo
          )
        )
      }

      if (typeof origem.debitAmount === 'number' && typeof origem.creditAmount === 'number') {
        erros.push(
          v(
            'E15',
            `${c}.debitAmount`,
            'Só um dos campos debitAmount e creditAmount pode estar preenchido nesta linha do recibo.',
            documentNo
          )
        )
      }
    })
  }

  erros.push(...validarLinhas(documento, cfg))
  erros.push(...validarTotais(documento, cfg))

  ;(documento.withholdingTaxList ?? []).forEach((retencao, i) => {
    const c = `withholdingTaxList[${i}]`

    if (!(retencao.withholdingTaxType in TIPOS_RETENCAO)) {
      erros.push(
        v(
          'E03',
          `${c}.withholdingTaxType`,
          `Tipo de retenção na fonte desconhecido: "${retencao.withholdingTaxType}".`,
          documentNo
        )
      )
    }

    if (!eNumeroNaoNegativo(retencao.withholdingTaxAmount)) {
      erros.push(
        v(
          'E02',
          `${c}.withholdingTaxAmount`,
          'O valor da retenção na fonte tem de ser um número não negativo.',
          documentNo
        )
      )
    }

    if (
      preenchido(retencao.withholdingTaxDescription) &&
      !eTextoEntre(retencao.withholdingTaxDescription, 1, 120)
    ) {
      erros.push(
        v(
          'E02',
          `${c}.withholdingTaxDescription`,
          'O motivo da retenção não pode exceder 120 caracteres.',
          documentNo
        )
      )
    }
  })

  return erros
}

/** Todas as violações locais de um pedido de registo de facturas. */
export function validarRegistarFactura(
  pedido: PedidoRegistarFactura,
  cfg: ConfiguracaoMinfin
): Violacao[] {
  const erros = validarEnvelope(pedido, cfg, { exigeJwsSignature: false })

  if (!Array.isArray(pedido.documents)) {
    erros.push(v('E01', 'documents', 'Falta a lista de documentos de facturação.'))
    return erros
  }

  if (pedido.documents.length === 0) {
    erros.push(v('E01', 'documents', 'A lista de documentos de facturação está vazia.'))
  }

  if (pedido.documents.length > MAXIMO_DOCUMENTOS) {
    erros.push(
      v(
        'E03',
        'documents',
        `A chamada leva ${pedido.documents.length} documentos; o máximo previsto é ${MAXIMO_DOCUMENTOS}.`
      )
    )
  }

  // E04 — o contador tem de coincidir com o array.
  if (pedido.numberOfEntries !== pedido.documents.length) {
    erros.push(
      v(
        'E04',
        'numberOfEntries',
        `O número de facturas declarado (${pedido.numberOfEntries}) não coincide com as ${pedido.documents.length} que vão na chamada.`
      )
    )
  }

  // E09 local: dois documentos com o mesmo número na MESMA chamada. O duplicado
  // contra o repositório da AGT só eles podem detectar; este é gratuito.
  const vistos = new Map<string, number>()
  pedido.documents.forEach((documento, i) => {
    const anterior = vistos.get(documento.documentNo)
    if (anterior !== undefined) {
      erros.push(
        v(
          'E09',
          `documents[${i}].documentNo`,
          `O documento "${documento.documentNo}" aparece duas vezes na mesma chamada (posições ${anterior + 1} e ${i + 1}).`,
          documento.documentNo
        )
      )
    } else {
      vistos.set(documento.documentNo, i)
    }
  })

  pedido.documents.forEach((documento, i) => {
    for (const erro of validarDocumento(documento, cfg)) {
      erros.push({ ...erro, campo: `documents[${i}].${erro.campo}` })
    }
  })

  return erros
}

/* ────────────────────────────────────────────────────────────────────────────
 * Os outros seis serviços
 * ──────────────────────────────────────────────────────────────────────────── */

export function validarObterEstado(pedido: PedidoObterEstado, cfg: ConfiguracaoMinfin): Violacao[] {
  const erros = validarEnvelope(pedido, cfg, { exigeJwsSignature: true })

  if (!preenchido(pedido.requestID)) {
    erros.push(
      v(
        'E01',
        'requestID',
        'Falta o identificador do pedido de registo devolvido por registarFactura.'
      )
    )
  } else if (!eTextoEntre(String(pedido.requestID), 1, 15)) {
    erros.push(v('E02', 'requestID', 'O identificador do pedido não pode exceder 15 caracteres.'))
  }

  return erros
}

export function validarListarFacturas(
  pedido: PedidoListarFacturas,
  cfg: ConfiguracaoMinfin
): Violacao[] {
  const erros = validarEnvelope(pedido, cfg, { exigeJwsSignature: true })

  if (!eData(pedido.queryStartDate)) {
    erros.push(
      v('E02', 'queryStartDate', 'A data inicial da pesquisa tem de estar no formato AAAA-MM-DD.')
    )
  }

  if (!eData(pedido.queryEndDate)) {
    erros.push(
      v('E02', 'queryEndDate', 'A data final da pesquisa tem de estar no formato AAAA-MM-DD.')
    )
  }

  if (
    eData(pedido.queryStartDate) &&
    eData(pedido.queryEndDate) &&
    pedido.queryStartDate > pedido.queryEndDate
  ) {
    erros.push(v('E03', 'queryStartDate', 'A data inicial da pesquisa é posterior à data final.'))
  }

  return erros
}

export function validarConsultarFactura(
  pedido: PedidoConsultarFactura,
  cfg: ConfiguracaoMinfin
): Violacao[] {
  const erros = validarEnvelope(pedido, cfg, { exigeJwsSignature: true })

  if (!preenchido(pedido.documentNo)) {
    erros.push(v('E01', 'documentNo', 'Falta a identificação da factura a consultar.'))
  } else if (!eTextoEntre(pedido.documentNo, 1, 60)) {
    erros.push(v('E02', 'documentNo', 'A identificação da factura não pode exceder 60 caracteres.'))
  }

  return erros
}

/**
 * `solicitarSerie`.
 *
 * `agora` é um argumento e não `new Date()` lá dentro porque a regra do ano
 * (E33) muda de comportamento a 15 de Dezembro, e uma regra que muda com o
 * calendário só se testa se a data puder ser injectada.
 */
export function validarSolicitarSerie(
  pedido: PedidoSolicitarSerie,
  cfg: ConfiguracaoMinfin,
  agora: Date = new Date()
): Violacao[] {
  const erros = validarEnvelope(pedido, cfg, { exigeJwsSignature: true })

  if (!eTextoEntre(pedido.seriesCode, 3, 60)) {
    erros.push(v('E02', 'seriesCode', 'O código da série tem de ter entre 3 e 60 caracteres.'))
  } else if (!/^[A-Za-z0-9]+$/.test(pedido.seriesCode)) {
    erros.push(
      v('E32', 'seriesCode', `O código da série "${pedido.seriesCode}" tem de ser alfanumérico.`)
    )
  }

  if (!eInteiroDesde(pedido.seriesYear, 1)) {
    erros.push(v('E02', 'seriesYear', 'O ano de emissão da série tem de ser um inteiro.'))
  }

  if (!eTipoDocumento(pedido.documentType)) {
    erros.push(
      v('E03', 'documentType', `Tipo de documento desconhecido: "${pedido.documentType}".`)
    )
  }

  if (!eInteiroDesde(pedido.firstDocumentNumber, 1)) {
    erros.push(
      v(
        'E02',
        'firstDocumentNumber',
        'O primeiro número da série tem de ser um inteiro a partir de 1.'
      )
    )
  }

  // E32 — o código da série tem de conter o ano, com 2 ou 4 dígitos.
  if (eTextoEntre(pedido.seriesCode, 3, 60) && eInteiroDesde(pedido.seriesYear, 1)) {
    const ano4 = String(pedido.seriesYear)
    const ano2 = ano4.slice(-2)

    if (!pedido.seriesCode.includes(ano4) && !pedido.seriesCode.includes(ano2)) {
      erros.push(
        v(
          'E32',
          'seriesCode',
          `O código da série "${pedido.seriesCode}" tem de conter o ano de emissão (${ano4} ou ${ano2}).`
        )
      )
    }
  }

  /*
   * E33 — que anos é que se podem pedir.
   *
   * "De 1 de Janeiro até 15 de Dezembro é possível criar séries somente para o
   * ano de sistema, após essa data é possível criar séries para o ano de sistema
   * e para o ano imediatamente posterior" (1.5.2).
   *
   * "Após essa data" lê-se como a partir de 15 de Dezembro inclusive: o dia 15
   * é o limite escrito de um intervalo que começa a 1 de Janeiro, e um intervalo
   * que exclui as duas pontas deixava o próprio dia 15 sem regra nenhuma.
   */
  if (eInteiroDesde(pedido.seriesYear, 1)) {
    const anoSistema = agora.getFullYear()
    const abriuJanelaDoAnoSeguinte = agora.getMonth() === 11 && agora.getDate() >= 15
    const permitidos = abriuJanelaDoAnoSeguinte ? [anoSistema, anoSistema + 1] : [anoSistema]

    if (!permitidos.includes(pedido.seriesYear)) {
      erros.push(
        v(
          'E33',
          'seriesYear',
          abriuJanelaDoAnoSeguinte
            ? `O ano da série (${pedido.seriesYear}) tem de ser ${anoSistema} ou ${anoSistema + 1}.`
            : `O ano da série (${pedido.seriesYear}) tem de ser ${anoSistema}. Só a partir de 15 de Dezembro é possível criar séries para o ano seguinte.`
        )
      )
    }
  }

  return erros
}

export function validarConfirmarRejeitar(
  pedido: PedidoConfirmarRejeitar,
  cfg: ConfiguracaoMinfin
): Violacao[] {
  const erros = validarEnvelope(pedido, cfg, { exigeJwsSignature: true })

  if (!preenchido(pedido.documentNo)) {
    erros.push(
      v('E01', 'documentNo', 'Falta a identificação do documento a confirmar ou rejeitar.')
    )
  } else if (!eTextoEntre(pedido.documentNo, 1, 60)) {
    erros.push(
      v('E02', 'documentNo', 'A identificação do documento não pode exceder 60 caracteres.')
    )
  }

  if (!(pedido.action in ACCOES_ADQUIRENTE)) {
    erros.push(
      v(
        'E03',
        'action',
        `Acção desconhecida: "${pedido.action}". Use C para confirmar ou R para rejeitar.`
      )
    )
  }

  return erros
}
