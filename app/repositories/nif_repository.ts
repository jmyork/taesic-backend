import { DateTime } from 'luxon'
import env from '#start/env'
import NifConsulta from '#models/nif_consulta'

/**
 * Resultado normalizado de uma consulta de NIF.
 *
 * `found` e `disponivel` são coisas DIFERENTES e o chamador precisa de as distinguir:
 * - `disponivel: false` → não conseguimos falar com o portal (serviço em baixo, timeout).
 *   NUNCA deve impedir o utilizador de continuar (fechar a venda, registar o cliente).
 * - `disponivel: true, found: false` → falámos com o portal e o NIF não existe mesmo.
 */
export interface NifResultado {
  nif: string
  found: boolean
  disponivel: boolean
  cached: boolean
  consultado_em: string | null
  data: {
    nome: string | null
    tipo: string | null
    estado: string | null
    inadimplente: string | null
    regime_iva: string | null
    /** Derivado de `tipo` — mapeia para o enum de `cliente.tipo`, para o frontend poder
     * escolher o formulário certo (empresa vs particular) sem o perguntar. */
    tipo_cliente: 'Pessoa Jurídica' | 'Pessoa Física' | null
  } | null
  message: string
}

/** O portal devolve `Tipo` como "COLECTIVO - Empresa" ou "SINGULAR - ...". */
function derivarTipoCliente(tipo: string | null): 'Pessoa Jurídica' | 'Pessoa Física' | null {
  if (!tipo) return null
  const t = tipo.toUpperCase()
  if (t.includes('COLECTIVO') || t.includes('COLETIVO')) return 'Pessoa Jurídica'
  if (t.includes('SINGULAR')) return 'Pessoa Física'
  return null
}

export default class NifRepository {
  private baseUrl() {
    return env.get('NIF_API_URL', 'http://127.0.0.1:3400').toString().replace(/\/+$/, '')
  }

  private timeoutMs() {
    // 20s cobre o pior caso medido (~15s quando o browser do scraper ainda está
    // por lançar). Só a 1.ª consulta de cada NIF paga isto — as seguintes vêm da
    // cache. Se estourar, devolvemos `disponivel: false` e ninguém fica bloqueado.
    return Number(env.get('NIF_API_TIMEOUT_MS', '20000'))
  }

  private cacheDias() {
    return Number(env.get('NIF_CACHE_DIAS', '30'))
  }

  private paraResultado(linha: NifConsulta, cached: boolean): NifResultado {
    return {
      nif: linha.nif,
      found: Boolean(linha.found),
      disponivel: true,
      cached,
      consultado_em: linha.consultado_em?.toISO() ?? null,
      data: linha.found
        ? {
            nome: linha.nome,
            tipo: linha.tipo,
            estado: linha.estado,
            inadimplente: linha.inadimplente,
            regime_iva: linha.regime_iva,
            tipo_cliente: derivarTipoCliente(linha.tipo),
          }
        : null,
      message: linha.found
        ? 'Consulta realizada com sucesso.'
        : `Nenhum contribuinte encontrado para o NIF ${linha.nif}.`,
    }
  }

  /**
   * Consulta um NIF, servindo da cache sempre que possível.
   *
   * Nunca lança por indisponibilidade do serviço externo — devolve
   * `disponivel: false`. Isso é intencional: quem chama isto está a meio de uma venda
   * ou de um registo, e um portal do Estado em baixo não pode bloquear o negócio.
   */
  async consultar(nifBruto: string, opcoes?: { force?: boolean }): Promise<NifResultado> {
    const nif = nifBruto.trim().toUpperCase()

    if (!/^[A-Z0-9]+$/.test(nif)) {
      return {
        nif,
        found: false,
        disponivel: true,
        cached: false,
        consultado_em: null,
        data: null,
        message: 'NIF inválido — só são permitidas letras e números.',
      }
    }

    const emCache = await NifConsulta.findBy('nif', nif)

    if (emCache && !opcoes?.force) {
      const validoAte = emCache.consultado_em?.plus({ days: this.cacheDias() })
      if (validoAte && validoAte > DateTime.now()) {
        return this.paraResultado(emCache, true)
      }
    }

    let corpo: any
    try {
      const resposta = await fetch(`${this.baseUrl()}/consultar-nif/${encodeURIComponent(nif)}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(this.timeoutMs()),
      })

      // 4xx/5xx do serviço de consulta (inclui o 504 que ele devolve quando o portal
      // do Minfin demora demasiado). Tratado como indisponibilidade, não como "não existe".
      if (!resposta.ok) {
        return this.indisponivel(nif, emCache, `O serviço de consulta respondeu ${resposta.status}.`)
      }

      corpo = await resposta.json()
    } catch (erro: any) {
      const motivo =
        erro?.name === 'TimeoutError' || erro?.name === 'AbortError'
          ? 'A consulta ao portal do Minfin excedeu o tempo limite.'
          : 'Não foi possível contactar o serviço de consulta de NIF.'
      return this.indisponivel(nif, emCache, motivo)
    }

    const dados = corpo?.data ?? null
    const found = Boolean(corpo?.found)

    // O scraper devolve as chaves tal como aparecem no portal (com acentos e espaços).
    const linha =
      emCache ??
      new NifConsulta().fill({ nif } as any)

    linha.nif = nif
    linha.found = found
    linha.nome = dados?.['Nome'] ?? null
    linha.tipo = dados?.['Tipo'] ?? null
    linha.estado = dados?.['Estado'] ?? null
    linha.inadimplente = dados?.['Inadimplente'] ?? null
    linha.regime_iva = dados?.['Regime de IVA'] ?? null
    linha.raw = dados ? JSON.stringify(dados) : null
    linha.consultado_em = DateTime.now()
    await linha.save()

    return this.paraResultado(linha, false)
  }

  /**
   * Serviço externo indisponível. Se houver uma consulta anterior em cache (mesmo
   * expirada), devolve-a — dados velhos são melhores do que nenhuns —, mas assinala
   * `cached: true` e o motivo na mensagem.
   */
  private indisponivel(nif: string, emCache: NifConsulta | null, motivo: string): NifResultado {
    if (emCache) {
      const antigo = this.paraResultado(emCache, true)
      return { ...antigo, message: `${motivo} A mostrar a última consulta guardada.` }
    }
    return {
      nif,
      found: false,
      disponivel: false,
      cached: false,
      consultado_em: null,
      data: null,
      message: motivo,
    }
  }
}
