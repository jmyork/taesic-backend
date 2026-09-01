/**
 * Os conjuntos fechados de valores do BAI Paga: estados de pagamento e fluxos.
 *
 * Estão aqui em vez de espalhados por literais no cliente porque são exactamente
 * os valores de que depende a pergunta que importa a um caixa: **posso entregar
 * a mercadoria?** Uma resposta errada a essa pergunta é dinheiro que se perde
 * nos dois sentidos.
 */

/**
 * `MobilePaymentView.status` — os quinze estados que a especificação enumera.
 *
 * ⚠️ A distinção que custa dinheiro: `ACCEPTED` NÃO é `SUCCESS`. `ACCEPTED` diz
 * que o cliente autorizou; `SUCCESS` diz que o dinheiro saiu da conta dele. Uma
 * autorização pode ainda falhar no core banking. Só `SUCCESS` liquida.
 */
export const ESTADOS_PAGAMENTO = {
  PROCESSING: 'Em processamento no banco',
  SUCCESS: 'Pago',
  ERROR: 'Falhou',
  TIMEOUT: 'Expirou sem resposta do banco',
  PENDING_CHALLENGE_RESPONSE: 'À espera do código de confirmação do cliente',
  PENDING_SIGNATURE: 'À espera da assinatura do cliente',
  REJECTED: 'Recusado pelo cliente',
  EXPIRED: 'Expirou sem o cliente ter respondido',
  REVERSED: 'Devolvido na totalidade',
  PARTIAL_REVERSED: 'Devolvido em parte',
  PENDING_ACCEPTANCE: 'À espera de o cliente aceitar',
  ACCEPTED: 'Aceite pelo cliente, ainda não liquidado',
  CANCELED: 'Anulado',
  IN_PROGRESS: 'A decorrer',
  UNKNOWN: 'Estado desconhecido',
} as const

export type EstadoPagamento = keyof typeof ESTADOS_PAGAMENTO

/**
 * Estados a partir dos quais o pagamento ainda pode mudar sozinho — os que
 * justificam voltar a perguntar.
 *
 * `UNKNOWN` está aqui de propósito. É tentador tratá-lo como falha e libertar o
 * cliente sem cobrar; mas `UNKNOWN` quer dizer "não sei", e "não sei" inclui
 * "pago". Perguntar outra vez é a única leitura segura — com um tecto de
 * tentativas, que é o que `esperarDesfecho()` impõe.
 */
export const ESTADOS_PENDENTES: readonly EstadoPagamento[] = [
  'PROCESSING',
  'IN_PROGRESS',
  'PENDING_ACCEPTANCE',
  'PENDING_CHALLENGE_RESPONSE',
  'PENDING_SIGNATURE',
  // `ACCEPTED` é pendente, e é o mais fácil de classificar mal: o nome diz que
  // acabou e o significado diz que não. O cliente autorizou, o core banking
  // ainda não liquidou — daqui ainda se sai para `SUCCESS` ou para `ERROR`.
  'ACCEPTED',
  'UNKNOWN',
] as const

/**
 * Estados finais: o pagamento não muda mais sozinho.
 *
 * `REVERSED` e `PARTIAL_REVERSED` são finais neste sentido — chegou-se lá por
 * uma acção nossa ou do banco, não pela passagem do tempo — mas não são o fim da
 * história do dinheiro: um `PARTIAL_REVERSED` ainda tem `maxReversible` por
 * devolver.
 */
export const ESTADOS_FINAIS: readonly EstadoPagamento[] = [
  'SUCCESS',
  'ERROR',
  'TIMEOUT',
  'REJECTED',
  'EXPIRED',
  'CANCELED',
  'REVERSED',
  'PARTIAL_REVERSED',
] as const

export function estadoEFinal(estado: string): boolean {
  return (ESTADOS_FINAIS as readonly string[]).includes(estado)
}

export function estadoEPendente(estado: string): boolean {
  return (ESTADOS_PENDENTES as readonly string[]).includes(estado)
}

/**
 * O dinheiro entrou?
 *
 * Só `SUCCESS`. E, deliberadamente, `PARTIAL_REVERSED` não conta: entrou e saiu
 * uma parte, e quem quer saber quanto tem de olhar para `totalReversed`, não
 * para um booleano.
 */
export function estadoLiquidou(estado: string): boolean {
  return estado === 'SUCCESS'
}

/**
 * Pode entregar-se a mercadoria?
 *
 * O mesmo que `estadoLiquidou`, com outro nome, porque é esta a pergunta que o
 * código de vendas faz — e é a pergunta que nunca deve ser respondida por
 * `estado !== 'ERROR'`.
 */
export const podeEntregar = estadoLiquidou

/**
 * O contrário NÃO é verdade para todos os estados: um `TIMEOUT` ou um `UNKNOWN`
 * não significam "não foi cobrado". Esta função responde só pelos estados em que
 * o BAI é explícito de que nada saiu da conta do cliente.
 */
export function estadoConfirmaQueNadaFoiCobrado(estado: string): boolean {
  return estado === 'REJECTED' || estado === 'EXPIRED' || estado === 'CANCELED' || estado === 'ERROR'
}

/** `MobilePaymentView.flow` — que caminho gerou este pagamento. */
export const FLUXOS = {
  PAYMENT_TO_MERCHANT: 'Pagamento iniciado pelo cliente na aplicação do banco',
  PAYMENT_REQUESTED_FROM_MERCHANT: 'Pedido de pagamento de valor fixo, confirmado na aplicação',
  PAYMENT_REQUESTED_FROM_MERCHANT_VIA_OTP: 'Pedido de pagamento confirmado por código (OTP) numa página',
  PAYMENT_REQUESTED_FROM_MERCHANT_CAPTIVE: 'Cativo: valor pré-autorizado, confirmado depois',
  PAYMENT_REQUESTED_FROM_MERCHANT_WIDGET: 'Pedido de pagamento através do widget do banco',
} as const

export type Fluxo = keyof typeof FLUXOS

/** Fluxos que este módulo sabe iniciar. Os outros dois só se observam. */
export const FLUXOS_QUE_INICIAMOS: readonly Fluxo[] = [
  'PAYMENT_REQUESTED_FROM_MERCHANT',
  'PAYMENT_REQUESTED_FROM_MERCHANT_VIA_OTP',
  'PAYMENT_REQUESTED_FROM_MERCHANT_CAPTIVE',
] as const

/**
 * A descrição em português de um estado, com recuo para uma frase honesta quando
 * o BAI mandar um estado que não está na especificação.
 *
 * Devolve uma frase e nunca `null` porque este texto vai para um ecrã: um estado
 * novo é esperado (a enumeração deles pode crescer sem nos avisar) e um ecrã em
 * branco é pior do que "estado não reconhecido".
 */
export function descreverEstado(estado: string): string {
  return (ESTADOS_PAGAMENTO as Record<string, string>)[estado] ?? 'Estado não reconhecido'
}
