/**
 * Documentos de exemplo que passam TODAS as regras locais.
 *
 * Servem de duas maneiras: são o material dos cenários e dos testes, e são a
 * resposta escrita à pergunta "como é que uma factura válida se parece?" — que é
 * a pergunta que o Blueprint responde em pedaços espalhados por quinze secções.
 *
 * Cada um está construído para satisfazer as regras aritméticas de propósito, e
 * os comentários dizem qual, para que uma alteração distraída num número mostre
 * imediatamente que regra é que ela parte.
 */

import type { DocumentoParaRegisto } from '../cliente/cliente_agt.js'

/**
 * Factura (FT) com uma linha, IVA à taxa normal.
 *
 *   E21  creditAmount 2000,00 = quantity 2 × unitPriceBase 1000,00
 *   E22  taxPayable 280,00    = soma dos taxContribution das linhas
 *   E23  netTotal 2000,00     = créditos − débitos
 *   E24  grossTotal 2280,00   = netTotal + taxPayable
 *   E17  créditos > débitos, como tem de ser fora de uma nota de crédito
 */
export function facturaSimples(documentNo = 'FT AB2025/1'): DocumentoParaRegisto {
  return {
    documentNo,
    documentStatus: 'N',
    documentDate: '2025-01-03',
    documentType: 'FT',
    eacCode: '47730',
    systemEntryDate: '2025-01-03T10:15:00',
    customerCountry: 'AO',
    // O valor que o Blueprint reserva para "contribuinte doméstico sem
    // identificação do comprador" (1.1.2.4).
    customerTaxID: '999999999',
    companyName: 'Consumidor Final',
    lines: [
      {
        lineNumber: 1,
        productCode: 'P001',
        productDescription: 'Paracetamol 500 mg, caixa de 20',
        quantity: 2,
        unitOfMeasure: 'UN',
        unitPrice: 1000,
        unitPriceBase: 1000,
        creditAmount: 2000,
        settlementAmount: 0,
        taxes: [
          {
            taxType: 'IVA',
            taxCountryRegion: 'AO',
            taxCode: 'NOR',
            taxPercentage: 14,
            taxContribution: 280,
          },
        ],
      },
    ],
    documentTotals: { taxPayable: 280, netTotal: 2000, grossTotal: 2280 },
  }
}

/**
 * Factura com linha isenta de IVA — o caso que obriga a `taxExemptionCode`.
 *
 * `taxType: 'NS'` (não sujeito) torna o código de isenção obrigatório; sem ele a
 * validação local devolve E01 antes de a chamada sair.
 */
export function facturaIsenta(documentNo = 'FT AB2025/2'): DocumentoParaRegisto {
  return {
    documentNo,
    documentStatus: 'N',
    documentDate: '2025-01-04',
    documentType: 'FT',
    systemEntryDate: '2025-01-04T09:00:00',
    customerCountry: 'AO',
    customerTaxID: '5417000000',
    companyName: 'Clínica Sagrada Esperança, Lda',
    lines: [
      {
        lineNumber: 1,
        productCode: 'S010',
        productDescription: 'Consulta de medicina geral',
        quantity: 1,
        unitOfMeasure: 'UN',
        unitPrice: 15000,
        unitPriceBase: 15000,
        creditAmount: 15000,
        settlementAmount: 0,
        // M22: prestações de serviço médico sanitário (alínea m) do art.º 12.º).
        taxExemptionCode: 'M22',
        taxes: [
          {
            taxType: 'NS',
            taxCountryRegion: 'AO',
            taxPercentage: 0,
            taxContribution: 0,
          },
        ],
      },
    ],
    documentTotals: { taxPayable: 0, netTotal: 15000, grossTotal: 15000 },
  }
}

/**
 * Nota de crédito (NC).
 *
 *   E16  créditos (0,00) < débitos (500,00) — exigência específica da NC
 *   E13  a linha diz que factura está a corrigir, em `referenceInfo.reference`
 *   E23  netTotal = débitos − créditos, invertido face aos outros tipos
 */
export function notaDeCredito(documentNo = 'NC AB2025/1'): DocumentoParaRegisto {
  return {
    documentNo,
    documentStatus: 'N',
    documentDate: '2025-01-10',
    documentType: 'NC',
    systemEntryDate: '2025-01-10T16:40:00',
    customerCountry: 'AO',
    customerTaxID: '5417000000',
    companyName: 'Clínica Sagrada Esperança, Lda',
    lines: [
      {
        lineNumber: 1,
        productCode: 'P001',
        productDescription: 'Devolução de Paracetamol 500 mg',
        quantity: 1,
        unitOfMeasure: 'UN',
        unitPrice: 1000,
        unitPriceBase: 500,
        debitAmount: 500,
        settlementAmount: 0,
        referenceInfo: { reference: 'FT AB2025/1', reason: 'Devolução de artigo' },
        taxes: [
          {
            taxType: 'IVA',
            taxCountryRegion: 'AO',
            taxCode: 'NOR',
            taxPercentage: 14,
            taxContribution: 70,
          },
        ],
      },
    ],
    documentTotals: { taxPayable: 70, netTotal: 500, grossTotal: 570 },
  }
}

/**
 * Recibo (RC) — sem `lines`, com `paymentReceipt`.
 *
 * É o par oposto de todos os outros exemplos: aqui `lines` é PROIBIDO (E26) e
 * `paymentReceipt` é obrigatório. Trocar os dois é o erro mais provável de
 * cometer, e é por isso que este exemplo existe.
 */
export function recibo(documentNo = 'RC AB2025/1'): DocumentoParaRegisto {
  return {
    documentNo,
    documentStatus: 'N',
    documentDate: '2025-01-15',
    documentType: 'RC',
    systemEntryDate: '2025-01-15T11:05:00',
    customerCountry: 'AO',
    customerTaxID: '5417000000',
    companyName: 'Clínica Sagrada Esperança, Lda',
    paymentReceipt: {
      sourceDocuments: [
        {
          lineNo: 1,
          sourceDocumentID: { OriginatingON: 'FT AB2025/1', documentDate: '2025-01-03' },
          creditAmount: 2000,
        },
      ],
    },
    documentTotals: { taxPayable: 280, netTotal: 2000, grossTotal: 2280 },
  }
}

/**
 * Factura em divisa estrangeira.
 *
 *   E25  grossTotal 2280,00 AOA = currencyAmount 2,28 × exchangeRate 1000,00
 */
export function facturaEmDivisa(documentNo = 'FT AB2025/3'): DocumentoParaRegisto {
  const base = facturaSimples(documentNo)

  return {
    ...base,
    documentTotals: {
      ...base.documentTotals,
      currency: { currencyCode: 'USD', currencyAmount: 2.28, exchangeRate: 1000 },
    },
  }
}

/** Factura anulada — obriga a `documentCancelReason` (1.1.2.4). */
export function facturaAnulada(documentNo = 'FT AB2025/4'): DocumentoParaRegisto {
  return {
    ...facturaSimples(documentNo),
    documentStatus: 'A',
    documentCancelReason: 'I',
  }
}
