/**
 * Um servidor que finge ser a AGT.
 *
 * ── Porque é que isto é o primeiro ficheiro a existir e não o último ──────────
 *
 * Porque o Blueprint entrega os endpoints assim:
 *
 *     Testes:   http://xxx.xxx.xxx.xxx:yyyy/facturaElectronica/registarFactura/
 *     Produção: http://xxx.xxx.xxx.xxx:yyyy/facturaElectronica/registarFactura/
 *
 * Não há endereço, não há porta, não há certificado, não há número de
 * certificação de software. Não é possível fazer uma única chamada real. Sem um
 * duplo, tudo o que este módulo faz seria "deve funcionar" — e este projecto tem
 * uma regra escrita contra isso (CLAUDE.md, secção 1).
 *
 * Com o duplo, o caminho inteiro é exercitável hoje: montar o envelope, assinar,
 * validar, serializar, atravessar um socket, ler a resposta, classificar o erro.
 * O que fica por provar é só o que depende do servidor deles — e está listado no
 * fim do `README.md`.
 *
 * ── O que este simulador NÃO é ───────────────────────────────────────────────
 *
 * Não é uma reimplementação do SIGT. Não verifica assinaturas, não tem
 * repositório de facturas, não sabe se um NIF existe. Reproduz FORMAS de
 * resposta e MODOS DE FALHA — que é exactamente o que o cliente tem de saber
 * distinguir.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

export type Cenario =
  /** 200 com a forma normativa (a das tabelas de composição). */
  | 'sucesso'
  /** 200 com a forma dos EXEMPLOS do documento, que usa outros nomes de chaves. */
  | 'sucesso-forma-de-exemplo'
  /** 400 com `errorList` — o caso de rejeição de conteúdo do registarFactura. */
  | 'erro-de-validacao'
  /** 422 E95 — "erro na chamada, NIF emissor diferente". */
  | 'nif-diferente'
  /** 422 E97 — "solicitação prematura". */
  | 'prematura'
  /** 422 E96 — "solicitação ainda em processamento". */
  | 'em-processamento'
  /** 429 E98 — "demasiadas solicitações repetidas". */
  | 'demasiadas-solicitacoes'
  /** 400 E96 — "solicitação mal efectuada, erro de estrutura". */
  | 'erro-de-estrutura'
  /** 500 sem corpo. */
  | 'avaria'
  /** 200 com HTML — o que um portal cativo ou uma página de erro devolve. */
  | 'corpo-nao-json'
  /** Aceita a ligação e nunca responde. */
  | 'sem-resposta'

export interface ChamadaRecebida {
  servico: string
  metodo: string
  url: string
  cabecalhos: Record<string, string | string[] | undefined>
  corpoBruto: string
  /** O corpo em JSON, ou `null` se não veio corpo nenhum. */
  corpo: any
  /**
   * Chegou corpo?
   *
   * É a pergunta que justifica metade deste ficheiro. Um GET com corpo é legal
   * em HTTP e proibido no `fetch()`; se um dia um intermediário o descartar, é
   * ESTE campo que passa a `false` e diz porquê, em vez de um erro de estrutura
   * do outro lado que não explica nada.
   */
  trouxeCorpo: boolean
  emQuery: Record<string, string>
}

export interface OpcoesDoSimulador {
  cenario?: Cenario
  /**
   * Quantas chamadas a `obterEstado` respondem `resultCode: 8` (em curso) antes
   * de o processamento "terminar". Modela a validação diferida, que é a parte do
   * fluxo mais fácil de implementar mal.
   */
  ciclosDeProcessamento?: number
  /** O `resultCode` final de `obterEstado` depois dos ciclos acima. */
  resultadoFinal?: 0 | 1 | 2 | 9
  /** Documentos a devolver como inválidos no estado final. */
  documentosInvalidos?: string[]
  /** `resultCode` de `solicitarSerie`. */
  resultadoDaSerie?: 0 | 1
}

const SERVICOS = new Set([
  'registarFactura',
  'obterEstado',
  'listarFacturas',
  'consultarFactura',
  'solicitarSerie',
  'listarSeries',
  'confirmarRejeitarDocumento',
])

export class ServidorAgtSimulado {
  private servidor: Server | null = null
  private opcoes: Required<OpcoesDoSimulador>
  private chamadasPorRequestId = new Map<string, number>()

  readonly chamadas: ChamadaRecebida[] = []

  constructor(opcoes: OpcoesDoSimulador = {}) {
    this.opcoes = {
      cenario: opcoes.cenario ?? 'sucesso',
      ciclosDeProcessamento: opcoes.ciclosDeProcessamento ?? 0,
      resultadoFinal: opcoes.resultadoFinal ?? 0,
      documentosInvalidos: opcoes.documentosInvalidos ?? [],
      resultadoDaSerie: opcoes.resultadoDaSerie ?? 1,
    }
  }

  configurar(opcoes: OpcoesDoSimulador): void {
    this.opcoes = { ...this.opcoes, ...opcoes }
  }

  limparRegisto(): void {
    this.chamadas.length = 0
    this.chamadasPorRequestId.clear()
  }

  /** Arranca em porta efémera e devolve a base URL a pôr em `MINFIN_BASE_URL`. */
  iniciar(): Promise<string> {
    return new Promise((resolver) => {
      this.servidor = createServer((req, res) => void this.tratar(req, res))
      this.servidor.listen(0, '127.0.0.1', () => {
        const { port } = this.servidor!.address() as AddressInfo
        resolver(`http://127.0.0.1:${port}/facturaElectronica`)
      })
    })
  }

  parar(): Promise<void> {
    return new Promise((resolver) => {
      if (!this.servidor) return resolver()
      this.servidor.closeAllConnections?.()
      this.servidor.close(() => resolver())
      this.servidor = null
    })
  }

  private async tratar(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const pedacos: Buffer[] = []
    for await (const pedaco of req) pedacos.push(pedaco as Buffer)

    const corpoBruto = Buffer.concat(pedacos).toString('utf8')
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const servico = url.pathname.split('/').filter(Boolean).pop() ?? ''

    let corpo: any = null
    if (corpoBruto.trim() !== '') {
      try {
        corpo = JSON.parse(corpoBruto)
      } catch {
        corpo = null
      }
    }

    this.chamadas.push({
      servico,
      metodo: req.method ?? '',
      url: req.url ?? '',
      cabecalhos: req.headers,
      corpoBruto,
      corpo,
      trouxeCorpo: corpoBruto.trim() !== '',
      emQuery: Object.fromEntries(url.searchParams.entries()),
    })

    if (!SERVICOS.has(servico)) {
      return this.responder(res, 404, {
        errorEntry: { errorCode: 'E99', errorDescription: `Serviço desconhecido: ${servico}` },
      })
    }

    switch (this.opcoes.cenario) {
      case 'sem-resposta':
        return // a ligação fica aberta, sem resposta — é o que produz o timeout

      case 'corpo-nao-json':
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end('<html><body>503 Service Unavailable</body></html>')
        return

      case 'avaria':
        res.writeHead(500)
        res.end()
        return

      case 'nif-diferente':
        return this.responder(res, 422, {
          errorEntry: {
            errorCode: 'E95',
            errorDescription: 'erro na chamada, NIF emissor diferente',
          },
        })

      case 'prematura':
        return this.responder(res, 422, {
          errorEntry: {
            errorCode: 'E97',
            errorDescription: 'erro na chamada, solicitação prematura',
          },
        })

      case 'em-processamento':
        return this.responder(res, 422, {
          errorEntry: {
            errorCode: 'E96',
            errorDescription: 'erro na chamada, solicitação ainda em processamento',
          },
        })

      case 'demasiadas-solicitacoes':
        return this.responder(res, 429, {
          errorEntry: {
            errorCode: 'E98',
            errorDescription: 'erro na chamada, demasiadas solicitações repetidas',
          },
        })

      case 'erro-de-estrutura':
        return this.responder(res, 400, {
          errorEntry: {
            errorCode: 'E96',
            errorDescription: 'solicitação mal efectuada – erro de estrutura',
          },
        })

      case 'erro-de-validacao':
        return this.responder(res, 400, {
          errorList: [
            {
              idError: 'E05',
              descriptionError:
                'Número fiscal do emissor especificado no parâmetro taxRegistrationNumber (5000000000) não possui actividade registada no sistema da AGT.',
            },
            {
              idError: 'E22',
              descriptionError:
                'Valor total de impostos da factura "taxPayable" (100,00) não corresponde à soma dos impostos de todas as linhas (140,00)',
              documentNo: corpo?.documents?.[0]?.documentNo ?? 'FT AB2025/1',
            },
          ],
        })

      case 'sucesso':
      case 'sucesso-forma-de-exemplo':
        return this.responderComSucesso(res, servico, corpo)
    }
  }

  private responderComSucesso(res: ServerResponse, servico: string, corpo: any): void {
    const formaDeExemplo = this.opcoes.cenario === 'sucesso-forma-de-exemplo'

    switch (servico) {
      case 'registarFactura':
        return this.responder(res, 200, { requestID: '123456789012345' })

      case 'obterEstado': {
        const requestID = String(corpo?.requestID ?? '')
        const jaFeitas = this.chamadasPorRequestId.get(requestID) ?? 0
        this.chamadasPorRequestId.set(requestID, jaFeitas + 1)

        if (jaFeitas < this.opcoes.ciclosDeProcessamento) {
          // resultCode 8 e SEM documentStatusList — é o que 1.2.3.1 manda.
          return this.responder(res, 200, { statusResult: { requestID, resultCode: 8 } })
        }

        const invalidos = this.opcoes.documentosInvalidos

        return this.responder(res, 200, {
          statusResult: {
            requestID,
            resultCode: this.opcoes.resultadoFinal,
            documentStatusList: [
              {
                documentNo: 'FT AB2025/1',
                documentStatus: invalidos.includes('FT AB2025/1') ? 'I' : 'V',
              },
              ...invalidos.map((documentNo) => ({
                documentNo,
                documentStatus: 'I',
                errorList: [
                  {
                    errorCode: 'E22',
                    errorDescription: 'Total de impostos não corresponde à soma das linhas',
                  },
                ],
              })),
            ],
          },
        })
      }

      case 'listarFacturas':
        return this.responder(
          res,
          200,
          formaDeExemplo
            ? {
                statusFEListResult: {
                  documentResultCount: 2,
                  resultEntryList: [
                    {
                      documentEntryResult: {
                        documentNo: 'FT AB2025/1',
                        documentDate: '2025-01-03',
                      },
                    },
                    {
                      documentEntryResult: {
                        documentNo: 'FT AB2025/2',
                        documentDate: '2025-01-04',
                      },
                    },
                  ],
                },
              }
            : {
                documentListResult: {
                  documentResultCount: 2,
                  documentResultList: [
                    { documentNo: 'FT AB2025/1', documentDate: '2025-01-03' },
                    { documentNo: 'FT AB2025/2', documentDate: '2025-01-04' },
                  ],
                },
              }
        )

      case 'consultarFactura':
        return this.responder(res, 200, {
          statusFEResult: {
            documentNo: corpo?.documentNo ?? 'FT AB2025/1',
            documents: [
              {
                documentNo: corpo?.documentNo ?? 'FT AB2025/1',
                documentStatus: 'N',
                documentType: 'FT',
                documentDate: '2025-01-03',
                hash: 'XXXXXXXXX',
              },
            ],
          },
        })

      case 'solicitarSerie':
        return this.responder(res, 200, { resultCode: this.opcoes.resultadoDaSerie })

      case 'listarSeries':
        return this.responder(res, 200, {
          seriesListResult: {
            seriesResultCount: 1,
            seriesInfo: [
              {
                seriesCode: 'FT12025',
                seriesYear: 2025,
                documentType: 'FT',
                seriesStatus: 'U',
                seriesCreationDate: '2025-01-01',
                firstDocumentCreated: 'FT AB2025/1',
                lastDocumentCreated: 'FT AB2025/9',
                invoicingMethod: 'FESF',
              },
            ],
          },
        })

      case 'confirmarRejeitarDocumento': {
        const accao = corpo?.action === 'R' ? 'R' : 'C'
        return this.responder(res, 200, {
          confirmRejectResult: { actionResultCode: `${accao}_OK` },
        })
      }

      default:
        return this.responder(res, 404, {})
    }
  }

  private responder(res: ServerResponse, status: number, corpo: unknown): void {
    const texto = JSON.stringify(corpo)
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': String(Buffer.byteLength(texto)),
    })
    res.end(texto)
  }
}
