import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { registarActividade } from '../helpers/activity_logger.js'

/**
 * Regista TODAS as escritas que passam pela API, sem nenhum controller ter de saber
 * que isto existe.
 *
 * ── Porquê aqui e não nos controllers ────────────────────────────────────────
 *
 * São ~50 controllers e ~190 rotas de domínio. Instrumentá-los um a um daria
 * cobertura no dia em que fosse feito e buracos a partir do dia seguinte: cada rota
 * nova nasceria por auditar, e ninguém daria por isso — que é exactamente o que já
 * aconteceu três vezes neste projecto com o catálogo de permissões mantido à mão
 * (secções 7.6, 7.8 e 7.12 do CLAUDE.md). Um ponto de passagem obrigatório não tem
 * esse problema: uma rota nova fica auditada por existir.
 *
 * ── O que este registo NÃO tem ───────────────────────────────────────────────
 *
 * O **corpo do pedido**, e portanto o "antes e depois" de cada campo. Duas razões,
 * ambas suficientes:
 *
 *   1. O corpo traz segredos (passwords no registo de funcionários, dados de
 *      pagamento) e ficheiros. Uma tabela de auditoria que os capture passa a ser o
 *      sítio mais perigoso da base de dados — e é uma tabela consultável por
 *      administradores de empresa, que sobrevive ao apagar dos dados que descreve.
 *   2. O corpo é o que foi PEDIDO, não o que ficou gravado. Um pedido rejeitado por
 *      validação, ou um campo que o repositório ignora, apareceriam como alterações
 *      que nunca aconteceram.
 *
 * Para o detalhe ao nível da linha há `registarActividade()` com `diferencas()`,
 * chamado onde a mudança de facto acontece — no repositório, com o valor antigo e o
 * novo à mão. Este middleware responde a "quem chamou o quê, quando, e com que
 * resultado"; a chamada explícita responde a "e o que é que mudou".
 *
 * (Um hook `@afterSave` nos models daria o diff automaticamente, mas não saberia
 * QUEM: `useAsyncLocalStorage` está desligado em `config/app.ts`, portanto um hook
 * não alcança o `HttpContext`. Um registo de auditoria sem actor responde a metade da
 * pergunta que se lhe faz, e ligar a ALS por causa disto é uma mudança de
 * comportamento global que não cabe nesta tarefa.)
 */
export default class ActivityLogMiddleware {
  /** Só o que escreve. Um `GET` não altera nada e encheria a tabela de ruído. */
  private static readonly METODOS_A_REGISTAR = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

  /**
   * Deriva o recurso do NOME da rota: `domain_produtos.update` -> `produtos`.
   *
   * O nome da rota é a mesma chave que o RBAC usa, portanto isto liga o registo de
   * auditoria à permissão que o autorizou. Não é o nome da tabela em todos os casos
   * (`domain_produto_marcas` é a tabela `marcas`), e não faz mal: o que interessa é
   * agrupar por recurso de forma estável, não reproduzir o esquema.
   */
  private recursoDaRota(nomeDaRota?: string): string | null {
    if (!nomeDaRota) return null
    const semAccao = nomeDaRota.split('.')[0]
    return semAccao.replace(/^(domain|platform)_/, '') || null
  }

  async handle(ctx: HttpContext, next: NextFn) {
    const metodo = ctx.request.method().toUpperCase()

    if (!ActivityLogMiddleware.METODOS_A_REGISTAR.has(metodo)) {
      return next()
    }

    // A acção corre primeiro: só depois se sabe o resultado, e o resultado é metade
    // do que interessa registar — uma tentativa recusada com 403 é precisamente o
    // género de linha que se procura numa auditoria.
    await next()

    const nomeDaRota = ctx.route?.name
    const estado = ctx.response.getStatus()

    registarActividade(
      {
        // `domain_produtos.store` diz mais do que `create`: identifica a operação
        // exacta e cruza com o catálogo de permissões.
        action: nomeDaRota ?? `${metodo} ${ctx.request.url()}`,
        subject_type: this.recursoDaRota(nomeDaRota),
        // Nas rotas de recurso, `:id` é o registo afectado. Nas de criação não há
        // `:id` — o id novo só é conhecido dentro do repositório, e é lá que uma
        // chamada explícita a `registarActividade()` o pode acrescentar.
        subject_id: (ctx.params?.id as string | undefined) ?? null,
        status_code: estado,
        description: estado >= 400 ? `Pedido recusado (${estado})` : null,
      },
      ctx
    )
  }
}
