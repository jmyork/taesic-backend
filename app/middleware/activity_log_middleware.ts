import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import env from '#start/env'
import { registarActividade } from '../helpers/activity_logger.js'

/**
 * Regista o que atravessa a API: a rota, quem a chamou, o que enviou, o que recebeu.
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
 * ── O corpo é guardado, e isso obriga a cuidados ─────────────────────────────
 *
 * A primeira versão não guardava corpos, por duas razões: trazem segredos, e são o
 * que foi PEDIDO e não o que ficou gravado. O dono do produto quer o rasto completo,
 * e essa é a decisão dele. O que se manteve foi o cuidado:
 *
 *   - **Tudo passa por `redigir()`**, no serviço, num ponto de passagem obrigatório.
 *     Quem chama não tem de se lembrar e não o pode contornar. `password`, `token`,
 *     `cookie`, `authorization`, `cvv`, `iban` — a qualquer profundidade — saem como
 *     `[redigido]`.
 *   - **Nada é guardado inteiro.** Corpos cortados aos 8000 caracteres, listas aos 50
 *     itens, objectos a 6 níveis. O objectivo é reconstruir o que aconteceu, não ter
 *     uma segunda cópia da base de dados.
 *   - **Ficheiros não entram.** `request.body()` traz os campos de um multipart, não o
 *     conteúdo dos ficheiros — esses vivem em `request.allFiles()` e não são lidos
 *     aqui. Guardar um upload numa tabela de auditoria seria absurdo.
 *
 * ── Quanto se captura é configurável ─────────────────────────────────────────
 *
 * `AUDITORIA_CAPTURA` no `.env` (ver `start/env.ts`): `completo` (omissão), `escritas`
 * ou `desligado`. O que isto decide é volume — em `completo`, cada GET deixa uma linha
 * com o corpo da resposta.
 */
export default class ActivityLogMiddleware {
  private static readonly METODOS_QUE_ESCREVEM = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

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
    const captura = env.get('AUDITORIA_CAPTURA', 'completo')
    if (captura === 'desligado') return next()

    const metodo = ctx.request.method().toUpperCase()
    const escreve = ActivityLogMiddleware.METODOS_QUE_ESCREVEM.has(metodo)

    if (captura === 'escritas' && !escreve) return next()

    // O corpo é lido ANTES da acção correr: um controller pode alterar o objecto do
    // pedido (normalizar campos, apagar o que não usa), e o que interessa registar é o
    // que o cliente enviou, não o que sobrou depois.
    const corpoEnviado = captura === 'completo' ? ctx.request.body() : undefined
    const cabecalhos = captura === 'completo' ? ctx.request.headers() : undefined
    const query = captura === 'completo' ? ctx.request.qs() : undefined

    const inicio = Date.now()

    // A acção corre primeiro: só depois se sabe o resultado, e o resultado é metade
    // do que interessa registar — uma tentativa recusada com 403 é precisamente o
    // género de linha que se procura numa auditoria.
    await next()

    const duracao = Date.now() - inicio
    const nomeDaRota = ctx.route?.name
    const estado = ctx.response.getStatus()

    registarActividade(
      {
        // `domain_produtos.store` diz mais do que `create`: identifica a operação
        // exacta e cruza com o catálogo de permissões. Uma rota sem nome (404) cai
        // no método e no caminho, que é o que há.
        action: nomeDaRota ?? `${metodo} ${ctx.request.url()}`,
        subject_type: this.recursoDaRota(nomeDaRota),
        // Nas rotas de recurso, `:id` é o registo afectado. Nas de criação não há
        // `:id` — o id novo só é conhecido dentro do repositório, e é lá que uma
        // chamada explícita a `registarActividade()` o pode acrescentar.
        subject_id: (ctx.params?.id as string | undefined) ?? null,
        status_code: estado,
        duration_ms: duracao,
        description: estado >= 400 ? `Pedido recusado (${estado})` : null,
        request_headers: cabecalhos,
        request_query: query && Object.keys(query).length > 0 ? query : undefined,
        request_body: corpoEnviado,
        // `getBody()` devolve o que o controller pôs na resposta — já depois de
        // `await next()`, portanto está preenchido, tanto para `response.ok({...})`
        // como para um controller que devolva o objecto directamente.
        response_body: captura === 'completo' ? ctx.response.getBody() : undefined,
      },
      ctx
    )
  }
}
