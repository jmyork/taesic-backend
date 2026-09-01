/**
 * A fachada do módulo.
 *
 * Fina de propósito, como todos os `*_service.ts` deste projecto (ver
 * `app/services/factura_service.ts`): a lógica vive no repositório, e o serviço
 * é o nome estável que o resto da aplicação chama. Quem quiser ligar a
 * facturação electrónica ao fluxo de venda importa isto, e nada mais deste
 * módulo.
 */

import MinfinRepository, {
  type DocumentoASubmeter,
  type OpcoesDoRepositorio,
} from '../repositorios/minfin_repository.js'
import type { AccaoAdquirente, EstadoSerie } from '../dominio/estados.js'
import type { TipoDocumento } from '../dominio/tipos_documento.js'
import type { EstadoSubmissao } from '../models/minfin_submissao.js'
import { ClienteAgt } from '../cliente/cliente_agt.js'
import { CredenciaisDoAmbiente, type ResolvedorDeCredenciais } from '../repositorios/credenciais.js'
import Empresa from '#models/empresa'

export default class MinfinService {
  private repo: MinfinRepository
  private credenciais: ResolvedorDeCredenciais

  constructor(opcoes: OpcoesDoRepositorio = {}) {
    this.repo = new MinfinRepository(opcoes)
    this.credenciais = opcoes.credenciais ?? new CredenciaisDoAmbiente()
  }

  /* ── Submeter e acompanhar ────────────────────────────────────────────── */

  /** Submete um lote de documentos para registo (máximo 30 por chamada). */
  registarFacturas(companyAlias: string, documentos: DocumentoASubmeter[]) {
    return this.repo.registarFacturas(companyAlias, documentos)
  }

  /** Pergunta o veredicto de uma submissão desta empresa. */
  async sincronizarEstado(companyAlias: string, submissaoId: string) {
    const submissao = await this.repo.submissao(companyAlias, submissaoId)
    return this.repo.sincronizarEstado(submissao)
  }

  /**
   * As submissões que a próxima varredura vai consultar.
   *
   * ⚠️ Cross-tenant, como `sincronizarPendentes()`. Existe separada para o
   * `--simular` do comando poder mostrar EXACTAMENTE a mesma lista que a
   * execução a sério consome — um ensaio que lê uma lista aproximada não diz
   * nada sobre o que vai acontecer.
   */
  pendentesDeVeredicto(limite = 50) {
    return this.repo.pendentesDeVeredicto(limite)
  }

  /**
   * Percorre TODAS as submissões à espera de veredicto, de todas as empresas.
   *
   * ⚠️ Cross-tenant de propósito — é a rotina periódica, não uma rota. Expô-la a
   * um inquilino daria a ele o controlo de quando as submissões dos outros são
   * consultadas, e a contagem delas.
   *
   * Uma falha numa submissão não pára as outras: cada uma é um contribuinte
   * diferente, e um sem credenciais configuradas (ver `credenciais.ts`) não pode
   * bloquear a facturação de todos os restantes.
   */
  async sincronizarPendentes(limite = 50): Promise<{
    consultadas: number
    concluidas: number
    falhas: Array<{ submissao_id: string; motivo: string }>
  }> {
    const pendentes = await this.repo.pendentesDeVeredicto(limite)

    let consultadas = 0
    let concluidas = 0
    const falhas: Array<{ submissao_id: string; motivo: string }> = []

    for (const submissao of pendentes) {
      try {
        await this.repo.sincronizarEstado(submissao)
        consultadas += 1
        if (!submissao.emCurso) concluidas += 1
      } catch (erro: any) {
        falhas.push({ submissao_id: submissao.id, motivo: erro?.message ?? String(erro) })
      }
    }

    return { consultadas, concluidas, falhas }
  }

  /* ── Consultas ────────────────────────────────────────────────────────── */

  submissoes(
    companyAlias: string,
    filtros: { estado?: EstadoSubmissao; page?: number; limit?: number } = {}
  ) {
    return this.repo.submissoes(companyAlias, filtros)
  }

  submissao(companyAlias: string, id: string) {
    return this.repo.submissao(companyAlias, id)
  }

  historicoDaFactura(companyAlias: string, facturaId: string) {
    return this.repo.historicoDaFactura(companyAlias, facturaId)
  }

  /* ── Séries ───────────────────────────────────────────────────────────── */

  series(companyAlias: string) {
    return this.repo.series(companyAlias)
  }

  serieUtilizavel(companyAlias: string, documentType: TipoDocumento, ano: number) {
    return this.repo.serieUtilizavel(companyAlias, documentType, ano)
  }

  solicitarSerie(
    companyAlias: string,
    dados: {
      seriesCode: string
      seriesYear: number
      documentType: TipoDocumento
      firstDocumentNumber?: number
    }
  ) {
    return this.repo.solicitarSerie(companyAlias, dados)
  }

  reconciliarSeries(
    companyAlias: string,
    filtros: { seriesYear?: number; documentType?: TipoDocumento; seriesStatus?: EstadoSerie } = {}
  ) {
    return this.repo.reconciliarSeries(companyAlias, filtros)
  }

  /* ── Consultas directas à AGT (sem persistência) ──────────────────────── */

  /**
   * Estes três não gravam nada: são leituras do lado da AGT que servem
   * conferência e reconciliação, não estado nosso.
   *
   * `consultarFactura` em particular devolve o HISTÓRICO de um documento (pode
   * vir mais que um resultado se a factura foi anulada depois de emitida —
   * 1.4.3.1), e qual deles é "o actual" não está definido no documento. Por isso
   * devolve-se o que veio, sem escolher.
   */
  private async cliente(companyAlias: string): Promise<ClienteAgt> {
    const empresa = await Empresa.findByOrFail('company_alias', companyAlias)
    const cfg = await this.credenciais.resolver({
      id: empresa.id,
      nif: empresa.nif,
      nome: empresa.nome,
    })

    return new ClienteAgt({ configuracao: cfg })
  }

  async listarFacturasNaAgt(companyAlias: string, inicio: string, fim: string) {
    const cliente = await this.cliente(companyAlias)
    return cliente.listarFacturas(inicio, fim)
  }

  async consultarFacturaNaAgt(companyAlias: string, documentNo: string) {
    const cliente = await this.cliente(companyAlias)
    return cliente.consultarFactura(documentNo)
  }

  /**
   * Confirmar ou rejeitar, como ADQUIRENTE, um documento emitido em nosso nome.
   *
   * O NIF do envelope é o de quem COMPRA — o único dos sete serviços em que isso
   * acontece. `companyAlias` é portanto a empresa COMPRADORA, e é a chave dela
   * que assina.
   */
  async confirmarRejeitarDocumento(
    companyAlias: string,
    documentNo: string,
    accao: AccaoAdquirente
  ) {
    const cliente = await this.cliente(companyAlias)
    return cliente.confirmarRejeitarDocumento(documentNo, accao)
  }
}
