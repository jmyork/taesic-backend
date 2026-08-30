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
import { escolherRemetente, REMETENTE_VERIFICADO } from '#mails/remetente'
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

/**
 * O remetente — o campo que ninguém testava e que era o que estava partido.
 *
 * O grupo acima verifica o CORPO de todos os oito emails desde sempre, e nunca
 * olhou para o `from`. Foi por aí que passou o defeito: `alerta_operacional` e
 * `company_activated` usavam `env.get('MAIL_FROM', 'noreply@taesic.com')`, com
 * um `.env` que tem `MAIL_FROM=BKNKV` — um NOME, não um endereço — e um valor
 * por omissão num domínio que nunca foi verificado na Resend.
 *
 * Os dois falhavam com **422 Unprocessable Entity**, e falhavam SÓ eles: seis em
 * oito funcionavam, o que é exactamente a proporção que faz uma avaria durar. O
 * `company_activated` é o email que confirma a activação de uma empresa.
 *
 * Um `from` inválido não é recusado pelo AdonisJS nem por `@adonisjs/mail` — é
 * recusado pela Resend, três saltos à frente, com uma mensagem que não diz qual
 * dos campos está errado. Nada nesta aplicação o apanhava antes do envio real.
 * Estes testes apanham.
 */
test.group('emails — todos saem do remetente verificado', (group) => {
  let fakeMailer: ReturnType<typeof mail.fake>

  group.each.setup(() => {
    fakeMailer = mail.fake()
    return () => {
      mail.restore()
      delete process.env.MAIL_FROM
    }
  })

  async function remetenteDe(mailable: BaseMail): Promise<string> {
    await mail.send(mailable)
    const enviada = fakeMailer.mails.sent().at(-1) as any
    return String(enviada.message.nodeMailerMessage.from ?? '')
  }

  /**
   * As oito. Uma Mailable nova que não apareça aqui é uma Mailable que pode
   * repetir este defeito sem ninguém dar por isso — por isso o teste seguinte
   * conta os ficheiros da pasta e compara.
   */
  const TODAS: Array<[string, () => BaseMail]> = [
    ['account_activation', () => new AccountActivationMail('a@e.com', 'Ana', 'Padaria', 'https://x/v/t')],
    ['alerta_operacional', () => new AlertaOperacionalMail('a@e.com', 'Estoque crítico', ['linha'])],
    ['company_activated', () => new CompanyActivatedMail('a@e.com', 'Ana', 'Padaria', 'https://x/r/t')],
    ['email_alterado_activacao', () => new EmailAlteradoActivacaoMail('n@e.com', 'ze', 'Padaria', 'v@e.com', 'https://x/v/t')],
    ['email_alterado_aviso', () => new EmailAlteradoAvisoMail('v@e.com', 'ze', 'Padaria', 'n@e.com')],
    ['forgot_password', () => new ForgotPasswordMail('a@e.com', 'maria', 'https://x/r/t')],
    ['password_definition', () => new PasswordDefinitionMail('a@e.com', 'ze', 'Padaria', 'https://x/r/t')],
    ['promotor_otp', () => new PromotorOtpMail('a@e.com', 'Joana', '482913')],
  ]

  test('as oito Mailables saem de {REMETENTE_VERIFICADO}', async ({ assert }) => {
    delete process.env.MAIL_FROM

    for (const [nome, construir] of TODAS) {
      const de = await remetenteDe(construir())
      assert.equal(de, REMETENTE_VERIFICADO, `${nome}: remetente errado`)
      assert.include(de, '@bknkv.com', `${nome}: o domínio verificado é bknkv.com`)
    }
  })

  test('nenhuma Mailable ficou de fora desta lista', async ({ assert }) => {
    // Um `from` errado só se vê em produção. Uma Mailable nova que não entre na
    // lista acima escapa a este ficheiro inteiro — e o defeito volta.
    const { readdirSync } = await import('node:fs')
    const ficheiros = readdirSync(new URL('../../app/mails/', import.meta.url))
      .filter((f) => f.endsWith('_mail.ts'))
      .map((f) => f.replace('.ts', ''))

    assert.deepEqual(
      ficheiros.sort(),
      TODAS.map(([n]) => `${n}_mail`).sort(),
      'há Mailables em app/mails que não estão cobertas por este teste'
    )
  })

  test('o valor por omissão antigo (noreply@taesic.com) não sobreviveu em lado nenhum', async ({ assert }) => {
    // Domínio nunca verificado na Resend. Era o fallback das duas partidas.
    for (const [nome, construir] of TODAS) {
      assert.notInclude(await remetenteDe(construir()), 'taesic.com', `${nome}: ainda aponta para taesic.com`)
    }
  })
})

/**
 * A decisão do remetente, verificada directamente.
 *
 * ⚠️ Estes testes NÃO mexem em `process.env`, e a primeira versão mexia.
 *
 * `env.get()` não lê o `process.env` ao vivo: o AdonisJS valida o ambiente no
 * arranque e guarda o resultado; só se a chave estiver AUSENTE desse retrato é
 * que cai para o `process.env` actual. Este projecto TEM `MAIL_FROM` no `.env`
 * (o valor é `BKNKV`), portanto o retrato ganha sempre e um teste que escreva em
 * `process.env.MAIL_FROM` não muda absolutamente nada.
 *
 * Escrevi três testes assim. Dois passaram — e passaram sem testar nada, porque
 * o valor congelado (`BKNKV`) dá o mesmo resultado que eles esperavam. Foi o
 * terceiro, o do endereço válido, que falhou e denunciou os outros dois.
 *
 * Por isso `escolherRemetente()` é uma função pura e é ela que se testa aqui: a
 * regra fica verificada com todos os valores, e sem depender de um pormenor do
 * carregamento do ambiente que se comporta de forma diferente em cada projecto.
 */
test.group('escolherRemetente — a regra', () => {
  test('sem MAIL_FROM, o remetente verificado', ({ assert }) => {
    assert.equal(escolherRemetente(undefined), REMETENTE_VERIFICADO)
    assert.equal(escolherRemetente(''), REMETENTE_VERIFICADO)
    assert.equal(escolherRemetente('   '), REMETENTE_VERIFICADO)
  })

  test('MAIL_FROM sem "@" é IGNORADA — foi isto que causou o 422', ({ assert }) => {
    // `BKNKV` é o valor que está mesmo no .env de dev, de qua e de prd. Não é um
    // endereço. Um `from` assim atravessa o AdonisJS sem um aviso e só é recusado
    // pela Resend, com um 422 que não menciona o campo.
    assert.equal(escolherRemetente('BKNKV'), REMETENTE_VERIFICADO)
    assert.equal(escolherRemetente('Taesic'), REMETENTE_VERIFICADO)
  })

  test('MAIL_FROM com um endereço a sério é respeitada', ({ assert }) => {
    assert.equal(escolherRemetente('outro@bknkv.com'), 'outro@bknkv.com')
    // Com espaços à volta — o que acontece a quem edita um .env à mão.
    assert.equal(escolherRemetente('  outro@bknkv.com  '), 'outro@bknkv.com')
  })

  test('o endereço verificado é o do domínio verificado, e não outro parecido', ({ assert }) => {
    // Os dois enganos que já custaram um 422 cada: `taesic.bknkv.com` (o meu, no
    // backoffice) e `taesic.com` (o fallback antigo daqui). Nenhum é verificado.
    assert.equal(REMETENTE_VERIFICADO, 'noreply.taesic@bknkv.com')
    assert.notInclude(REMETENTE_VERIFICADO, 'taesic.bknkv.com')
    assert.notInclude(REMETENTE_VERIFICADO, '@taesic.com')
  })
})
