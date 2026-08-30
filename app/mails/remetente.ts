import env from '#start/env'

/**
 * De onde saem TODOS os emails desta aplicação.
 *
 * ── Porque é que isto existe num ficheiro só para si ──────────────────────────
 *
 * O endereço estava escrito à mão em seis Mailables (`const FROM = ...`) e, nas
 * outras duas, não estava: `alerta_operacional_mail` e `company_activated_mail`
 * usavam `env.get('MAIL_FROM', 'noreply@taesic.com')`.
 *
 * As duas estavam partidas, e de duas maneiras ao mesmo tempo:
 *
 *   1. o `.env` real tem `MAIL_FROM=BKNKV` — um NOME, não um endereço. Um `from`
 *      sem `@` não é recusado pelo AdonisJS nem pelo `@adonisjs/mail`: é recusado
 *      pela Resend, três saltos à frente, com **422 Unprocessable Entity** e uma
 *      mensagem que não diz qual dos campos está errado;
 *   2. mesmo sem `MAIL_FROM`, o valor por omissão era `noreply@taesic.com` — um
 *      domínio que nunca foi verificado na Resend, portanto também 422.
 *
 * Seis emails funcionavam e dois não, e é precisamente essa proporção que fez
 * isto durar: uma avaria em 8 de 8 aparece no primeiro dia, uma avaria em 2 de 8
 * espera pelo caso raro. O `company_activated` é o que confirma a activação de
 * uma empresa — não é um caso raro para quem o esperava.
 *
 * Uma definição só, e as oito a lerem-na daqui.
 */

/**
 * O único remetente verificado na Resend.
 *
 * ⚠️ O domínio é `bknkv.com`, **não** `taesic.bknkv.com` nem `taesic.com`. A
 * verificação foi feita para este e só para este; qualquer outro é 422. Mudar de
 * endereço obriga a verificar o domínio novo na Resend PRIMEIRO — o código é a
 * parte fácil e é a última.
 */
export const REMETENTE_VERIFICADO = 'noreply.taesic@bknkv.com'

/**
 * O remetente a usar, com `MAIL_FROM` a poder sobrepor-se — mas só se for mesmo
 * um endereço.
 *
 * O `.includes('@')` não é uma validação de email; é uma recusa de lixo. Existe
 * porque o valor que lá está hoje (`BKNKV`) é exactamente o tipo de valor que
 * atravessa tudo sem levantar um erro e só falha no fim, longe da causa. Um
 * `MAIL_FROM` que não passe daqui é ignorado em silêncio de propósito: preferir
 * enviar pelo endereço bom a não enviar de todo.
 *
 * (O `taesic-backoffice-api` tem esta mesma regra, em
 * `app/mails/definir_password_mail.ts`, e pela mesma razão — os dois projectos
 * enviam do mesmo domínio, e quem aprender a regra num tem de a encontrar
 * verdadeira no outro.)
 *
 * ── Porque é que a decisão está separada da leitura ───────────────────────────
 *
 * `escolherRemetente()` é PURA: recebe o valor, devolve o endereço. `remetente()`
 * limita-se a entregar-lhe o que `MAIL_FROM` disser.
 *
 * A separação não é cosmética. **`env.get()` não lê o `process.env` ao vivo**: o
 * AdonisJS valida o ambiente uma vez no arranque e guarda o resultado; só quando
 * a chave está AUSENTE desse retrato é que cai para o `process.env` actual (ver
 * `Env.get`, em `@adonisjs/env`). Como este projecto tem `MAIL_FROM` no `.env`, o
 * retrato ganha sempre — e um teste que mexa em `process.env.MAIL_FROM` passa sem
 * testar nada. Escrevi um assim e ele passou; foi a falhar o caso do endereço
 * válido que se percebeu porquê.
 *
 * (No backoffice o mesmo teste é honesto, porque lá `MAIL_FROM` não está no
 * `.env` — a mesma linha de teste, dois projectos, dois significados. É por isso
 * que a decisão passou a verificar-se directamente, sem o ambiente pelo meio.)
 */
export function escolherRemetente(configurado: string | undefined): string {
  const limpo = configurado?.trim()
  return limpo && limpo.includes('@') ? limpo : REMETENTE_VERIFICADO
}

/** O mesmo, a ler `MAIL_FROM`. É isto que as oito Mailables chamam. */
export function remetente(): string {
  return escolherRemetente(env.get('MAIL_FROM'))
}
