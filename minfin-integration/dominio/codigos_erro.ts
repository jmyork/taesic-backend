/**
 * Catálogo de códigos de erro do Blueprint.
 *
 * ── Porque é que isto está indexado POR SERVIÇO ───────────────────────────────
 *
 * Porque o mesmo código não quer dizer o mesmo em todos os serviços. Não é uma
 * suposição — está no documento, e foi verificado tabela a tabela:
 *
 *   E06  registarFactura  → "A data de criação do pedido «creationDate» não está
 *                            dentro do período permitido" (1.1.4)
 *        solicitarSerie   → "Contribuinte não aderiu à facturação electrónica"
 *                            (1.5.3.2)
 *
 *   E31  listarFacturas   → "Assinatura do produtor ≠ Certificação do Software"
 *                            (1.3.4)
 *        solicitarSerie   → "Código de série de numeração já se encontra em
 *                            utilização para o contribuinte" (1.5.3.2)
 *
 *   E39  listarFacturas   → "Assinatura do produtor ≠ processo de Certificação"
 *        os restantes     → o mesmo texto, mas onde listarFacturas usa E40 os
 *                            outros serviços usam E39 para outra coisa (1.3.4 é
 *                            a única tabela das quatro que não menciona E40, e
 *                            repete a mesma descrição em duas linhas).
 *
 * Um `Record<codigo, descricao>` único era mais simples de escrever e daria a
 * mensagem errada ao utilizador exactamente nos casos em que ela importa. Ver
 * `DIVERGENCIAS.md` #C-04.
 *
 * ── Sobre a coluna "Regra de negócio" (FE-RNG-xxx) ────────────────────────────
 *
 * NÃO está aqui. Na tabela 1.1.4 do PDF essa coluna está desalinhada da coluna
 * dos códigos — há uma linha (`FE-RNG-002`) sem código nem descrição, o que
 * desfaz o par a partir daí. O que é reconstruível com confiança é
 * código → descrição, e foi confirmado em cinco tabelas independentes do próprio
 * documento (1.2.4, 1.3.4, 1.4.4, 1.5.3.2, 1.6.4) que coincidem nos códigos que
 * partilham. Inventar a coluna FE-RNG só para a ter era pôr no código uma
 * correspondência que ninguém verificou.
 */

/** Nomes dos sete serviços, tal como aparecem nos endpoints. */
export const SERVICOS = [
  'registarFactura',
  'obterEstado',
  'listarFacturas',
  'consultarFactura',
  'solicitarSerie',
  'listarSeries',
  'confirmarRejeitarDocumento',
] as const
export type Servico = (typeof SERVICOS)[number]

/** Secção 1.1.4 — `registarFactura`. */
const REGISTAR_FACTURA: Record<string, string> = {
  E01: 'Falta de parâmetro <parâmetro>',
  E02: 'Formato inválido do parâmetro <parâmetro> (<valor do parâmetro>).',
  E03: 'Valor não esperado do parâmetro <parâmetro> (<valor do parâmetro>).',
  E04: 'Número de facturas especificado no parâmetro "numberOfEntries" não coincide com o número de ocorrências do array "documents".',
  E05: 'Número fiscal do emissor especificado no parâmetro <parâmetro> não possui actividade registada no sistema da AGT.',
  E06: 'A data de criação do pedido especificado no parâmetro "creationDate" não está dentro do período permitido.',
  E07: 'Software de facturação especificado no parâmetro "softwareValidationNo" não está certificado.',
  E08: 'A assinatura do Produtor de Software "jwsSoftwareSignature" não está de acordo com a informação transmitida.',
  E09: 'Factura especificada no parâmetro <parâmetro> já consta no repositório do sistema.',
  E10: 'Incorrecta especificação do contribuinte no preenchimento dos parâmetros "customerTaxID", "taxIDNumber" e "taxIDCountry".',
  E11: 'Número fiscal Angolano especificado no parâmetro <parâmetro> é desconhecido no sistema da AGT.',
  E12: 'Incorrecto número de linha de artigo na factura preenchido no parâmetro "lineNo", originando repetição ou quebra de sequência.',
  E13: 'São esperados documentos de facturação de referência para a factura transmitida, os quais não foram especificados no parâmetro "referenceList".',
  E14: 'Documento de referência preenchido no parâmetro "referenceNo" é desconhecido do sistema.',
  E15: 'Não podem ser especificados em simultâneo os parâmetros <parâmetro1> e <parâmetro2>.',
  E16: 'A soma dos valores a crédito para as diferentes linhas de um documento de facturação deve ser obrigatoriamente inferior à soma dos valores a débito quando se trata de uma nota de crédito.',
  E17: 'A soma dos valores a crédito para as diferentes linhas de um documento de facturação deve ser obrigatoriamente superior à soma dos valores a débito quando se trata de um documento diferente de nota de crédito.',
  E18: 'Combinação não permitida dos campos <parâmetro1>, <parâmetro2>, <parâmetro3>, <parâmetro4>.',
  E19: 'O campo "taxBase" não pode estar especificado simultaneamente com um dos campos "debitAmount" ou "creditAmount".',
  E20: 'Combinação não permitida dos campos <parâmetro1>, <parâmetro2>.',
  E21: 'Valor do campo <parâmetro1> não coincide com a aplicação da fórmula: quantity * unitPriceBase.',
  E22: 'Valor total de impostos da factura "taxPayable" não corresponde à soma dos impostos de todas as linhas.',
  E23: 'Valor total do documento sem impostos "netPayable" não corresponde à soma dos valores sem impostos de todas as linhas.',
  E24: 'Valor total do documento com impostos "grossPayable" não corresponde à soma dos valores com impostos de todas as linhas.',
  E25: 'Valor registado na factura no campo "grossTotal" não corresponde ao valor na divisa utilizada no pagamento ao câmbio da divisa.',
  E26: 'Utilização incorrecta do campo "lines" para o tipo de factura (<valor do parâmetro>).',
  E27: 'Utilização incorrecta do campo "paymentReceipt" para o tipo de factura (<valor do parâmetro>).',
  E28: 'Número fiscal do emissor especificado no parâmetro <parâmetro> não aderiu à facturação electrónica no sistema da AGT.',
  E29: 'A data de emissão do documento de facturação "documentDate" é anterior à data de adesão do contribuinte à facturação electrónica.',
  E39: 'Os dados constantes na assinatura do Produtor de Software "jwsSoftwareSignature" não estão de acordo com a informação constante no processo de Certificação do Software.',
  E40: 'Os dados constantes na assinatura da chamada do serviço "jwsSignature" não estão de acordo com a informação constante na chamada do serviço.',
  E41: 'A soma dos valores a regularizar assinalados nos campos "debitAmount"/"creditAmount" para o documento dado em "OriginatingON" excede o montante remanescente do referido documento.',
  E42: 'A soma dos valores a anular/devolver assinalada no campo "debitAmount"/"creditAmount" para o mesmo documento base dado em "reference" excede o montante ainda não anulado/devolvido do referido documento.',
  E43: 'Quantidade de artigos/serviços assinalados no campo "quantity" deverá ser zero para aplicações de correcções com o campo "taxBase".',
}

/** Secções 1.2.4, 1.4.4 e 1.6.4 — as três tabelas que coincidem exactamente. */
const ASSINATURAS: Record<string, string> = {
  E08: REGISTAR_FACTURA.E08,
  E39: REGISTAR_FACTURA.E39,
  E40: REGISTAR_FACTURA.E40,
}

/**
 * Secção 1.3.4 — `listarFacturas`. A tabela anómala: usa E31 onde as outras usam
 * E39, usa E39 onde as outras usam E40, e não menciona E40 de todo.
 */
const LISTAR_FACTURAS: Record<string, string> = {
  E08: REGISTAR_FACTURA.E08,
  E31: 'Os dados constantes na assinatura do Produtor de Software "jwsSoftwareSignature" não estão de acordo com a informação constante na Certificação do Software.',
  E39: REGISTAR_FACTURA.E39,
  // Não documentado para este serviço, mas incluído porque é o código que todos
  // os outros serviços usam para a mesma falha e é plausível que apareça na
  // mesma. Nunca deve produzir uma mensagem pior do que "erro desconhecido".
  E40: REGISTAR_FACTURA.E40,
}

/** Secção 1.5.3.2 — `solicitarSerie`. */
const SOLICITAR_SERIE: Record<string, string> = {
  E06: 'Contribuinte especificado no parâmetro <parâmetro> não aderiu à facturação electrónica no sistema da AGT.',
  E08: REGISTAR_FACTURA.E08,
  E30: 'Contribuinte especificado no parâmetro <parâmetro> não possui actividade registada no sistema da AGT.',
  E31: 'Código de série de numeração (<valor do parâmetro1>) já se encontra em utilização para o contribuinte (<valor do parâmetro2>).',
  E32: 'Código de série mal construído (<valor do parâmetro>), deverá conter o ano de emissão com 2 ou 4 dígitos.',
  E33: 'Ano de emissão da série deve coincidir com o ano da data de sistema (solicitações anteriores a 15 de Dezembro).',
  E34: 'Série da factura é inexistente para o contribuinte.',
  E35: 'A factura que se pretende criar refere-se a uma série de numeração de documentos de facturação não electrónicos.',
  E36: 'O Software de Facturação que está a gerar a factura não coincide com o Software de Facturação que gerou a série.',
  E37: 'O tipo de factura a emitir não coincide com o tipo de factura que foi destinada a série de facturação.',
  E38: 'O ano de emissão da factura não coincide com o ano de emissão a que se refere a série de facturas.',
  E39: REGISTAR_FACTURA.E39,
  E40: REGISTAR_FACTURA.E40,
}

/** Secção 1.7.4 — `confirmarRejeitarDocumento`. */
const CONFIRMAR_REJEITAR: Record<string, string> = {
  E44: 'O estado do documento de facturação não permite a acção de confirmação do documento pelo adquirente.',
  E45: 'O estado do documento de facturação não permite a acção de rejeição do documento pelo adquirente.',
}

/**
 * Erros de CHAMADA, não de conteúdo. Vêm das tabelas de "Parâmetros de Saída"
 * (1.2.3, 1.3.3, 1.4.3, 1.7.3) e não das tabelas de erro, e é por isso que não
 * aparecem em nenhum dos catálogos acima.
 *
 * ⚠️ E96 tem DUAS descrições no mesmo serviço (1.2.3): com HTTP 422 é
 * "solicitação ainda em processamento" — um estado transitório, repetir mais
 * tarde; com HTTP 400 é "erro de estrutura" — um defeito nosso, repetir nunca.
 * A distinção só existe no código HTTP, e por isso `descreverErroDeChamada()`
 * exige-o. Ver `DIVERGENCIAS.md` #C-05.
 */
const CHAMADA: Record<string, string> = {
  E94: 'Erro na chamada: NIF diferente.',
  E95: 'Erro na chamada: NIF emissor diferente.',
  E96: 'Erro na chamada: solicitação ainda em processamento, ou solicitação mal efectuada (erro de estrutura).',
  E97: 'Erro na chamada: solicitação prematura.',
  E98: 'Erro na chamada: demasiadas solicitações repetidas.',
  E99: 'Outro erro não detalhado.',
}

const CATALOGO: Record<Servico, Record<string, string>> = {
  registarFactura: REGISTAR_FACTURA,
  obterEstado: ASSINATURAS,
  listarFacturas: LISTAR_FACTURAS,
  consultarFactura: ASSINATURAS,
  solicitarSerie: SOLICITAR_SERIE,
  listarSeries: ASSINATURAS,
  confirmarRejeitarDocumento: CONFIRMAR_REJEITAR,
}

/**
 * A descrição de um código, para o serviço em que ele apareceu.
 *
 * Procura pela ordem: catálogo do serviço → erros de chamada → catálogo de
 * `registarFactura` (o mais completo, serve de fundo comum) → `null`.
 *
 * Devolve `null` e não uma frase inventada quando não conhece o código: a AGT
 * diz explicitamente que "a lista de validações não é exaustiva, podendo ser
 * adicionadas outras validações a posteriori" (nota da secção 1.1.4). Um código
 * novo é esperado, não é um defeito — e a descrição que a própria AGT mandar na
 * resposta vale mais do que qualquer coisa que esteja aqui.
 */
export function descreverErro(servico: Servico, codigo: string): string | null {
  const chave = codigo.trim().toUpperCase()
  return CATALOGO[servico]?.[chave] ?? CHAMADA[chave] ?? REGISTAR_FACTURA[chave] ?? null
}

/**
 * O mesmo, para os erros de chamada, onde o código HTTP desfaz a ambiguidade do
 * E96.
 */
export function descreverErroDeChamada(codigo: string, httpStatus: number): string | null {
  const chave = codigo.trim().toUpperCase()

  if (chave === 'E96') {
    return httpStatus === 400
      ? 'Erro na chamada: solicitação mal efectuada — erro de estrutura.'
      : 'Erro na chamada: solicitação ainda em processamento.'
  }

  return CHAMADA[chave] ?? null
}

/**
 * Vale a pena repetir a chamada?
 *
 * E96/422 (ainda em processamento), E97 (prematura) e E98 (demasiadas
 * solicitações) descrevem todos o mesmo: chegámos cedo de mais ou vezes de mais.
 * Qualquer outro código é um problema do conteúdo que enviámos, e repetir com o
 * mesmo conteúdo dá o mesmo erro — só gasta a quota que produz o E98.
 */
export function erroEhTransitorio(codigo: string, httpStatus: number): boolean {
  const chave = codigo.trim().toUpperCase()
  if (chave === 'E96') return httpStatus !== 400
  return chave === 'E97' || chave === 'E98'
}

/** Todos os códigos conhecidos, para testes e para o simulador. */
export function codigosConhecidos(servico: Servico): string[] {
  return Object.keys({ ...CATALOGO[servico], ...CHAMADA }).sort()
}
