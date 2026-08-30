import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import cliente from '#models/cliente'
import Empresa from '#models/empresa'
import { ClienteQueryDTO, CreateclienteDTO, UpdateclienteDTO } from '#dtos/cliente_dto'
import { applyCommonFilters, FieldSpec } from '../helpers/query_filters.js'
import { proximoNumeroPorEmpresa } from '../helpers/sequencial_numero.js'
import { apagarImagemPorUrl, resolverImagem } from '../helpers/imagem_r2.js'

/** Prefixo dos objectos de cliente no bucket, à imagem de `images/products/`. */
const PASTA_NO_R2 = 'images/clientes'

/**
 * As imagens que vieram no pedido, prontas a entrar num `merge()`.
 *
 * ⚠️ A CHAVE TEM DE ESTAR AUSENTE, não a `undefined`. Escrito primeiro como
 *
 *     { logo: await resolverImagem(logo), foto: await resolverImagem(foto) }
 *
 * a partir da ideia — errada — de que o `merge()` do Lucid ignora `undefined`.
 * Não ignora: a chave existe, e o merge atribui `undefined` por cima do valor
 * que veio da base de dados. Um update que mexesse só no nome APAGAVA a foto e o
 * logótipo do cliente.
 *
 * Apanhado pelo teste "update que não menciona a imagem deixa-a como está", em
 * `tests/functional/cliente_imagens_r2.spec.ts` — não por leitura de código.
 */
async function resolverImagens(
  logo: CreateclienteDTO['logo'],
  foto: CreateclienteDTO['foto']
): Promise<{ logo?: string; foto?: string }> {
  const resultado: { logo?: string; foto?: string } = {}

  const novoLogo = await resolverImagem(logo, PASTA_NO_R2)
  if (novoLogo) resultado.logo = novoLogo

  const novaFoto = await resolverImagem(foto, PASTA_NO_R2)
  if (novaFoto) resultado.foto = novaFoto

  return resultado
}

const CLIENTE_FILTER_FIELDS: FieldSpec[] = [
  { kind: 'exact', column: 'cliente.numero', key: 'numero' },
  { kind: 'like', column: 'cliente.nome', key: 'nome' },
  { kind: 'like', column: 'cliente.nome_fantasia', key: 'nome_fantasia' },
  { kind: 'like', column: 'cliente.razao_social', key: 'razao_social' },
  { kind: 'like', column: 'cliente.email', key: 'email' },
  { kind: 'like', column: 'cliente.telefone', key: 'telefone' },
  { kind: 'like', column: 'cliente.telefone_secundario', key: 'telefone_secundario' },
  { kind: 'like', column: 'cliente.nif', key: 'nif' },
  { kind: 'like', column: 'cliente.numero_registro', key: 'numero_registro' },
  { kind: 'like', column: 'cliente.cidade', key: 'cidade' },
  { kind: 'like', column: 'cliente.provincia', key: 'provincia' },
  { kind: 'like', column: 'cliente.pais', key: 'pais' },
  { kind: 'exact', column: 'cliente.tipo', key: 'tipo' },
  { kind: 'exact', column: 'cliente.ativo', key: 'ativo' },
  { kind: 'exact', column: 'cliente.cliente_pai_id', key: 'cliente_pai_id' },
]

/** Campos varridos pela pesquisa livre (`q`) — os mesmos "detalhes do cliente" pesquisáveis
 * individualmente acima, só que todos ao mesmo tempo com OR (para uma caixa de pesquisa
 * única no frontend, em vez de vários filtros separados). */
const CLIENTE_Q_COLUMNS = [
  'cliente.nome',
  'cliente.nome_fantasia',
  'cliente.razao_social',
  'cliente.email',
  'cliente.telefone',
  'cliente.telefone_secundario',
  'cliente.nif',
]

export default class clienteRepository {
  baseQuery() {
    return cliente.query()
  }

  protected scopeToTenant(query: any, companyAlias: string) {
    return query
      .join('empresa', 'empresa.id', 'cliente.empresa_id')
      .where('empresa.company_alias', companyAlias)
  }

  paginate(page = 1, limit = 20, filter?: ClienteQueryDTO) {
    let query = applyCommonFilters(this.baseQuery(), filter, {
      table: 'cliente',
      fields: CLIENTE_FILTER_FIELDS,
    })

    if (filter?.q) {
      query = query.where((sub: any) => {
        for (const column of CLIENTE_Q_COLUMNS) {
          sub.orWhere(column, 'like', `%${filter.q}%`)
        }
      })
    }

    if (filter?.company_alias) {
      query = this.scopeToTenant(query, filter.company_alias)
    } else if (filter?.empresa_id) {
      query = query.where('cliente.empresa_id', filter.empresa_id)
    }

    return query.select('cliente.*').orderBy('cliente.created_at', 'desc').paginate(page, limit)
  }

  findOrFail(id: string, companyAlias?: string) {
    let query = this.baseQuery().where('cliente.id', id)
    if (companyAlias) {
      query = this.scopeToTenant(query, companyAlias)
    }
    return query.select('cliente.*').firstOrFail()
  }

  async create(data: CreateclienteDTO & { company_alias?: string }) {
    const { company_alias, logo, foto, ...clienteData } = data

    // As imagens sobem ANTES de a transacção abrir. Um upload para o R2 é uma
    // chamada de rede que pode levar segundos; feito lá dentro, mantinha uma
    // transacção MySQL aberta — e com ela o bloqueio de linha que
    // `proximoNumeroPorEmpresa` toma com `forUpdate()` sobre a empresa. Duas
    // criações de cliente em simultâneo passariam a esperar uma pela rede da
    // outra.
    //
    // O troco é que um erro DEPOIS daqui deixa o objecto órfão no R2. É o mesmo
    // compromisso que `produto_media_repository.create()` já faz, e é o lado
    // certo para errar: um ficheiro que ninguém referencia custa cêntimos, uma
    // transacção presa custa a aplicação.
    const imagens = await resolverImagens(logo, foto)

    if (company_alias) {
      const empresa = await Empresa.findByOrFail('company_alias', company_alias)
      return db.transaction(async (trx) => {
        const numero = await proximoNumeroPorEmpresa(trx, empresa.id, cliente)
        return cliente.create(
          { ...clienteData, ...imagens, empresa_id: empresa.id, numero },
          { client: trx }
        )
      })
    }
    return cliente.create({ ...clienteData, ...imagens })
  }

  async update(id: string, data: UpdateclienteDTO, companyAlias?: string) {
    const r = await this.findOrFail(id, companyAlias)

    const { logo, foto, ...clienteData } = data

    // Guardadas ANTES do merge: depois dele já não há como saber que objectos o
    // cliente tinha, e ficariam para sempre no bucket sem ninguém a
    // referenciá-los.
    const logoAnterior = r.logo
    const fotoAnterior = r.foto

    const imagens = await resolverImagens(logo, foto)

    r.merge({ ...clienteData, ...imagens })
    await r.save()

    // Só DEPOIS de gravar. Apagar antes deixaria o cliente sem imagem nenhuma se
    // o `save()` falhasse — a antiga já apagada e a nova por gravar.
    if (imagens.logo && logoAnterior !== imagens.logo) {
      await apagarImagemPorUrl(logoAnterior)
    }
    if (imagens.foto && fotoAnterior !== imagens.foto) {
      await apagarImagemPorUrl(fotoAnterior)
    }

    return r
  }

  async softDelete(id: string, companyAlias?: string) {
    const r = await this.findOrFail(id, companyAlias)
    if (r.deletedAt) r.deletedAt = null
    else r.deletedAt = DateTime.now()
    await r.save()

    // As imagens NÃO são apagadas aqui, ao contrário do que
    // `produto_media_repository.softDelete()` faz. A diferença é real: este
    // método é um ALTERNADOR — a linha acima repõe o cliente se ele já estivesse
    // apagado. Apagar os objectos do R2 tornaria a reposição uma operação que
    // devolve uma ficha com as imagens partidas, e sem nada a explicar porquê.
  }
}
