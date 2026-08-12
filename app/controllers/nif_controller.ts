import type { HttpContext } from '@adonisjs/core/http'
import NifService from '#services/nif_service'

/**
 * Proxy autenticado para o serviço de consulta de NIF (`bknkv-utils-api-resources`).
 *
 * O frontend nunca deve falar directamente com esse serviço: ele não tem
 * autenticação, é um scraper lento (4-14s) e está normalmente noutra porta/host.
 * Aqui ganha-se autenticação, isolamento por empresa, timeout curto e cache.
 */
export default class NifController {
  private service = new NifService()

  async consultar({ params, request }: HttpContext) {
    // `force=true` ignora a cache e volta a consultar o portal — para quando o
    // utilizador sabe que os dados mudaram (ex.: regime de IVA acabou de ser alterado).
    const force = request.input('force') === 'true' || request.input('force') === true
    const data = await this.service.consultar(params.nif, { force })

    return { data, message: data.message, status: 200 }
  }
}
