import env from '#start/env'
import mail from '@adonisjs/mail/services/main'
import AlertaOperacionalMail from '#mails/alerta_operacional_mail'
import EstoqueCritico from '#events/estoque_critico'
import LoteValidadeProxima from '#events/lote_validade_proxima'
import VendaCanceladaAltoValor from '#events/venda_cancelada_alto_valor'
import EstoqueRevertido from '#events/estoque_revertido'

/**
 * Envia o alerta para `ALERT_EMAIL` (se configurado). Uma falha ao enviar o email nunca
 * deve reverter/bloquear a operação de negócio que despoletou o evento — por isso o erro
 * é apenas registado, nunca relançado.
 */
async function enviarAlerta(titulo: string, linhas: string[]) {
  const destinatario = env.get('ALERT_EMAIL')
  if (!destinatario) return

  try {
    await mail.send(new AlertaOperacionalMail(destinatario, titulo, linhas))
  } catch (error) {
    console.error(`Falha ao enviar alerta operacional "${titulo}":`, error)
  }
}

export async function onEstoqueCritico(event: EstoqueCritico) {
  await enviarAlerta('Estoque crítico', [
    `O produto "${event.produtoNome}" está com stock crítico.`,
    `Quantidade actual: ${event.quantidadeAtual} (limiar configurado: ${event.limiar}).`,
    `Empresa: ${event.companyAlias}.`,
  ])
}

export async function onLoteValidadeProxima(event: LoteValidadeProxima) {
  const situacao =
    event.diasRestantes <= 0
      ? `expirou há ${Math.abs(event.diasRestantes)} dia(s)`
      : `expira em ${event.diasRestantes} dia(s)`

  await enviarAlerta('Produto perto da validade', [
    `O lote de "${event.produtoNome}" ${situacao} (validade: ${event.dataValidade.toFormat('dd/MM/yyyy')}).`,
    `Empresa: ${event.companyAlias}.`,
  ])
}

export async function onVendaCanceladaAltoValor(event: VendaCanceladaAltoValor) {
  await enviarAlerta('Venda de alto valor cancelada', [
    `A venda ${event.vendaId} foi cancelada com um total de ${event.total} (limiar: ${event.limiar}).`,
    `Empresa: ${event.companyAlias}.`,
  ])
}

export async function onEstoqueRevertido(event: EstoqueRevertido) {
  await enviarAlerta('Reversão de estoque', [
    `${event.quantidade} unidade(s) de "${event.produtoNome}" foram devolvidas ao stock.`,
    `Motivo: ${event.motivo}.`,
    `Empresa: ${event.companyAlias}.`,
  ])
}
