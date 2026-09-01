/**
 * A ponte entre o `ClienteAgt` (que só sabe falar HTTP com a AGT) e a base de
 * dados deste projecto.
 *
 * Aqui é que se decide o que fica gravado, e quando. As duas regras que moldam
 * tudo o resto:
 *
 * 1. **A submissão é gravada ANTES de sair.** Se o processo morrer entre o envio
 *    e a resposta, tem de ficar rasto de que houve uma tentativa e com que
 *    `submission_ref` — senão a repetição gera um identificador novo, a AGT vê
 *    duas submissões das mesmas facturas, e a segunda volta com E09 para todas.
 *
 * 2. **Nada aqui lança por falha da AGT.** Herda-se a decisão de
 *    `cliente_agt.ts`: um serviço em baixo devolve um resultado, não uma
 *    excepção. Quem chama está a meio de uma venda.
 */

import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import Empresa from '#models/empresa'
import { ClienteAgt, type DocumentoParaRegisto, type Resultado } from '../cliente/cliente_agt.js'
import type { ConfiguracaoMinfin } from '../configuracao.js'
import { resultadoEFinal } from '../dominio/estados.js'
import type { TipoDocumento } from '../dominio/tipos_documento.js'
import type { EstadoSerie } from '../dominio/estados.js'
import MinfinDocumento from '../models/minfin_documento.js'
import MinfinSerie from '../models/minfin_serie.js'
import MinfinSubmissao, { type EstadoSubmissao } from '../models/minfin_submissao.js'
import {
  CredenciaisDoAmbiente,
  type Contribuinte,
  type ResolvedorDeCredenciais,
} from './credenciais.js'
import type { EstrategiaDeAssinatura } from '../assinatura/jws.js'

export interface OpcoesDoRepositorio {
  credenciais?: ResolvedorDeCredenciais
  assinatura?: EstrategiaDeAssinatura
  relogio?: () => Date
}

/** Cada documento a submeter, com a factura interna que lhe deu origem. */
export interface DocumentoASubmeter {
  documento: DocumentoParaRegisto
  /** Opcional: nem toda a submissão vem de uma factura deste sistema. */
  factura_id?: string | null
}

export default class MinfinRepository {
  private readonly credenciais: ResolvedorDeCredenciais
  private readonly assinatura?: EstrategiaDeAssinatura
  private readonly relogio: () => Date

  constructor(opcoes: OpcoesDoRepositorio = {}) {
    this.credenciais = opcoes.credenciais ?? new CredenciaisDoAmbiente()
    this.assinatura = opcoes.assinatura
    this.relogio = opcoes.relogio ?? (() => new Date())
  }

  /* ── Resolução de empresa e cliente ───────────────────────────────────── */

  private async empresaPorAlias(companyAlias: string): Promise<Empresa> {
    return Empresa.findByOrFail('company_alias', companyAlias)
  }

  private contribuinteDe(empresa: Empresa): Contribuinte {
    return { id: empresa.id, nif: empresa.nif, nome: empresa.nome }
  }

  private async clienteDe(
    empresa: Empresa
  ): Promise<{ cliente: ClienteAgt; cfg: ConfiguracaoMinfin }> {
    const cfg = await this.credenciais.resolver(this.contribuinteDe(empresa))

    return {
      cfg,
      cliente: new ClienteAgt({
        configuracao: cfg,
        assinatura: this.assinatura,
        relogio: this.relogio,
      }),
    }
  }

  /* ── Consultas ────────────────────────────────────────────────────────── */

  /**
   * Todas as leituras passam por aqui, e todas filtram por empresa.
   *
   * É o isolamento por inquilino do ponto 2 da checklist da secção 4 do
   * CLAUDE.md, feito à mão porque este repositório não estende `BaseRepository`
   * (não é CRUD — é orquestração de chamadas externas, o mesmo caso de
   * `relatorios_repository.ts`).
   */
  private baseSubmissoes(empresaId: string) {
    return MinfinSubmissao.query().where('empresa_id', empresaId).whereNull('deleted_at')
  }

  async submissoes(
    companyAlias: string,
    filtros: { estado?: EstadoSubmissao; page?: number; limit?: number } = {}
  ) {
    const empresa = await this.empresaPorAlias(companyAlias)
    let query = this.baseSubmissoes(empresa.id)

    if (filtros.estado) query = query.where('estado', filtros.estado)

    return query.orderBy('created_at', 'desc').paginate(filtros.page ?? 1, filtros.limit ?? 20)
  }

  async submissao(companyAlias: string, id: string) {
    const empresa = await this.empresaPorAlias(companyAlias)

    return this.baseSubmissoes(empresa.id).where('id', id).preload('documentos').firstOrFail()
  }

  /**
   * O histórico de comunicação de uma factura interna.
   *
   * Inclui as tentativas recusadas de propósito: a pergunta "porque é que esta
   * factura ainda não está válida na AGT?" responde-se com elas, não sem elas.
   */
  async historicoDaFactura(companyAlias: string, facturaId: string) {
    const empresa = await this.empresaPorAlias(companyAlias)

    return MinfinDocumento.query()
      .where('empresa_id', empresa.id)
      .where('factura_id', facturaId)
      .whereNull('deleted_at')
      .orderBy('created_at', 'desc')
  }

  /* ── 1.1 registarFactura ──────────────────────────────────────────────── */

  /**
   * Submete um lote de documentos e grava tudo o que aconteceu.
   *
   * A linha da submissão e as dos documentos são criadas numa transacção ANTES
   * da chamada de rede; a chamada corre FORA dela; o resultado é gravado numa
   * segunda transacção.
   *
   * Manter a chamada HTTP fora da transacção não é detalhe: uma transacção aberta
   * durante os 30 segundos de timeout segura ligações do pool e bloqueia as
   * linhas envolvidas — com trinta caixas a facturar ao mesmo tempo, é assim que
   * se esgota o pool e pára a aplicação inteira por causa de um serviço externo
   * lento.
   */
  async registarFacturas(
    companyAlias: string,
    entradas: DocumentoASubmeter[]
  ): Promise<{ submissao: MinfinSubmissao; resultado: Resultado<{ requestID: string }> }> {
    const empresa = await this.empresaPorAlias(companyAlias)
    const { cliente, cfg } = await this.clienteDe(empresa)

    const documentos = entradas.map((e) => e.documento)
    const { pedido, avisos } = cliente.prepararRegisto(documentos)

    const referencia = pedido.submissionGUID ?? pedido.submissionId!

    const submissao = await db.transaction(async (trx) => {
      const linha = await MinfinSubmissao.create(
        {
          empresa_id: empresa.id,
          nif: cfg.nif,
          submission_ref: referencia,
          estado: 'pendente',
          numero_documentos: documentos.length,
          tentativas_estado: 0,
          pedido_json: cfg.registarPayloads ? JSON.stringify(pedido) : null,
          avisos_json: avisos.length > 0 ? JSON.stringify(avisos) : null,
        },
        { client: trx }
      )

      for (const [i, entrada] of entradas.entries()) {
        const doc = pedido.documents[i]

        await MinfinDocumento.create(
          {
            submissao_id: linha.id,
            empresa_id: empresa.id,
            factura_id: entrada.factura_id ?? null,
            document_no: doc.documentNo,
            document_type: doc.documentType,
            document_status: doc.documentStatus,
            document_cancel_reason: doc.documentCancelReason ?? null,
            document_date: DateTime.fromISO(doc.documentDate),
            jws_document_signature: doc.jwsDocumentSignature,
          },
          { client: trx }
        )
      }

      return linha
    })

    const resultado = await cliente.registarFacturas(documentos)

    await this.gravarResultadoDoRegisto(submissao, resultado, cfg)

    return { submissao, resultado }
  }

  private async gravarResultadoDoRegisto(
    submissao: MinfinSubmissao,
    resultado: Resultado<{ requestID: string }>,
    cfg: ConfiguracaoMinfin
  ): Promise<void> {
    if (cfg.registarPayloads && resultado.respostaBruta !== null) {
      submissao.resposta_json = resultado.respostaBruta
    }

    if (resultado.ok) {
      submissao.estado = 'aceite'
      submissao.request_id = resultado.dados.requestID
      submissao.erros_json = null

      /*
       * Quando voltar a perguntar.
       *
       * A validação é diferida "de acordo com a capacidade e programação dos
       * processamentos batch" (1.1.4) e o documento não diz quanto tempo isso
       * demora — só que perguntar cedo devolve E97 ("prematura") e perguntar
       * muitas vezes devolve E98. Um minuto é o primeiro palpite; o recuo em
       * `sincronizarEstado` afasta as tentativas seguintes sozinho.
       */
      submissao.proxima_consulta_em = DateTime.now().plus({ minutes: 1 })
      await submissao.save()
      return
    }

    submissao.erros_json = JSON.stringify(resultado.erros)

    /*
     * A distinção que decide se alguém tem de fazer alguma coisa:
     *
     *   indisponivel → a MESMA submissão volta a sair, tal como está
     *   recusada     → o conteúdo tem de mudar; repetir dá o mesmo erro
     *
     * `resposta-invalida` conta como recusada: recebemos alguma coisa que não
     * percebemos, e repetir não a torna mais legível.
     */
    submissao.estado =
      resultado.repetivel && resultado.tipo === 'indisponivel' ? 'indisponivel' : 'recusada'

    await submissao.save()
  }

  /* ── 1.2 obterEstado ──────────────────────────────────────────────────── */

  /**
   * As submissões que estão à espera de veredicto e já passou a hora de voltar a
   * perguntar. É a lista que uma rotina periódica consome.
   *
   * ⚠️ NÃO filtra por empresa — é uma varredura de plataforma, e é a única coisa
   * neste ficheiro que atravessa inquilinos. Por isso não deve ser exposta a
   * nenhuma rota de inquilino; serve um comando ace.
   */
  async pendentesDeVeredicto(limite = 50): Promise<MinfinSubmissao[]> {
    return MinfinSubmissao.query()
      .where('estado', 'aceite')
      .whereNotNull('request_id')
      .whereNull('deleted_at')
      .where((q) =>
        q
          .whereNull('proxima_consulta_em')
          .orWhere('proxima_consulta_em', '<=', DateTime.now().toSQL()!)
      )
      .orderBy('proxima_consulta_em', 'asc')
      .limit(limite)
  }

  /**
   * Pergunta o estado de uma submissão e grava o veredicto de cada documento.
   *
   * Não recebe `company_alias`: é chamada tanto por uma rota de inquilino (que
   * já resolveu a empresa) como pela rotina de varredura, que percorre todas.
   * A empresa vem da própria submissão.
   */
  async sincronizarEstado(submissao: MinfinSubmissao): Promise<Resultado<unknown>> {
    if (!submissao.request_id) {
      throw new Error(
        `A submissão ${submissao.id} não tem requestID — só se pergunta o estado de uma submissão aceite.`
      )
    }

    const empresa = await Empresa.findOrFail(submissao.empresa_id)
    const { cliente } = await this.clienteDe(empresa)

    const resultado = await cliente.obterEstado(submissao.request_id)

    submissao.tentativas_estado += 1
    submissao.ultima_consulta_em = DateTime.now()

    if (!resultado.ok) {
      submissao.erros_json = JSON.stringify(resultado.erros)
      submissao.proxima_consulta_em = resultado.repetivel ? this.proximaTentativa(submissao) : null
      await submissao.save()
      return resultado
    }

    const estado = resultado.dados

    submissao.result_code = estado.resultCode
    submissao.erros_json = null

    if (!resultadoEFinal(estado.resultCode)) {
      // 7 (prematura/repetitiva) e 8 (em curso): continuar a perguntar, mais devagar.
      submissao.proxima_consulta_em = this.proximaTentativa(submissao)
      await submissao.save()
      return resultado
    }

    submissao.estado = estado.resultCode === 9 ? 'cancelada' : 'concluida'
    submissao.proxima_consulta_em = null

    await db.transaction(async (trx) => {
      submissao.useTransaction(trx)
      await submissao.save()

      for (const veredicto of estado.documentStatusList ?? []) {
        /*
         * Actualiza a linha do documento DESTA submissão, e não a última linha
         * com este `document_no`. Um documento recusado é reenviado noutra
         * submissão, e escrever o veredicto na linha errada faria o histórico
         * dizer que a primeira tentativa passou.
         */
        const linha = await MinfinDocumento.query({ client: trx })
          .where('submissao_id', submissao.id)
          .where('document_no', veredicto.documentNo)
          .first()

        if (!linha) continue

        linha.veredicto = veredicto.documentStatus
        linha.erros_json =
          veredicto.errorList && veredicto.errorList.length > 0
            ? JSON.stringify(veredicto.errorList)
            : null

        await linha.save()
      }
    })

    return resultado
  }

  /**
   * Recuo exponencial suave, com tecto de uma hora.
   *
   * 1, 2, 4, 8, 16, 32, 60, 60... minutos. O tecto existe porque o documento não
   * garante prazo nenhum para a validação diferida: sem ele, à décima tentativa
   * o próximo intervalo seria de oito horas, e uma factura ficaria em estado
   * desconhecido durante um dia de trabalho por causa da nossa própria fórmula.
   */
  private proximaTentativa(submissao: MinfinSubmissao): DateTime {
    const minutos = Math.min(2 ** Math.max(0, submissao.tentativas_estado - 1), 60)
    return DateTime.now().plus({ minutes: minutos })
  }

  /* ── 1.5 / 1.6 séries ─────────────────────────────────────────────────── */

  /** As séries desta empresa, tal como estão gravadas deste lado. */
  async series(companyAlias: string): Promise<MinfinSerie[]> {
    const empresa = await this.empresaPorAlias(companyAlias)

    return MinfinSerie.query()
      .where('empresa_id', empresa.id)
      .whereNull('deleted_at')
      .orderBy('series_year', 'desc')
      .orderBy('series_code', 'asc')
  }

  /**
   * A série a usar para emitir um documento deste tipo, neste ano — ou `null`.
   *
   * `null` não é um detalhe a ignorar: emitir sem série registada devolve E34
   * na comunicação, já depois de o documento ter sido entregue ao cliente.
   */
  async serieUtilizavel(
    companyAlias: string,
    documentType: TipoDocumento,
    ano: number
  ): Promise<MinfinSerie | null> {
    const empresa = await this.empresaPorAlias(companyAlias)

    const candidatas = await MinfinSerie.query()
      .where('empresa_id', empresa.id)
      .where('document_type', documentType)
      .where('series_year', ano)
      .whereNotNull('registada_em')
      .whereNull('deleted_at')
      .orderBy('created_at', 'asc')

    return candidatas.find((s) => s.utilizavel) ?? null
  }

  /**
   * Pede uma série à AGT e grava-a.
   *
   * A linha é criada (ou revivida) ANTES da chamada, com `registada_em` a nulo —
   * e é esse nulo que impede que uma série pedida e não aceite seja usada. Só a
   * resposta com `resultCode: 1` a preenche.
   */
  async solicitarSerie(
    companyAlias: string,
    dados: {
      seriesCode: string
      seriesYear: number
      documentType: TipoDocumento
      firstDocumentNumber?: number
    }
  ): Promise<{
    serie: MinfinSerie
    resultado: Resultado<{ resultCode: number; sucesso: boolean }>
  }> {
    const empresa = await this.empresaPorAlias(companyAlias)
    const { cliente } = await this.clienteDe(empresa)

    const firstDocumentNumber = dados.firstDocumentNumber ?? 1

    /*
     * `deleted_at` fica de fora da procura de propósito: o índice único também o
     * ignora (ver a migração), portanto uma série apagada continua a ocupar o
     * código. Recriá-la é levantar-lhe o `deleted_at`, como já se faz em
     * `domain_user_papel.assign()` e em `semearPostoPadrao()`.
     */
    const existente = await MinfinSerie.query()
      .where('empresa_id', empresa.id)
      .where('series_code', dados.seriesCode)
      .first()

    const serie =
      existente ??
      (await MinfinSerie.create({
        empresa_id: empresa.id,
        series_code: dados.seriesCode,
        series_year: dados.seriesYear,
        document_type: dados.documentType,
        first_document_number: firstDocumentNumber,
      }))

    if (existente) {
      existente.merge({
        deletedAt: null,
        series_year: dados.seriesYear,
        document_type: dados.documentType,
        first_document_number: firstDocumentNumber,
      })
      await existente.save()
    }

    const resultado = await cliente.solicitarSerie({ ...dados, firstDocumentNumber })

    if (resultado.ok && resultado.dados.sucesso) {
      serie.registada_em = DateTime.now()
      serie.erros_json = null
    } else {
      // Um 200 com `resultCode: 0` é uma recusa, e tem de deixar a série por
      // registar tal como uma recusa por HTTP — ver o cenário do simulador.
      serie.registada_em = null
      serie.erros_json = resultado.ok
        ? JSON.stringify([
            {
              errorCode: 'E99',
              errorDescription: 'A AGT recusou a criação da série (resultCode 0).',
            },
          ])
        : JSON.stringify(resultado.erros)
    }

    await serie.save()

    return { serie, resultado }
  }

  /**
   * Traz o estado das séries da AGT e alinha o que está gravado.
   *
   * Reconciliação, não fonte da verdade: só actualiza o que a AGT diz sobre
   * séries que já conhecemos, e ACRESCENTA as que ela conhece e nós não (uma
   * série criada no Portal do Contribuinte, por exemplo). Nunca apaga: uma série
   * ausente da resposta pode ser um filtro nosso mal escolhido, e apagá-la
   * deixaria de haver registo de que existiu.
   */
  async reconciliarSeries(
    companyAlias: string,
    filtros: { seriesYear?: number; documentType?: TipoDocumento; seriesStatus?: EstadoSerie } = {}
  ): Promise<{ actualizadas: number; novas: number; resultado: Resultado<unknown> }> {
    const empresa = await this.empresaPorAlias(companyAlias)
    const { cliente } = await this.clienteDe(empresa)

    const resultado = await cliente.listarSeries(filtros)

    if (!resultado.ok) return { actualizadas: 0, novas: 0, resultado }

    let actualizadas = 0
    let novas = 0

    for (const info of resultado.dados.seriesInfo) {
      if (!info.seriesCode) continue

      const linha = await MinfinSerie.query()
        .where('empresa_id', empresa.id)
        .where('series_code', info.seriesCode)
        .first()

      if (linha) {
        linha.merge({
          series_status: info.seriesStatus ?? linha.series_status,
          invoicing_method: info.invoicingMethod ?? linha.invoicing_method,
          last_document_created: info.lastDocumentCreated ?? linha.last_document_created,
          // A AGT conhece-a: está registada, mesmo que o nosso pedido tenha
          // falhado ou tenha sido feito noutro sítio.
          registada_em: linha.registada_em ?? DateTime.now(),
        })
        await linha.save()
        actualizadas += 1
        continue
      }

      await MinfinSerie.create({
        empresa_id: empresa.id,
        series_code: info.seriesCode,
        series_year: info.seriesYear ?? DateTime.now().year,
        document_type: (info.documentType ?? 'FT') as TipoDocumento,
        first_document_number: 1,
        series_status: info.seriesStatus ?? null,
        invoicing_method: info.invoicingMethod ?? null,
        last_document_created: info.lastDocumentCreated ?? null,
        registada_em: DateTime.now(),
      })
      novas += 1
    }

    return { actualizadas, novas, resultado }
  }
}
