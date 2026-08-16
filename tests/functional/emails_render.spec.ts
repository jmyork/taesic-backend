import { test } from '@japa/runner'
import mail from '@adonisjs/mail/services/main'
import AccountActivationMail from '#mails/account_activation_mail'
import AlertaOperacionalMail from '#mails/alerta_operacional_mail'
import CompanyActivatedMail from '#mails/company_activated_mail'
import EmailAlteradoActivacaoMail from '#mails/email_alterado_activacao_mail'
import EmailAlteradoAvisoMail from '#mails/email_alterado_aviso_mail'
import ForgotPasswordMail from '#mails/forgot_password_mail'
import PasswordDefinitionMail from '#mails/password_definition_mail'
import PromotorOtpMail from '#mails/promotor_otp_mail'
import type { BaseMail } from '@adonisjs/mail'

/**
 * Rede de segurança dos templates de email — o equivalente, para `resources/views/emails`,
 * do que `tests/unit/modules_load.spec.ts` é para os repositórios: envia TODAS as Mailables
 * e confirma que cada view renderiza mesmo, com os dados certos lá dentro.
 *
 * Não existia nada disto: um erro de sintaxe no Edge, uma variável mal escrita ou um
 * `@include` para um ficheiro inexistente só apareciam quando o email era enviado a sério —
 * e como o envio está sempre dentro de um try/catch (para não partir o pedido), falhava em
 * silêncio. Os únicos templates com cobertura indirecta eram os dos fluxos já testados.
 *
 * As asserções são propositadamente grosseiras (o conteúdo está lá; nada ficou por
 * interpolar): é um teste de "não rebenta e não mente", não de design.
 */
test.group('emails — todos os templates renderizam', (group) => {
  let fakeMailer: ReturnType<typeof mail.fake>
  group.each.setup(() => {
    fakeMailer = mail.fake()
    return () => mail.restore()
  })

  /** Envia a Mailable e devolve o HTML final + destinatário/assunto. */
  async function render(mailable: BaseMail) {
    await mail.send(mailable)
    const enviada = fakeMailer.mails.sent().at(-1) as any
    const m = enviada.message.nodeMailerMessage
    return { html: String(m.html ?? ''), to: m.to?.[0] as string, subject: m.subject as string }
  }

  /** O que TODOS os emails têm de ter, aconteça o que acontecer. */
  function verificarBase(assert: any, html: string, contexto: string) {
    assert.include(html, '<!DOCTYPE html', `${contexto}: sem doctype`)
    assert.include(html, 'TAESIC', `${contexto}: sem o cabeçalho da marca`)
    assert.include(html, 'Este é um email automático', `${contexto}: sem rodapé`)
    assert.include(html, String(new Date().getFullYear()), `${contexto}: rodapé sem ano`)
    // Uma prop/variável em falta chega ao HTML como "undefined" — e um erro de sintaxe do
    // Edge deixa o próprio `@component`/`{{` no output em vez de o executar.
    assert.notInclude(html, 'undefined', `${contexto}: variável por preencher`)
    assert.notInclude(html, '@component', `${contexto}: tag do Edge por processar`)
    assert.notInclude(html, '{{', `${contexto}: interpolação por processar`)
  }

  test('activação de conta (registo de empresa)', async ({ assert }) => {
    const { html, to, subject } = await render(
      new AccountActivationMail('dono@example.com', 'Ana', 'Padaria Central', 'https://app.taesic.ao/verify/tok-123')
    )
    verificarBase(assert, html, 'account_activation')
    assert.equal(to, 'dono@example.com')
    assert.include(subject, 'Active a sua conta')
    assert.include(html, 'Ana')
    assert.include(html, 'Padaria Central')
    assert.include(html, 'https://app.taesic.ao/verify/tok-123')
    assert.include(html, 'Activar a conta', 'o botão tem de existir')
  })

  test('definição de palavra-passe (conta de funcionário criada)', async ({ assert }) => {
    const { html, to } = await render(
      new PasswordDefinitionMail('func@example.com', 'ze.silva', 'Padaria Central', 'https://app.taesic.ao/reset/tok-456')
    )
    verificarBase(assert, html, 'password_definition')
    assert.equal(to, 'func@example.com')
    assert.include(html, 'ze.silva')
    assert.include(html, 'https://app.taesic.ao/reset/tok-456')
    // Nunca, em circunstância nenhuma, uma palavra-passe dentro deste email.
    assert.notInclude(html.toLowerCase(), 'palavra-passe temporária')
  })

  test('recuperação de palavra-passe', async ({ assert }) => {
    const { html, to } = await render(
      new ForgotPasswordMail('quem.esqueceu@example.com', 'maria', 'https://app.taesic.ao/reset/tok-789')
    )
    verificarBase(assert, html, 'reset_password')
    assert.equal(to, 'quem.esqueceu@example.com')
    assert.include(html, 'maria')
    assert.include(html, 'https://app.taesic.ao/reset/tok-789')
  })

  test('empresa activada — com e sem link de palavra-passe', async ({ assert }) => {
    const comLink = await render(
      new CompanyActivatedMail('dono@example.com', 'Ana', 'Padaria Central', 'https://app.taesic.ao/reset/tok-abc')
    )
    verificarBase(assert, comLink.html, 'company_activated (com link)')
    assert.include(comLink.html, 'https://app.taesic.ao/reset/tok-abc')
    assert.include(comLink.html, 'Por onde começar')

    // O link é opcional: sem ele o botão não pode aparecer — nem meio botão sem destino,
    // que era exactamente o bug antigo deste template.
    const semLink = await render(new CompanyActivatedMail('dono@example.com', 'Ana', 'Padaria Central', ''))
    verificarBase(assert, semLink.html, 'company_activated (sem link)')
    assert.notInclude(semLink.html, 'Definir nova palavra-passe')
  })

  test('alerta operacional (várias linhas)', async ({ assert }) => {
    const { html, subject } = await render(
      new AlertaOperacionalMail('ops@example.com', 'Estoque crítico', [
        'Produto: Farinha de trigo',
        'Quantidade restante: 3',
      ])
    )
    verificarBase(assert, html, 'alerta_operacional')
    assert.include(subject, 'Estoque crítico')
    assert.include(html, 'Farinha de trigo')
    assert.include(html, 'Quantidade restante: 3', 'todas as linhas do alerta têm de sair')
  })

  test('código OTP do promotor', async ({ assert }) => {
    const { html } = await render(new PromotorOtpMail('promotor@example.com', 'Joana', '482913'))
    verificarBase(assert, html, 'promotor_otp')
    assert.include(html, 'Joana')
    assert.include(html, '482913')
    // Sem link nenhum: um email de OTP com botão é uma superfície de phishing gratuita.
    assert.notInclude(html, 'href="http')
  })

  test('email alterado — activação do endereço novo', async ({ assert }) => {
    const { html, to } = await render(
      new EmailAlteradoActivacaoMail(
        'novo@example.com',
        'ze.silva',
        'Padaria Central',
        'antigo@example.com',
        'https://app.taesic.ao/verify/tok-def'
      )
    )
    verificarBase(assert, html, 'email_alterado_activacao')
    assert.equal(to, 'novo@example.com')
    assert.include(html, 'antigo@example.com', 'tem de dizer qual era o endereço anterior')
    assert.include(html, 'novo@example.com')
    assert.include(html, 'https://app.taesic.ao/verify/tok-def')
  })

  test('email alterado — aviso ao endereço antigo', async ({ assert }) => {
    const { html, to } = await render(
      new EmailAlteradoAvisoMail('antigo@example.com', 'ze.silva', 'Padaria Central', 'novo@example.com')
    )
    verificarBase(assert, html, 'email_alterado_aviso')
    assert.equal(to, 'antigo@example.com')
    assert.include(html, 'novo@example.com')
    // Aviso puro: nada para clicar (ver EmailAlteradoAvisoMail).
    assert.notInclude(html, 'href="http')
  })
})
