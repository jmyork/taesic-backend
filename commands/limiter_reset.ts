import { BaseCommand, args } from '@adonisjs/core/ace'
import limiter from '@adonisjs/limiter/services/main'

/**
 * Apaga contadores de rate limiting — a alternativa a esperar que a janela passe.
 *
 * Existe por dois motivos, e o segundo é o que o justifica em produção:
 *
 * 1. TESTAR. Os limites são medidos em minutos (5 no `email_action`, 10 no
 *    `otp_confirm`), o que torna impraticável verificar à mão que um bloqueio
 *    afecta só quem devia. Com isto, cada tentativa recomeça do zero:
 *
 *      node ace limiter:reset
 *
 *    Preferível a encurtar os limites em start/limiter.ts "só para ver": um
 *    limite encurtado esquece-se ligado, e o esquecimento não dá erro nenhum —
 *    só deixa a porta aberta ao brute-force que o limite existia para travar.
 *
 * 2. DESBLOQUEAR ALGUÉM. Um utilizador legítimo que fique preso (tentou a
 *    password cinco vezes e acertou à sexta) não tem de esperar os 5 minutos do
 *    bloqueio se houver quem confirme quem é. A chave é a que aparece no evento
 *    `rate_limited` dos logs de segurança (ver `comLogDeBloqueio` em
 *    start/limiter.ts) e tem a forma `<limitador>_<espaco>|<alvo>`:
 *
 *      node ace limiter:reset "login_login|acme|ana"
 *
 * SEM ARGUMENTO APAGA TUDO. Com a store `database` isso é um TRUNCATE à tabela
 * `rate_limits` — em produção, prefira sempre indicar a chave.
 */
export default class LimiterReset extends BaseCommand {
  static commandName = 'limiter:reset'
  static description = 'Apaga contadores de rate limiting (todos, ou só a chave indicada)'

  // `startApp: true` não é opcional: o serviço do limiter precisa da
  // configuração de config/limiter.ts e, na store `database`, da ligação à BD.
  static options = { startApp: true }

  @args.string({
    required: false,
    description: 'Chave a limpar, p.ex. "login_login|acme|ana". Omitida, apaga TODAS.',
  })
  declare chave?: string

  async run() {
    // Uma instância tem de existir ANTES do `clear()`.
    //
    // O `LimiterManager` só sabe limpar as stores para as quais já criou um
    // limitador NESTE processo, e um `node ace` acabado de arrancar não criou
    // nenhum — `clear()` sozinho não faria nada e o comando dizia "feito" sem ter
    // feito. As opções aqui são irrelevantes: servem apenas para materializar a
    // store por omissão, que é a que os limitadores das rotas também usam.
    const store = limiter.use({ requests: 1, duration: '1 minute' })

    if (this.chave) {
      await store.delete(this.chave)
      this.logger.success(`Contador apagado: ${this.chave}`)
      return
    }

    await limiter.clear()
    this.logger.success('Todos os contadores de rate limiting foram apagados.')
  }
}
