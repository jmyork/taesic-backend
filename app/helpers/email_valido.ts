import vine from '@vinejs/vine'
import { FieldContext } from '@vinejs/vine/types'

/**
 * Domínios de email descartáveis/temporários.
 *
 * Uma conta criada com um destes fica sem forma de recuperação: o link de activação e o
 * de nova palavra-passe expiram com a caixa de correio, que desaparece em minutos. Como
 * este produto identifica a EMPRESA pelo email do dono (é ele que sai nas facturas, ver
 * `auth_repository.details`), aceitar um endereço temporário é aceitar uma empresa que
 * ninguém consegue contactar nem recuperar.
 *
 * A lista cobre os serviços mais usados e os seus domínios alternativos conhecidos. Não
 * pretende ser exaustiva — é impossível — mas apanha a esmagadora maioria dos casos reais.
 * Acrescentar aqui é a forma de a manter.
 */
const DOMINIOS_DESCARTAVEIS = new Set([
  'uorak.com',
  '0-mail.com',
  '10minutemail.com',
  '10minutemail.net',
  '20minutemail.com',
  '33mail.com',
  'anonbox.net',
  'armyspy.com',
  'bccto.me',
  'burnermail.io',
  'byom.de',
  'cuvox.de',
  'dayrep.com',
  'discard.email',
  'dispostable.com',
  'dropmail.me',
  'einrot.com',
  'emailondeck.com',
  'emailtemporario.com.br',
  'fakeinbox.com',
  'fakemail.net',
  'fleckens.hu',
  'getairmail.com',
  'getnada.com',
  'grr.la',
  'guerrillamail.biz',
  'guerrillamail.com',
  'guerrillamail.de',
  'guerrillamail.info',
  'guerrillamail.net',
  'guerrillamail.org',
  'guerrillamailblock.com',
  'gustr.com',
  'harakirimail.com',
  'inboxbear.com',
  'inboxkitten.com',
  'jetable.org',
  'mailcatch.com',
  'maildrop.cc',
  'mailasdf.com',
  'mailinator.com',
  'mailinator.net',
  'mailnesia.com',
  'mailsac.com',
  'mailtemp.info',
  'mintemail.com',
  'mohmal.com',
  'moakt.com',
  'mytemp.email',
  'nowmymail.com',
  'onetimemail.org',
  'pokemail.net',
  'rhyta.com',
  'sharklasers.com',
  'spam4.me',
  'spamgourmet.com',
  'sute.jp',
  'temp-mail.io',
  'temp-mail.org',
  'tempail.com',
  'tempinbox.com',
  'tempmail.dev',
  'tempmail.email',
  'tempmail.net',
  'tempmail.plus',
  'tempmailo.com',
  'tempr.email',
  'throwawaymail.com',
  'trashmail.com',
  'trashmail.de',
  'trashmail.me',
  'trashmail.net',
  'wegwerfmail.de',
  'yopmail.com',
  'yopmail.fr',
  'yopmail.net',
  'zetmail.com',
])

/**
 * Formato de email realmente utilizável.
 *
 * O `.email()` do VineJS aceita coisas que nunca receberiam correio — por exemplo
 * `a@b` (sem domínio de topo) ou domínios terminados em ponto. Aqui exige-se um domínio
 * com pelo menos um ponto e um TLD com duas ou mais letras.
 */
const FORMATO_EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[a-zA-Z]{2,}$/

export function dominioDoEmail(email: string): string {
  return email.trim().toLowerCase().split('@')[1] ?? ''
}

export function ehEmailDescartavel(email: string): boolean {
  const dominio = dominioDoEmail(email)
  if (!dominio) return false

  if (DOMINIOS_DESCARTAVEIS.has(dominio)) return true

  // Subdomínios de um serviço descartável (ex.: `qualquer.mailinator.com`).
  return [...DOMINIOS_DESCARTAVEIS].some((d) => dominio.endsWith(`.${d}`))
}

/**
 * Regra VineJS: email com formato utilizável e de domínio não descartável.
 *
 * Usa-se A SEGUIR ao `.email()` — este complementa-o, não o substitui.
 */
export const emailUtilizavelRule = vine.createRule(
  (value: unknown, _options: undefined, field: FieldContext) => {
    if (typeof value !== 'string') return

    const email = value.trim()

    if (!FORMATO_EMAIL.test(email)) {
      field.report('O email indicado não é válido', 'email_invalido', field)
      return
    }

    if (ehEmailDescartavel(email)) {
      field.report(
        'Não são aceites emails temporários — indique um endereço permanente',
        'email_descartavel',
        field
      )
    }
  }
)

/** Açúcar para encadear: `vine.string().email().use(emailUtilizavel())`. */
export const emailUtilizavel = () => emailUtilizavelRule()
