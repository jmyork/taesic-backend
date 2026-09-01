/**
 * O `responseCode` que vem em todas as respostas do BAI Paga.
 *
 * ── A armadilha número um desta API ───────────────────────────────────────────
 *
 * **HTTP 200 não quer dizer que correu bem.** Os dez endpoints que devolvem um
 * `responseCode` devolvem-no dentro de um 200, e `INVALID_MSISDN`,
 * `CORE_BANKING_UNAVAILABLE` ou `UNAUTHORIZED` chegam todos com o mesmo 200 que
 * o `OK`. Um cliente que só olhe para `response.ok` dá por concluídos
 * pagamentos que nunca existiram.
 *
 * É por isso que `ClienteBaipaga.chamar()` verifica os DOIS veredictos — o
 * código HTTP e o `responseCode` — e só devolve `ok: true` quando os dois
 * concordam.
 *
 * ── A armadilha número dois: a descrição contradiz o tipo ─────────────────────
 *
 * A especificação declara `responseCode` como `string` com estes dezassete
 * valores, e a seguir descreve-o como *"Code 0 indicates success, negative codes
 * indicate various error conditions"* — uma descrição de um campo NUMÉRICO, que
 * é o que este campo terá sido numa versão anterior. Ver `DIVERGENCIAS.md`
 * #C-01: aceitamos as duas formas na leitura (`0` e `"OK"` são ambos sucesso) e
 * emitimos sempre a comparação pela forma textual.
 *
 * ── Porque é que há dois textos por código ────────────────────────────────────
 *
 * `DESCRICOES` é para o registo: diz tecnicamente o que aconteceu, e é o que
 * permite a alguém diagnosticar. `mensagemParaUtilizador()` é para o ecrã do
 * operador de caixa: em português de negócio, sem nomes de campos, sem nomes de
 * sistemas e sem nada que descreva a nossa arquitectura a quem estiver do outro
 * lado do balcão. `INVALID_API_KEY` não é problema do cliente e o cliente não
 * tem de saber que existe uma chave.
 */

export const CODIGOS_RESPOSTA = [
  'OK',
  'FATAL',
  'INVALID_PARAMETERS',
  'INVALID_API_KEY',
  'INVALID_CURRENCY',
  'CORE_BANKING_UNAVAILABLE',
  'CUSTOMER_NOT_FOUND_FOR_MSISDN',
  'MAX_FAILED_RETRIES_REACHED',
  'EXISTING_EXTERNAL_REFERENCE',
  'INVALID_MSISDN',
  'INVALID_EXTERNAL_REFERENCE',
  'UNAUTHORIZED',
  'INVALID_MSISDN_FORMAT',
  'SHOPPING_CART_AMOUNT_NOT_EQUAL_TO_TOTAL_AMOUNT',
  'SHOPPING_CART_VAT_PERCENTAGES_NOT_FOUND',
  'ERROR_CALCULATING_SHOPPING_CART',
  'UNKNOWN',
] as const

export type CodigoResposta = (typeof CODIGOS_RESPOSTA)[number]

/** Descrição técnica, para o registo e para quem diagnostica. */
export const DESCRICOES: Record<CodigoResposta, string> = {
  OK: 'Operação aceite pelo BAI.',
  FATAL: 'Erro não classificado do lado do BAI.',
  INVALID_PARAMETERS: 'Um ou mais parâmetros do pedido foram recusados.',
  INVALID_API_KEY: 'A chave enviada em X-MP-ApiKey não foi reconhecida.',
  INVALID_CURRENCY: 'A moeda indicada não é aceite para esta operação.',
  CORE_BANKING_UNAVAILABLE: 'O core banking do BAI não respondeu.',
  CUSTOMER_NOT_FOUND_FOR_MSISDN: 'Não há cliente BAI associado ao número indicado.',
  MAX_FAILED_RETRIES_REACHED: 'Foram esgotadas as tentativas permitidas para esta operação.',
  EXISTING_EXTERNAL_REFERENCE: 'Já existe um pagamento com esta externalReference.',
  INVALID_MSISDN: 'O número indicado não é válido para pagamentos.',
  INVALID_EXTERNAL_REFERENCE: 'A externalReference indicada não corresponde a nenhum pagamento.',
  UNAUTHORIZED: 'A chave é válida mas não tem permissão para esta operação ou para este comerciante.',
  INVALID_MSISDN_FORMAT: 'O número não está no formato internacional esperado (ex.: 244923456789).',
  SHOPPING_CART_AMOUNT_NOT_EQUAL_TO_TOTAL_AMOUNT:
    'O total do carrinho não coincide com o totalAmount enviado no pedido.',
  SHOPPING_CART_VAT_PERCENTAGES_NOT_FOUND:
    'Uma das percentagens de IVA indicadas no carrinho não existe na configuração do BAI.',
  ERROR_CALCULATING_SHOPPING_CART: 'O BAI não conseguiu calcular os totais do carrinho.',
  UNKNOWN: 'O BAI devolveu um erro que não classificou.',
}

/**
 * Códigos que valem uma nova tentativa com exactamente o mesmo conteúdo.
 *
 * Todos os outros descrevem um problema do que enviámos, e repetir dá o mesmo
 * resultado — só gasta a quota que produz o `MAX_FAILED_RETRIES_REACHED`.
 *
 * ⚠️ `MAX_FAILED_RETRIES_REACHED` NÃO está nesta lista, apesar de soar
 * transitório: é precisamente o código que diz que já se repetiu de mais.
 * Repetir aí é a definição do problema.
 */
const TRANSITORIOS: readonly CodigoResposta[] = ['CORE_BANKING_UNAVAILABLE', 'FATAL', 'UNKNOWN']

/**
 * ⚠️ Códigos em que repetir é PERIGOSO, e não apenas inútil.
 *
 * `EXISTING_EXTERNAL_REFERENCE` num pedido de pagamento quer dizer que a
 * referência já foi usada — e a leitura mais provável é que o pedido ANTERIOR
 * passou, não que este falhou. Repetir com uma referência nova aqui cria um
 * segundo pagamento e cobra o cliente duas vezes. A resposta certa é consultar o
 * estado da referência original, e é isso que
 * `ClienteBaipaga.pedirPagamento()` diz na mensagem.
 */
export const EXIGE_CONSULTA_ANTES_DE_REPETIR: readonly CodigoResposta[] = [
  'EXISTING_EXTERNAL_REFERENCE',
]

export function eCodigoConhecido(codigo: string): codigo is CodigoResposta {
  return (CODIGOS_RESPOSTA as readonly string[]).includes(codigo)
}

/**
 * Sucesso, aceitando as duas formas do campo.
 *
 * A forma numérica vem da descrição da especificação (#C-01) e nunca foi
 * observada; está aqui porque uma API que mude de `"OK"` para `0` a meio de uma
 * migração não deve fazer-nos dar um pagamento bom por falhado.
 */
export function eSucesso(codigo: unknown): boolean {
  return codigo === 'OK' || codigo === 0 || codigo === '0'
}

/** Descrição técnica de um código, ou uma frase honesta se for desconhecido. */
export function descrever(codigo: string): string {
  return eCodigoConhecido(codigo)
    ? DESCRICOES[codigo]
    : `Código de resposta não previsto na especificação: "${codigo}".`
}

export function eTransitorio(codigo: string): boolean {
  return (TRANSITORIOS as readonly string[]).includes(codigo)
}

/**
 * O texto que vai para o ecrã de quem está a cobrar.
 *
 * Regras que valem para o mapa inteiro: português, linguagem de negócio, e nada
 * sobre a estrutura do sistema. Os erros que são culpa da nossa configuração
 * (`INVALID_API_KEY`, `UNAUTHORIZED`, `INVALID_PARAMETERS`) recebem todos a
 * mesma frase genérica com um pedido para contactar o suporte — o operador não
 * pode fazer nada com o detalhe, e o detalhe está no registo, onde serve.
 */
export function mensagemParaUtilizador(codigo: string): string {
  const PROBLEMA_NOSSO = 'Não foi possível processar o pagamento. Contacte o suporte.'
  const TENTAR_MAIS_TARDE = 'O serviço de pagamentos do banco está indisponível. Tente daqui a instantes.'

  switch (codigo) {
    case 'OK':
      return 'Pagamento aceite.'

    case 'CUSTOMER_NOT_FOUND_FOR_MSISDN':
      return 'O número indicado não tem conta no BAI. Confirme o número com o cliente.'

    case 'INVALID_MSISDN':
    case 'INVALID_MSISDN_FORMAT':
      return 'O número de telemóvel não é válido. Confirme o número com o cliente.'

    case 'CORE_BANKING_UNAVAILABLE':
    case 'FATAL':
    case 'UNKNOWN':
      return TENTAR_MAIS_TARDE

    case 'MAX_FAILED_RETRIES_REACHED':
      return 'Foram feitas demasiadas tentativas para este pagamento. Inicie um pagamento novo.'

    case 'EXISTING_EXTERNAL_REFERENCE':
      return 'Este pagamento já foi pedido. Consulte o estado antes de o repetir.'

    case 'INVALID_EXTERNAL_REFERENCE':
      return 'Pagamento não encontrado.'

    case 'INVALID_CURRENCY':
      return 'A moeda deste pagamento não é aceite.'

    case 'SHOPPING_CART_AMOUNT_NOT_EQUAL_TO_TOTAL_AMOUNT':
    case 'ERROR_CALCULATING_SHOPPING_CART':
    case 'SHOPPING_CART_VAT_PERCENTAGES_NOT_FOUND':
      return 'Os valores do carrinho não somam o total a cobrar. Reveja os artigos.'

    default:
      // INVALID_API_KEY, UNAUTHORIZED, INVALID_PARAMETERS e tudo o que o BAI
      // venha a acrescentar. Nenhum destes é accionável por quem está ao balcão.
      return PROBLEMA_NOSSO
  }
}
