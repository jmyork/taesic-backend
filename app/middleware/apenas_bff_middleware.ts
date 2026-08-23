import { timingSafeEqual } from 'node:crypto'
import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import env from '#start/env'
import { logSecurityEvent } from '../helpers/security_logger.js'

/**
 * Só os frontends indicados podem falar com esta API.
 *
 * PORQUE NÃO CHEGA O CORS: o CORS é uma regra que o BROWSER aplica a si próprio.
 * Um `curl`, um script em Python ou uma app nativa ignoram-no por completo. Ele
 * impede o site de outra pessoa de ler as respostas desta API no browser de um
 * utilizador; não impede ninguém de a chamar.
 *
 * O que isto faz: exige um segredo partilhado, que só o servidor do frontend
 * conhece. Como o frontend passou a falar com a API a partir do seu SERVIDOR (o
 * BFF), e não do browser, o segredo nunca é enviado ao cliente — coisa que era
 * impossível enquanto os pedidos partiam da página.
 *
 * O QUE ISTO NÃO É: a fronteira real. Um segredo num cabeçalho protege enquanto
 * for segredo. A fronteira a sério é a rede — a API não devia sequer ser
 * alcançável a partir da Internet, apenas a partir do host onde o frontend
 * corre. Isto é a segunda tranca, para o dia em que a primeira falhe ou seja mal
 * configurada.
 *
 * FALHA ABERTO, DE PROPÓSITO: sem `BFF_SHARED_SECRET` configurado, não faz nada.
 * Um deploy que não tenha o segredo dos dois lados continua a funcionar em vez
 * de deixar a plataforma inteira em 403. Activar isto é um acto deliberado: põe
 * o mesmo valor no `.env` do backend e no do frontend.
 */
export default class ApenasBffMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    // Dois frontends, dois segredos: a app dos inquilinos e o backoffice da
    // plataforma são clientes distintos e rodam-se um sem tocar no outro. Duas
    // variáveis em vez de uma lista separada por vírgulas porque um segredo é
    // texto arbitrário — uma vírgula lá dentro partiria a lista em silêncio.
    const conhecidos = [
      { cliente: 'app', segredo: env.get('BFF_SHARED_SECRET')?.trim() ?? '' },
      { cliente: 'backoffice', segredo: env.get('BFF_SHARED_SECRET_BACKOFFICE')?.trim() ?? '' },
    ].filter((c) => c.segredo.length > 0)

    if (conhecidos.length === 0) {
      return next()
    }

    const recebido = ctx.request.header('x-bff-secret')?.trim()

    // Sem `find`/`some`, de propósito: esses param no primeiro que casa, e o
    // número de comparações passaria a depender de QUAL dos segredos acertou.
    // Aqui compara-se sempre contra todos.
    let cliente: string | null = null
    for (const c of conhecidos) {
      if (recebido && iguaisEmTempoConstante(recebido, c.segredo)) {
        cliente = c.cliente
      }
    }

    if (!cliente) {
      // Um pedido sem o segredo ou é uma má configuração, ou é alguém a chamar a
      // API directamente. Ambos merecem registo: um pico disto é o sinal de que
      // a API está exposta a quem não devia alcançá-la.
      logSecurityEvent(
        'bff_secret_invalido',
        {
          rota: ctx.route?.pattern,
          tinhaCabecalho: Boolean(recebido),
          clientesConfigurados: conhecidos.map((c) => c.cliente),
        },
        ctx
      )

      // 403 e não 401: não é falta de autenticação do utilizador, é o cliente
      // que não tem autorização para falar com esta API. E a mensagem não diz
      // que cabeçalho falta — quem tem de saber já sabe.
      return ctx.response.forbidden({ message: 'Pedido não autorizado.' })
    }

    return next()
  }
}

/**
 * Comparação de tempo constante.
 *
 * Um `===` normal pára no primeiro carácter diferente, e o tempo que demora
 * revela quantos caracteres estavam certos. Com pedidos suficientes, dá para
 * descobrir o segredo carácter a carácter. `timingSafeEqual` demora o mesmo
 * independentemente de onde está a diferença.
 *
 * Os comprimentos são comparados antes porque `timingSafeEqual` lança se
 * diferirem — e o comprimento de um segredo não é informação que valha proteger.
 */
function iguaisEmTempoConstante(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf8')
  const bufferB = Buffer.from(b, 'utf8')

  if (bufferA.length !== bufferB.length) {
    return false
  }

  return timingSafeEqual(bufferA, bufferB)
}
