import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import Factura from '#models/faturacao/factura'
import Vendas from '#models/faturacao/vendas'
import FacturaVenda from '#models/faturacao/factura_venda'
import Cliente from '#models/cliente'
import Empresa from '#models/empresa'
import { proximoNumeroPorSerie } from '../helpers/sequencial_numero.js'
import { aceitaVencimento, definicaoDe, serieDefault } from '../helpers/tipos_de_documento.js'
import {
  type EstadoDoDocumento,
  TIPOS_QUE_LIQUIDAM,
  TIPOS_QUE_TITULAM_A_VENDA,
  estaEmDivida,
  liquida,
  podeSerAnulado,
  proximosDocumentos,
  titulaAVenda,
} from '../helpers/regras_de_emissao.js'
import {
  AnularFacturaDTO,
  ConfirmarRecebimentoDTO,
  EmitirFacturaDTO,
  FacturaQueryDTO,
  ShowFacturaDTO,
} from '#dtos/factura_dto'
import VendaNaoFechadaException from '#exceptions/venda_nao_fechada_exception'
import VendaObrigatoriaException from '#exceptions/venda_obrigatoria_exception'
import VendaJaFacturadaException from '#exceptions/venda_ja_facturada_exception'
import DocumentoJaPagoException from '#exceptions/documento_ja_pago_exception'
import DocumentoSemDividaException from '#exceptions/documento_sem_divida_exception'
import ValorExcedeOrigemException from '#exceptions/valor_excede_origem_exception'
import DocumentoComDependentesException from '#exceptions/documento_com_dependentes_exception'
import FacturaJaAnuladaException from '#exceptions/factura_ja_anulada_exception'
import ValorDoDocumentoEmFaltaException from '#exceptions/valor_do_documento_em_falta_exception'
import PeriodoDeFacturacaoInvalidoException from '#exceptions/periodo_de_facturacao_invalido_exception'
import VendaForaDoPeriodoException from '#exceptions/venda_fora_do_periodo_exception'
import DocumentoDeOrigemInvalidoException from '#exceptions/documento_de_origem_invalido_exception'

/**
 * O SQL de «este documento já foi liquidado».
 *
 * Repete-se em `contasAReceber()`, no filtro `em_divida` da listagem e no comando
 * dos avisos de cobrança. Escrito três vezes, divergiria — e a divergência daria
 * um mapa de cobranças a reclamar dinheiro que já entrou, ou a esconder dívida
 * que não entrou. É a tradução literal do `estaEmDivida()` que as regras de
 * emissão declaram.
 *
 * ── Os tipos vão INTERPOLADOS, e não como parâmetro ──────────────────────────
 *
 * `whereRaw` do Lucid recusa um array como valor de ligação («The values in where
 * clause must not be object or array»), e um `IN (?)` precisa exactamente disso.
 * A alternativa seria um `?` por tipo, montado à mão, e ficaria a depender de a
 * contagem dos dois lados concordar.
 *
 * A interpolação é segura aqui e só aqui: `TIPOS_QUE_LIQUIDAM` é uma constante
 * deste repositório, escrita em TypeScript, que nunca vê uma entrada de
 * utilizador. Ver `literalSql()` em `database/helpers/esquema.ts` para o mesmo
 * problema no lado das migrações.
 */
const SQL_TEM_RECIBO = `
  EXISTS (
    SELECT 1 FROM factura AS recibo
     WHERE recibo.documento_origem_id = factura.id
       AND recibo.tipo IN (${TIPOS_QUE_LIQUIDAM.map((tipo) => `'${tipo}'`).join(', ')})
       AND recibo.status <> 'anulada'
       AND recibo.deleted_at IS NULL
  )`

export default class FacturaRepository {
  /**
   * ── O vendedor ────────────────────────────────────────────────────────────────
   *
   * Não há coluna: quem vendeu resolve-se por `vendas → caixa → user`. Os três
   * `leftJoin` são obrigatoriamente à esquerda — `factura.venda_id` é anulável, e
   * um `join` normal faria desaparecer da listagem todos os documentos que não
   * nascem de uma venda (recibos, notas, adiantamentos), que são metade deles.
   */
  baseQuery() {
    return Factura.query()
      .join('empresa', 'empresa.id', 'factura.empresa_id')
      .leftJoin('vendas', 'vendas.id', 'factura.venda_id')
      .leftJoin('caixa', 'caixa.id', 'vendas.caixa_id')
      .leftJoin('user', 'user.id', 'caixa.user_id')
      .leftJoin('pos', 'pos.id', 'caixa.pos_id')
      /*
       * Quem EMITIU o documento — um segundo join a `user`, com outro apelido.
       *
       * Tem de ser separado do de cima: aquele chega por `venda → caixa → user` e
       * responde «quem vendeu», e mais de metade dos tipos não tem venda nenhuma.
       * Uma nota de crédito, um recibo ou um aviso de cobrança apareciam com o
       * responsável a traço — documentos que mexem em dinheiro sem ninguém
       * identificado por trás.
       */
      .leftJoin('user as emissor', 'emissor.id', 'factura.emitido_por_user_id')
      .select(
        'factura.*',
        'empresa.nome as empresa_nome',
        'empresa.nif as empresa_nif',
        'empresa.localizacao as empresa_localizacao',
        'empresa.contacto as empresa_contacto',
        'user.id as vendedor_id',
        'user.username as vendedor_nome',
        'emissor.username as emitido_por_nome',
        /*
         * O posto de atendimento onde a operação foi feita.
         *
         * Vazio nos documentos que não nascem de uma venda — um recibo ou uma nota
         * não se passam num posto, passam-se sobre um documento. Chega pelo mesmo
         * caminho do vendedor (venda → caixa), porque é a caixa que sabe em que
         * posto estava aberta.
         */
        'pos.nome as pos_nome',
        /*
         * O ESTADO do documento, resolvido na mesma consulta.
         *
         * Quem lê a lista precisa de saber o que ainda se pode fazer a cada linha:
         * já tem recibo? a mercadoria já saiu? Sem isto, o ecrã oferecia «recebido»
         * em documentos já liquidados — e a acção só falhava depois de clicada, com
         * um `DOCUMENTO_JA_PAGO` que ninguém pediu. A alternativa era um pedido por
         * linha, que numa página de vinte documentos são vinte pedidos.
         *
         * `SQL_TEM_RECIBO` é a MESMA expressão que o filtro `em_divida` e o mapa de
         * cobranças usam. Ter de bater certo é o ponto: a lista não pode mostrar por
         * receber o que o botão considera pago.
         */
        db.raw(`${SQL_TEM_RECIBO} AS liquidado`),
        'vendas.entregue_em as venda_entregue_em',
        'vendas.condicao_pagamento as venda_condicao_pagamento'
      )
  }

  async paginate(data: FacturaQueryDTO) {
    let query = this.baseQuery().where('empresa.company_alias', data.company_alias)

    if (data.deleted === 'deleted') {
      query = query.whereNotNull('factura.deleted_at')
    } else if (data.deleted === 'all') {
      // sem filtro
    } else {
      query = query.whereNull('factura.deleted_at')
    }

    if (data.venda_id) {
      query = query.where('factura.venda_id', data.venda_id)
    }

    if (data.tipo) {
      query = query.where('factura.tipo', data.tipo)
    }

    if (data.serie) {
      query = query.where('factura.serie', data.serie)
    }

    if (data.ano) {
      query = query.where('factura.ano', data.ano)
    }

    if (data.status) {
      query = query.where('factura.status', data.status)
    }

    /*
     * Quem vendeu. Só apanha documentos que nascem de uma venda — um recibo ou uma
     * nota não têm vendedor, e filtrar por um exclui-os, que é o que se quer.
     */
    if (data.vendedor_id) {
      query = query.where('caixa.user_id', data.vendedor_id)
    }

    if (data.vendedor) {
      query = query.whereILike('user.username', `%${data.vendedor}%`)
    }

    /*
     * O intervalo de emissão, inclusivo nos dois extremos.
     *
     * `data_emissao` é um TIMESTAMP: comparar com `<= '2026-09-01'` deixaria de
     * fora tudo o que foi emitido nesse dia depois da meia-noite — ou seja, o dia
     * inteiro. Daí o `<` sobre o dia seguinte.
     */
    if (data.data_inicio) {
      query = query.where('factura.data_emissao', '>=', data.data_inicio)
    }

    if (data.data_fim) {
      const diaSeguinte = new Date(data.data_fim)
      diaSeguinte.setDate(diaSeguinte.getDate() + 1)
      query = query.where('factura.data_emissao', '<', diaSeguinte)
    }

    /*
     * O que está por receber, na LISTAGEM de documentos.
     *
     * É o ponto 5 do pedido: quem abre a lista de facturas tem de conseguir ver o
     * que a empresa tem a receber sem ir a outro ecrã. `contasAReceber()` responde
     * à mesma pergunta com os totais e a antiguidade; isto é o mesmo recorte,
     * aplicado à lista de sempre.
     *
     * `vencidas` implica `em_divida` — uma factura já paga não está em atraso, está
     * paga. Sem essa implicação, filtrar por vencidas devolvia todas as facturas
     * antigas, pagas ou não.
     */
    if (data.em_divida || data.vencidas) {
      query = query
        .whereNotNull('factura.data_vencimento')
        .whereNot('factura.status', 'anulada')
        .whereNot((sub) => sub.whereRaw(SQL_TEM_RECIBO))
    }

    if (data.vencidas) {
      query = query.where('factura.data_vencimento', '<', DateTime.now().startOf('day').toSQLDate()!)
    }

    /*
     * Pesquisa livre: nome e NIF do adquirente, mais a referência.
     *
     * A referência (`FT FT2026/14`) é derivada e não existe como coluna — procura-se
     * por série e por número, que é de onde ela sai. Escrever `FT2026` encontra a
     * série; escrever `14` encontra o número.
     */
    if (data.q) {
      const termo = `%${data.q}%`
      query = query.where((sub) => {
        sub
          .whereILike('factura.cliente_nome', termo)
          .orWhereILike('factura.cliente_nif', termo)
          .orWhereILike('factura.serie', termo)
          .orWhereILike('user.username', termo)

        const numero = Number(data.q)
        if (Number.isInteger(numero)) sub.orWhere('factura.numero', numero)
      })
    }

    /*
     * ── Do mais recente para o mais antigo ──────────────────────────────────────
     *
     * A ordenação era por ano, depois por SÉRIE, depois por número. Isso agrupava
     * cada livro seguido — o que faz sentido dentro da secção de um tipo — mas
     * numa lista de todos os documentos dava um resultado que ninguém pede: a
     * série `AC2026` inteira primeiro, depois a `FG2026` inteira, e o documento
     * emitido há cinco minutos algures a meio, por ordem alfabética do seu código.
     *
     * Quem abre esta lista quer ver o que aconteceu agora. Ordena-se pela data de
     * emissão, descendente.
     *
     * O `numero` desempata, e desempata mesmo: vários documentos da mesma série
     * emitidos no mesmo segundo (o fecho de uma venda emite um, a entrega de um
     * adiantamento emite outro) ficariam em ordem indefinida, e uma ordem
     * indefinida na chave de paginação faz linhas repetirem-se numa página e
     * desaparecerem de outra.
     */
    return query
      .orderBy('factura.data_emissao', 'desc')
      .orderBy('factura.numero', 'desc')
      .paginate(data.page ?? 1, data.limit ?? 20)
  }

  async findOrFail(data: ShowFacturaDTO) {
    return this.baseQuery()
      .where('empresa.company_alias', data.company_alias)
      .where('factura.id', data.id)
      .firstOrFail()
  }

  /**
   * O que se pode fazer a seguir a este documento.
   *
   * As duas perguntas que as regras precisam de responder — já foi liquidado? tem
   * documentos por cima? — não se leem da linha: leem-se do que aponta para ela.
   * Por isso vivem aqui, e não em `regras_de_emissao.ts`, que é deliberadamente
   * puro para se poder testar sem base de dados.
   */
  async proximos(data: ShowFacturaDTO) {
    const factura = await this.findOrFail(data)

    const dependentes = await Factura.query()
      .where('documento_origem_id', factura.id)
      .whereNot('status', 'anulada')
      .whereNull('deleted_at')
      .select('tipo')

    const estado: EstadoDoDocumento = {
      tipo: factura.tipo,
      anulado: factura.status === 'anulada',
      /*
       * Nasceu em dívida — lido da coluna e não de uma lista de tipos.
       *
       * Era aqui que estava o buraco: uma `Factura` paga ao balcão e uma `Factura`
       * a 30 dias são o mesmo tipo, e a antiga lista `TIPOS_JA_PAGOS` tinha de
       * decidir por ambas. Decidia que nenhuma estava paga, e o ecrã oferecia
       * «registar o pagamento» de dinheiro que já estava na caixa.
       */
      aCredito: factura.data_vencimento !== null && factura.data_vencimento !== undefined,
      liquidado: dependentes.some((d) => (TIPOS_QUE_LIQUIDAM as readonly string[]).includes(d.tipo)),
      temDependentes: dependentes.length > 0,
    }

    return {
      documento: factura,
      proximos: proximosDocumentos(estado),
      pode_anular: podeSerAnulado(estado),
      /*
       * A mesma pergunta que a listagem e o mapa de cobranças fazem, respondida
       * pela MESMA função pura. O ecrã de detalhe não tem de a recalcular — e, se
       * a recalculasse, mais cedo ou mais tarde discordaria dos outros dois.
       */
      em_divida: estaEmDivida(estado),
    }
  }

  /**
   * Esta venda já está titulada?
   *
   * DUAS perguntas, e é a segunda que se esquece: `factura.venda_id` cobre as
   * facturas normais, e `factura_venda` cobre as vendas dentro de uma factura
   * global. Verificar só a primeira deixava uma venda coberta por uma global
   * voltar a ser facturada — foi assim que o teste
   * «uma venda dentro de uma global não pode ser facturada outra vez» falhou.
   *
   * Está aqui, num sítio só, precisamente porque a resposta tem de ser a mesma em
   * `emitir()` e em `vendasPorFacturar()` — se divergirem, o ecrã oferece o que a
   * emissão recusa.
   */
  private async vendaJaTitulada(
    vendaId: string,
    trx?: TransactionClientContract
  ): Promise<boolean> {
    const porColuna = await Factura.query({ client: trx })
      .where('venda_id', vendaId)
      .whereIn('tipo', [...TIPOS_QUE_TITULAM_A_VENDA])
      .whereNot('status', 'anulada')
      .whereNull('deleted_at')
      .first()

    if (porColuna) return true

    const porGlobal = await FacturaVenda.query({ client: trx })
      .where('factura_venda.venda_id', vendaId)
      .join('factura', 'factura.id', 'factura_venda.factura_id')
      .whereNot('factura.status', 'anulada')
      .whereNull('factura.deleted_at')
      .first()

    return Boolean(porGlobal)
  }

  /**
   * As vendas fechadas que ainda não foram tituladas por nenhum documento.
   *
   * É o que o ecrã de emissão tem de oferecer. Listar todas as vendas fechadas —
   * como fazia — punha lá as já facturadas, e escolher uma delas passou a ser um
   * 409 garantido. Oferecer uma acção que se sabe que vai ser recusada é pior do
   * que não a oferecer (§7.22).
   */
  async vendasPorFacturar(companyAlias: string, limite = 50) {
    const empresa = await Empresa.findByOrFail('company_alias', companyAlias)

    return Vendas.query()
      .join('caixa', 'caixa.id', 'vendas.caixa_id')
      .join('pos', 'pos.id', 'caixa.pos_id')
      .where('pos.empresa_id', empresa.id)
      .where('vendas.status', 'fechada')
      .whereNull('vendas.deleted_at')
      .whereNotExists((q) =>
        q
          .from('factura')
          .whereRaw('factura.venda_id = vendas.id')
          .whereIn('factura.tipo', [...TIPOS_QUE_TITULAM_A_VENDA])
          .whereNot('factura.status', 'anulada')
          .whereNull('factura.deleted_at')
      )
      /*
       * E as que já estão dentro de uma factura global — também estão tituladas,
       * só que pela tabela de ligação e não por `factura.venda_id`. Sem esta
       * segunda condição, uma venda coberta por uma global voltava a aparecer como
       * disponível e podia ser facturada uma segunda vez.
       */
      .whereNotExists((q) =>
        q
          .from('factura_venda')
          .join('factura', 'factura.id', 'factura_venda.factura_id')
          .whereRaw('factura_venda.venda_id = vendas.id')
          .whereNot('factura.status', 'anulada')
          .whereNull('factura.deleted_at')
      )
      .select('vendas.*')
      .orderBy('vendas.created_at', 'desc')
      .limit(limite)
  }

  /**
   * Emite um documento fiscal.
   *
   * ── A numeração ──────────────────────────────────────────────────────────────
   *
   * Sequencial por EMPRESA, TIPO, SÉRIE e ANO — o que o art.º 10.º do Decreto
   * Presidencial 71/25 exige. Uma sequência única por empresa, partilhada por todos
   * os tipos, daria `FT 1`, `NC 2`, `FT 3`: nenhuma série sequencial, todas com
   * buracos.
   *
   * O lock continua a ser na linha da empresa, dentro de `proximoNumeroPorSerie` —
   * o mesmo padrão de sempre, e a explicação de porque não é uma tabela de
   * contadores está lá.
   *
   * ── O que se copia, e porquê se copia ────────────────────────────────────────
   *
   * Nome, NIF e morada do adquirente são gravados na factura em vez de resolvidos
   * por chave estrangeira, tal como já acontecia com os dois primeiros. Um
   * documento fiscal tem de continuar a dizer a verdade sobre o dia em que foi
   * emitido, mesmo depois de o cliente mudar de morada ou de ser apagado.
   *
   * ── `trxExterna`, e porque é que ela passou a existir ────────────────────────
   *
   * O fecho da venda passou a emitir o documento — deixou de ser um segundo passo
   * manual noutro ecrã. Emitir DEPOIS da transacção do fecho abria uma janela em
   * que a venda estava fechada, o stock tinha saído, e o documento fiscal não
   * existia: um dia com vendas a mais do que documentos, e nada a dizer quais.
   *
   * Com a transacção do chamador, ou as duas coisas ficam gravadas ou nenhuma
   * fica. Sem ela — a emissão manual, que continua a existir — abre a sua própria,
   * exactamente como antes.
   */
  async emitir(data: EmitirFacturaDTO, trxExterna?: TransactionClientContract) {
    const empresa = await Empresa.query({ client: trxExterna })
      .where('company_alias', data.company_alias)
      .firstOrFail()
    const definicao = definicaoDe(data.tipo)

    /*
     * 1. A venda — exigida em uns tipos, aceite noutros, proibida no resto.
     *
     * Os tipos que a PROÍBEM nunca a procuram: ir buscá-la «se vier» abriria a
     * porta a emitir um recibo agarrado a uma venda por engano. É por isso que
     * `aceitaVenda` existe ao lado de `exigeVenda` — a factura de adiantamento
     * tanto sai de um sinal recebido à cabeça (sem venda) como do balcão com o
     * carrinho já feito (com venda, e é dela que tira as linhas).
     */
    let venda: Vendas | null = null

    if (definicao.exigeVenda && !data.venda_id) {
      /*
       * O validator já exigiu `venda_id` para estes tipos (regra 7.20). Isto é a
       * segunda defesa, para quem chame o repositório directamente: sem ela o
       * `undefined` chega ao `.where()` do Lucid e sai «.where expects value to be
       * defined» — um 500 que não diz que campo falta. Foi assim que este caminho
       * rebentou em `relatorios_repository.spec.ts`.
       */
      throw new VendaObrigatoriaException()
    }

    if (definicao.aceitaVenda && data.venda_id) {
      venda = await Vendas.query({ client: trxExterna })
        .join('caixa', 'caixa.id', 'vendas.caixa_id')
        .join('pos', 'pos.id', 'caixa.pos_id')
        .where('pos.empresa_id', empresa.id)
        .where('vendas.id', data.venda_id)
        .select('vendas.*')
        .firstOrFail()

      if (venda.status !== 'fechada') {
        throw new VendaNaoFechadaException()
      }

      /*
       * REGRA 1 — uma venda é titulada por UM documento.
       *
       * Factura, factura-recibo e factura genérica são alternativas entre si, não
       * cumulativas (art.º 5.º). Sem esta verificação, a mesma operação era
       * declarada às Finanças tantas vezes quantas alguém carregasse no botão — a
       * base de desenvolvimento tinha uma venda de 20.000 Kz com OITO documentos a
       * titulá-la.
       *
       * A factura de ADIANTAMENTO passa aqui ao lado, e é deliberado: titula um
       * recebimento, não uma entrega. A venda continua por titular até o produto
       * sair, e é `vendas_repository.entregar()` que emite o documento que a titula.
       *
       * Os anulados não contam: anular existe precisamente para se poder emitir de
       * novo depois de um erro.
       */
      if (titulaAVenda(data.tipo)) {
        if (await this.vendaJaTitulada(venda.id, trxExterna)) {
          throw new VendaJaFacturadaException()
        }
      }
    }

    /*
     * 2. O documento de origem, quando o tipo o exige.
     *
     * Confinado à empresa: sem esse `where`, uma nota de crédito podia rectificar
     * a factura de outro contribuinte, e o id é um UUID que não denuncia de quem é.
     * E não pode estar anulado — rectificar um documento que já não produz efeitos
     * não rectifica nada.
     */
    let origem: Factura | null = null

    if (definicao.exigeOrigem) {
      // Mesma segunda defesa do `venda_id` acima: não indicado e indicado-mas-
      // inválido são o mesmo problema para quem emite, e a excepção cobre os dois.
      if (!data.documento_origem_id) {
        throw new DocumentoDeOrigemInvalidoException()
      }

      origem = await Factura.query({ client: trxExterna })
        .where('id', data.documento_origem_id)
        .where('empresa_id', empresa.id)
        .whereNull('deleted_at')
        .first()

      if (!origem || origem.status === 'anulada') {
        throw new DocumentoDeOrigemInvalidoException()
      }

      /*
       * REGRAS 2, 3 e 5 — o recibo e o aviso de cobrança só sobre uma DÍVIDA.
       *
       * ── O que mudou, e porque é que a versão anterior não podia funcionar ────
       *
       * A pergunta era feita ao TIPO (`jaIncluiPagamento`): uma factura-recibo já
       * está paga, uma factura não. Isso descrevia o mundo enquanto o único
       * caminho era emitir tudo à mão, mas deixou de descrever no momento em que
       * a venda passou a emitir por si — porque a mesma `Factura` tanto sai de uma
       * venda a prazo (dívida) como não sai de todo do fluxo a pronto pagamento.
       *
       * Passa a ser feita à LINHA: um documento está em dívida se tem
       * `data_vencimento` e não tem recibo por cima. É a definição escrita em
       * `estaEmDivida()`, e é a mesma que o mapa de cobranças usa — não pode
       * haver um documento que apareça por receber num sítio e recuse o recibo no
       * outro.
       *
       * As duas recusas têm mensagens diferentes de propósito: «nunca foi uma
       * dívida» e «já foi paga» mandam procurar coisas diferentes.
       *
       * A factura de ADIANTAMENTO fica de fora, e é de propósito: aí o dinheiro
       * entra primeiro e a mercadoria sai depois, portanto não há recebimento
       * nenhum por confirmar. O que ela espera é a entrega.
       */
      if (liquida(data.tipo) || data.tipo === 'Aviso de Cobrança') {
        if (!origem.data_vencimento) {
          throw new DocumentoSemDividaException()
        }

        const jaLiquidado = await Factura.query({ client: trxExterna })
          .where('documento_origem_id', origem.id)
          .whereIn('tipo', [...TIPOS_QUE_LIQUIDAM])
          .whereNot('status', 'anulada')
          .whereNull('deleted_at')
          .first()

        if (jaLiquidado) {
          throw new DocumentoJaPagoException()
        }
      }
    }

    /*
     * 2b. As vendas cobertas, na factura global.
     *
     * Plural: uma factura global titula TODAS as operações de um período, e é isso
     * que a distingue de uma factura normal. Cada uma tem de estar fechada, ser
     * desta empresa e ainda não estar titulada — a mesma REGRA 1 de sempre, só que
     * aplicada a um conjunto.
     */
    let vendasCobertas: Vendas[] = []

    if (definicao.exigeVendas) {
      const ids = data.vendas_ids ?? []

      if (ids.length === 0) {
        throw new VendaObrigatoriaException()
      }

      vendasCobertas = await Vendas.query({ client: trxExterna })
        .join('caixa', 'caixa.id', 'vendas.caixa_id')
        .join('pos', 'pos.id', 'caixa.pos_id')
        .where('pos.empresa_id', empresa.id)
        .whereIn('vendas.id', ids)
        .whereNull('vendas.deleted_at')
        .select('vendas.*')

      /*
       * Contagem, e não «encontrou alguma»: um id de outra empresa, ou inexistente,
       * desapareceria em silêncio e a factura global saía a cobrir menos operações
       * do que quem a emitiu julga.
       */
      if (vendasCobertas.length !== ids.length) {
        throw new VendaObrigatoriaException()
      }

      if (vendasCobertas.some((v) => v.status !== 'fechada')) {
        throw new VendaNaoFechadaException()
      }

      const jaTituladas = await Factura.query({ client: trxExterna })
        .whereIn('venda_id', ids)
        .whereIn('tipo', [...TIPOS_QUE_TITULAM_A_VENDA])
        .whereNot('status', 'anulada')
        .whereNull('deleted_at')
        .first()

      const jaEmOutraGlobal = await FacturaVenda.query({ client: trxExterna })
        .whereIn('factura_venda.venda_id', ids)
        .join('factura', 'factura.id', 'factura_venda.factura_id')
        .whereNot('factura.status', 'anulada')
        .whereNull('factura.deleted_at')
        .first()

      if (jaTituladas || jaEmOutraGlobal) {
        throw new VendaJaFacturadaException()
      }
    }

    /*
     * 3. O período, na factura global. O art.º 8.º limita a periodicidade a mensal.
     *
     * `plus({ months: 1 })` e não 30 ou 31 dias: «um mês» de 31 de Janeiro é 28 ou
     * 29 de Fevereiro, e contar dias recusaria um período de Janeiro inteiro ou
     * aceitaria um de Fevereiro a mais.
     */
    let periodoInicio: DateTime | null = null
    let periodoFim: DateTime | null = null

    if (definicao.exigePeriodo) {
      periodoInicio = DateTime.fromJSDate(data.periodo_inicio!)
      periodoFim = DateTime.fromJSDate(data.periodo_fim!)

      const limite = periodoInicio.plus({ months: 1 })

      if (periodoFim < periodoInicio || periodoFim > limite) {
        throw new PeriodoDeFacturacaoInvalidoException()
      }

      /*
       * REGRA 7 — as vendas escolhidas têm de cair DENTRO do período declarado.
       *
       * Sem isto, uma global de Janeiro podia cobrir vendas de Março: o documento
       * declarava um período e titulava outro, e o total não batia com nada. É a
       * verificação que faltava, e está aqui e não no passo 2b porque só depois de
       * o período estar validado é que há contra o que comparar.
       *
       * O fim do período é INCLUSIVO até ao fim do dia: `vendas.created_at` é um
       * timestamp, e comparar com a data seca deixaria de fora tudo o que foi
       * vendido nesse dia depois da meia-noite — ou seja, o dia inteiro. É a mesma
       * armadilha do filtro de datas da listagem.
       */
      const inicio = periodoInicio.startOf('day')
      const fim = periodoFim.plus({ days: 1 }).startOf('day')

      const foraDoPeriodo = vendasCobertas.filter((v) => {
        const quando = v.createdAt
        return !quando || quando < inicio || quando >= fim
      })

      if (foraDoPeriodo.length > 0) {
        throw new VendaForaDoPeriodoException()
      }
    }

    /*
     * 4. O total.
     *
     * Da venda quando ela existe — e nunca do pedido, mesmo que este o traga: um
     * total enviado que contradissesse a venda emitiria uma factura por valor
     * diferente do que foi cobrado.
     */
    const total = venda
      ? Number(venda.total)
      : // A factura global vale a soma das operações que cobre — nunca um número
        // enviado do lado de fora, que podia não bater com nenhuma delas.
        definicao.exigeVendas
        ? Math.round(vendasCobertas.reduce((soma, v) => soma + Number(v.total), 0) * 100) / 100
        : data.total

    if (total === undefined || total === null) {
      throw new ValorDoDocumentoEmFaltaException()
    }

    /*
     * REGRA 4 — não se credita mais do que resta do documento de origem.
     *
     * Somadas as notas de crédito anteriores: creditar 2.000 e depois 19.000 sobre
     * uma factura de 20.000 é o mesmo excesso que creditar 21.000 de uma vez.
     * Creditar a mais é devolver imposto que nunca chegou a ser liquidado.
     *
     * Só a nota de CRÉDITO: uma nota de débito acrescenta ao que foi facturado
     * (juros, encargos), e não há tecto para isso que se possa derivar da origem.
     */
    if (origem && data.tipo === 'Nota de Crédito') {
      const creditadas = await Factura.query({ client: trxExterna })
        .where('documento_origem_id', origem.id)
        .where('tipo', 'Nota de Crédito')
        .whereNot('status', 'anulada')
        .whereNull('deleted_at')
        .sum('total as somado')

      const jaCreditado = Number((creditadas[0] as any)?.$extras?.somado ?? 0)
      // Duas casas: os totais são DECIMAL(22,2) e comparar em vírgula flutuante
      // recusaria um crédito do valor exacto por um milionésimo.
      const resta = Math.round((Number(origem.total) - jaCreditado) * 100) / 100

      if (Math.round(total * 100) / 100 > resta) {
        throw new ValorExcedeOrigemException()
      }
    }

    /*
     * 5. Quem é o adquirente.
     *
     * Da venda, se houver; senão do documento de origem, que já o traz copiado —
     * um recibo é do mesmo cliente que a factura que liquida, e obrigar a repeti-lo
     * seria pedir duas vezes o que já se sabe (e deixar as duas versões divergirem).
     */
    /*
     * ── O que se DERIVA ganha sempre ao que vem no pedido ────────────────────
     *
     * A precedência é esta, e a ordem é o que impede um documento de nomear a
     * pessoa errada:
     *
     *   1. a VENDA, quando existe — é a operação real
     *   2. o documento de ORIGEM, que já traz o adquirente copiado
     *   3. só então o que vier no pedido
     *
     * O pedido é o ÚLTIMO recurso, e tem de ser. Uma nota de crédito que aceitasse
     * um nome enviado por cima do da factura que rectifica estaria a creditar a
     * dívida de outra pessoa; um recibo, a dar quitação a quem não pagou. E numa
     * venda, aceitar um nome do pedido emitiria uma factura a alguém que não
     * comprou nada.
     *
     * Os campos existem para o caso oposto — os documentos que nascem sozinhos, e
     * sobretudo a AUTOFACTURAÇÃO: emitida pelo adquirente em nome do fornecedor,
     * sem venda e sem origem de onde derivar fosse o que fosse. Sem eles saía um
     * documento que não dizia em nome de quem foi emitido, que é a única coisa que
     * o define — era emitível e inútil.
     *
     * A MORADA é a excepção e vale a pena dizer porquê: o art.º 10.º manda constar
     * a sede do adquirente, e ela pode ser conhecida de quem emite sem estar
     * gravada no cliente nem na origem. Aceitar a do pedido não permite nomear
     * outra pessoa — só completa a que já foi nomeada.
     */
    let clienteNome: string | null = origem?.cliente_nome ?? data.cliente_nome ?? null
    let clienteNif: string | null = origem?.cliente_nif ?? data.cliente_nif ?? null
    let clienteMorada: string | null = data.cliente_morada ?? origem?.cliente_morada ?? null

    if (venda?.cliente_presencial_id) {
      const cliente = await Cliente.query({ client: trxExterna })
        .where('id', venda.cliente_presencial_id)
        .first()
      clienteNome = cliente?.nome ?? null
      clienteNif = cliente?.nif ?? null
      clienteMorada = data.cliente_morada ?? cliente?.endereco ?? null
    }

    const agora = DateTime.now()
    const ano = agora.year
    const serie = data.serie ?? serieDefault(data.tipo, ano)

    /*
     * 5b. A data de vencimento — o que torna este documento uma conta a receber.
     *
     * Só entra nos tipos que a aceitam. Nos que a proíbem é DESCARTADA em silêncio
     * e não recusada: quem chama o repositório directamente (o fecho da venda, um
     * comando) monta o payload a partir de um molde comum, e obrigá-lo a limpar o
     * campo consoante o tipo espalharia por cada chamador uma regra que vive na
     * tabela de tipos. Pelo caminho HTTP a recusa acontece antes, no validator,
     * onde há uma mensagem por campo para quem a enviou por engano.
     */
    const dataVencimento =
      data.data_vencimento && aceitaVencimento(data.tipo)
        ? DateTime.fromJSDate(data.data_vencimento)
        : null

    /*
     * Data, hora e local da operação (art.º 10.º). Por omissão são os da emissão —
     * verdade numa venda de balcão. O local por omissão é o da empresa, que é onde
     * a operação de facto ocorreu; indicar outro é para quem factura fora da sede.
     */
    const dataOperacao = data.data_operacao ? DateTime.fromJSDate(data.data_operacao) : agora
    const localOperacao = data.local_operacao ?? empresa.localizacao ?? null

    /*
     * A gravação, na transacção do chamador quando ele tiver uma.
     *
     * `db.transaction()` do Lucid aninha-se por SAVEPOINT quando lhe passamos um
     * cliente já em transacção, o que aqui não serve de nada e acrescenta um ponto
     * de falha. Sem `trxExterna` abre a sua própria, como sempre fez.
     */
    const gravar = async (trx: TransactionClientContract) => {
      const proximoNumero = await proximoNumeroPorSerie(trx, empresa.id, Factura, { serie, ano })

      const emitida = await Factura.create(
        {
          empresa_id: empresa.id,
          venda_id: venda?.id ?? null,
          emitido_por_user_id: data.emitido_por_user_id ?? null,
          documento_origem_id: origem?.id ?? null,
          numero: proximoNumero,
          serie,
          ano,
          tipo: data.tipo,
          status: 'emitida',
          cliente_nome: clienteNome,
          cliente_nif: clienteNif,
          cliente_morada: clienteMorada,
          total,
          data_emissao: agora,
          data_operacao: dataOperacao,
          local_operacao: localOperacao,
          data_vencimento: dataVencimento,
          periodo_inicio: periodoInicio,
          periodo_fim: periodoFim,
          observacoes: data.observacoes ?? null,
        },
        { client: trx }
      )

      /*
       * As vendas cobertas, na MESMA transacção.
       *
       * Uma factura global gravada sem as suas ligações é um documento fiscal que
       * diz cobrir um período e não sabe dizer o quê — e as vendas ficariam livres
       * para serem facturadas outra vez.
       */
      if (vendasCobertas.length > 0) {
        await FacturaVenda.createMany(
          vendasCobertas.map((v) => ({ factura_id: emitida.id, venda_id: v.id })),
          { client: trx }
        )
      }

      return emitida
    }

    const criada = trxExterna ? await gravar(trxExterna) : await db.transaction(gravar)

    /*
     * Relido pelo mesmo caminho que o `GET` usa.
     *
     * `Factura.create()` devolve o model tal como foi escrito — sem os campos que
     * `baseQuery()` acrescenta por join (a empresa, e o vendedor resolvido por
     * vendas→caixa→user). Sem esta releitura, o mesmo documento tinha DUAS formas
     * conforme o verbo: o `POST` sem vendedor, o `GET` com. Apanhado a exercitar o
     * fluxo por HTTP, onde a resposta da emissão vinha com `vendedor_nome` vazio.
     *
     * A releitura corre DENTRO da transacção do chamador quando há uma — de fora
     * dela a linha ainda não é visível, e o que voltava era um 404 no meio de um
     * fecho de venda que tinha corrido bem.
     */
    const releitura = this.baseQuery()
      .where('empresa.company_alias', data.company_alias)
      .where('factura.id', criada.id)

    if (trxExterna) releitura.useTransaction(trxExterna)

    return releitura.firstOrFail()
  }

  /* ── Contas a receber ────────────────────────────────────────────────────── */

  /**
   * O que a empresa tem por receber — o ponto 5 do pedido.
   *
   * ── O que este método é, e o que não é ───────────────────────────────────────
   *
   * Até aqui a resposta a esta pergunta era um zero literal:
   * `relatorios_repository.dashboardExecutivo()` devolvia `valor_por_receber_mes: 0`
   * com um comentário a explicar que não havia venda a crédito neste projecto.
   * Havia razão para o comentário — o fecho da venda exigia o dinheiro todo — e
   * deixou de haver.
   *
   * Devolve as facturas em dívida (a lista, para se poder confirmar cada uma) mais
   * os totais e a antiguidade (o que se lê de relance). O valor devido de cada
   * documento **não é o `total`**: as notas de crédito e de débito emitidas sobre
   * ele entram na conta, e cobrar o valor original de uma factura já creditada é
   * reclamar dinheiro que a própria empresa reconheceu não lhe ser devido.
   */
  async contasAReceber(data: { company_alias: string; page?: number; limit?: number }) {
    const hoje = DateTime.now().startOf('day')

    /*
     * `valor_em_divida` e `dias_em_atraso` saem da própria query, e não de um ciclo
     * em JavaScript sobre a página: os totais abaixo têm de ser da DÍVIDA INTEIRA,
     * não da página que se está a mostrar, e as duas contas têm de usar exactamente
     * a mesma expressão. Somar em memória o que a página trouxe daria um total que
     * muda quando se muda de página.
     */
    const SQL_VALOR_EM_DIVIDA = `
      factura.total
        + COALESCE((SELECT SUM(nd.total) FROM factura AS nd
                     WHERE nd.documento_origem_id = factura.id
                       AND nd.tipo = 'Nota de Débito'
                       AND nd.status <> 'anulada' AND nd.deleted_at IS NULL), 0)
        - COALESCE((SELECT SUM(nc.total) FROM factura AS nc
                     WHERE nc.documento_origem_id = factura.id
                       AND nc.tipo = 'Nota de Crédito'
                       AND nc.status <> 'anulada' AND nc.deleted_at IS NULL), 0)`

    const emDivida = () =>
      this.baseQuery()
        .where('empresa.company_alias', data.company_alias)
        .whereNull('factura.deleted_at')
        .whereNot('factura.status', 'anulada')
        .whereNotNull('factura.data_vencimento')
        .whereNot((sub) => sub.whereRaw(SQL_TEM_RECIBO))

    const paginator = await emDivida()
      .select(
        db.raw(`${SQL_VALOR_EM_DIVIDA} AS valor_em_divida`),
        db.raw(`GREATEST(DATEDIFF(?, factura.data_vencimento), 0) AS dias_em_atraso`, [
          hoje.toSQLDate()!,
        ])
      )
      /*
       * A mais antiga primeiro. Um mapa de cobranças ordenado por data de emissão
       * enterra no fim a dívida que está há mais tempo por cobrar, que é
       * exactamente a que alguém tem de ver primeiro.
       */
      .orderBy('factura.data_vencimento', 'asc')
      .paginate(data.page ?? 1, data.limit ?? 20)

    for (const factura of paginator.all()) {
      /*
       * Os dois campos calculados chegam em `$extras` e o `serializeExtras` do
       * model já os deixa passar — mas o `dias_em_atraso` do MySQL vem como string
       * num `DATEDIFF`, e um ecrã que o compare com um número acaba a ordenar
       * «10» antes de «9».
       */
      factura.$extras.valor_em_divida = Number(factura.$extras.valor_em_divida ?? 0)
      factura.$extras.dias_em_atraso = Number(factura.$extras.dias_em_atraso ?? 0)
    }

    /*
     * Os totais, sobre a dívida inteira. `vencido` é o que já passou do prazo;
     * `a_vencer` é o que ainda está dentro dele — e são coisas diferentes para
     * quem gere tesouraria: uma é dinheiro em risco, a outra é dinheiro esperado.
     */
    const [resumo] = (await emDivida()
      .clearSelect()
      .clearOrder()
      .select(
        db.raw(`COUNT(*) AS documentos`),
        db.raw(`COALESCE(SUM(${SQL_VALOR_EM_DIVIDA}), 0) AS total`),
        db.raw(
          `COALESCE(SUM(CASE WHEN factura.data_vencimento < ?
                             THEN ${SQL_VALOR_EM_DIVIDA} ELSE 0 END), 0) AS vencido`,
          [hoje.toSQLDate()!]
        )
      )
      .pojo()) as { documentos: number; total: number; vencido: number }[]

    const total = Number(resumo?.total ?? 0)
    const vencido = Number(resumo?.vencido ?? 0)

    return {
      resumo: {
        documentos: Number(resumo?.documentos ?? 0),
        total: Math.round(total * 100) / 100,
        vencido: Math.round(vencido * 100) / 100,
        a_vencer: Math.round((total - vencido) * 100) / 100,
      },
      facturas: paginator,
    }
  }

  /**
   * Confirmar que o dinheiro entrou — e emitir o recibo.
   *
   * ── Porque é que isto emite um documento e não marca um campo ────────────────
   *
   * Porque quem paga tem direito à prova de que pagou. Um estado gravado sem
   * documento seria a empresa a saber que recebeu e o cliente a ficar sem nada — e
   * seria mais um campo a ter de ser mantido em sintonia com os documentos, com o
   * mapa de cobranças a mentir no dia em que um caminho se esquecesse dele.
   *
   * Emitido o recibo, a factura sai do mapa sozinha: `estaEmDivida()` deixa de a
   * dar como devida porque passou a haver um recibo por cima. Nada mais é escrito.
   *
   * ── O valor ─────────────────────────────────────────────────────────────────
   *
   * O que resta, não o total original — as notas de crédito e de débito emitidas
   * entretanto contam. Um recibo pelo total de uma factura já creditada declararia
   * ter recebido mais do que era devido.
   */
  async confirmarRecebimento(data: ConfirmarRecebimentoDTO) {
    const factura = await this.findOrFail({ id: data.id, company_alias: data.company_alias })

    if (!factura.data_vencimento) {
      throw new DocumentoSemDividaException()
    }

    const rectificacoes = await Factura.query()
      .where('documento_origem_id', factura.id)
      .whereIn('tipo', ['Nota de Crédito', 'Nota de Débito'])
      .whereNot('status', 'anulada')
      .whereNull('deleted_at')
      .select('tipo', 'total')

    const ajuste = rectificacoes.reduce(
      (soma, r) => soma + (r.tipo === 'Nota de Débito' ? Number(r.total) : -Number(r.total)),
      0
    )

    const valor = Math.round((Number(factura.total) + ajuste) * 100) / 100

    /*
     * `emitir()` faz o resto das verificações — que a factura não está anulada, que
     * não tem já um recibo — e é deliberado passar por lá em vez de escrever a
     * linha aqui: um segundo caminho de emissão seria um segundo sítio onde a
     * numeração por série pode correr mal.
     */
    return this.emitir({
      company_alias: data.company_alias,
      tipo: 'Recibo',
      documento_origem_id: factura.id,
      total: valor,
      data_operacao: data.data_recebimento,
      emitido_por_user_id: data.emitido_por_user_id ?? null,
      observacoes: data.observacoes,
    })
  }

  /**
   * ── TODOS os documentos de uma mesma operação ────────────────────────────────
   *
   * Uma operação comercial raramente cabe num documento só. Vender a prazo produz
   * uma factura hoje e um recibo quando o dinheiro entra; reembolsar produz uma
   * nota de crédito sobre a factura que a titulou; um adiantamento produz a
   * factura do recebimento e depois o documento da entrega. São dois, três, às
   * vezes quatro papéis que só fazem sentido juntos — e quem os quer (o cliente,
   * o contabilista, a AGT numa inspecção) quer-os todos.
   *
   * Sem isto, o ecrã imprimia UM documento e obrigava a procurar os outros à mão,
   * um a um, sem nada que dissesse quantos eram nem onde estavam.
   *
   * ── Como se acham ────────────────────────────────────────────────────────────
   *
   * Duas ligações, e é preciso seguir as duas:
   *
   *  · `documento_origem_id` — a corrente entre documentos (factura → recibo,
   *    factura → nota de crédito, e a nota de crédito de uma nota de débito).
   *  · `venda_id` — os que nascem da mesma venda sem se apontarem uns aos outros,
   *    como a factura de adiantamento e o documento final da entrega.
   *
   * Anda-se nas duas direcções até o conjunto deixar de crescer: partir só para
   * baixo perderia a factura quando se entra pelo recibo, e partir só para cima
   * perderia o recibo quando se entra pela factura. O limite de voltas é uma
   * salvaguarda contra um ciclo em dados corrompidos — sem ele, um documento que
   * se aponte a si próprio prenderia o pedido para sempre.
   *
   * Os anulados VÊM: fazem parte da história da operação, e um documento anulado
   * que desaparecesse do conjunto deixaria um buraco por explicar na sequência
   * numérica. Quem imprime decide o que faz com eles.
   */
  async documentosDaOperacao(data: ShowFacturaDTO) {
    const inicial = await this.findOrFail(data)

    const ids = new Set<string>([inicial.id])
    const vendas = new Set<string>()
    if (inicial.venda_id) vendas.add(inicial.venda_id)

    for (let volta = 0; volta < 10; volta++) {
      const antes = ids.size + vendas.size

      const ligados = await Factura.query()
        .where('empresa_id', inicial.empresa_id)
        .whereNull('deleted_at')
        .where((sub) => {
          // para baixo: quem aponta para um dos que já temos
          sub.whereIn('documento_origem_id', [...ids])
          // para cima: o documento de origem dos que já temos
          sub.orWhereIn('id', [...ids])
          // ao lado: os que nascem da mesma venda
          if (vendas.size > 0) sub.orWhereIn('venda_id', [...vendas])
        })
        .select('id', 'documento_origem_id', 'venda_id')

      for (const l of ligados) {
        ids.add(l.id)
        if (l.documento_origem_id) ids.add(l.documento_origem_id)
        if (l.venda_id) vendas.add(l.venda_id)
      }

      if (ids.size + vendas.size === antes) break
    }

    /*
     * A releitura passa por `baseQuery()` de propósito: os documentos vão ser
     * IMPRESSOS, e o impresso precisa do nome e do NIF da empresa, do vendedor e
     * do posto — que são joins, não colunas de `factura`. Devolver as linhas cruas
     * daria papéis sem cabeçalho.
     *
     * Por emissão, e não por tipo: é a ordem em que a operação aconteceu, e é
     * assim que a sequência se lê (factura, depois o recibo que a liquidou).
     */
    return this.baseQuery()
      .where('empresa.company_alias', data.company_alias)
      .whereIn('factura.id', [...ids])
      .whereNull('factura.deleted_at')
      .orderBy('factura.data_emissao', 'asc')
      .orderBy('factura.numero', 'asc')
  }

  /**
   * As vendas que um documento cobre — hoje, só a factura global.
   *
   * Devolve os ids para quem precise de ir buscar os artigos de cada uma. Uma
   * factura normal devolve a sua própria venda, para o chamador não ter de saber
   * qual dos dois modelos está a olhar.
   */
  async vendasCobertas(data: ShowFacturaDTO): Promise<string[]> {
    const factura = await this.findOrFail(data)

    if (factura.venda_id) return [factura.venda_id]

    const ligacoes = await FacturaVenda.query()
      .where('factura_id', factura.id)
      .select('venda_id')

    return ligacoes.map((l) => l.venda_id)
  }

  /**
   * Anula um documento fiscal — nunca o apaga.
   *
   * O motivo é gravado com a anulação porque é o único momento em que alguém o
   * sabe. Sem ele, o documento fica impossível de comunicar à AGT: o
   * `documentCancelReason` é obrigatório quando `documentStatus = 'A'`, e o
   * mapeamento recusa-se a montar o envelope sem ele. Os dois valores admissíveis
   * são os dos n.ºs 8 e 9 do art.º 8.º do Decreto Presidencial 71/25.
   */
  async anular(data: AnularFacturaDTO) {
    const factura = await this.findOrFail(data)
    if (factura.status === 'anulada') {
      throw new FacturaJaAnuladaException()
    }

    /*
     * REGRA 6 — um documento com dependentes não se anula.
     *
     * Anular uma factura que já tem recibo ou nota de crédito deixaria esses
     * documentos a apontar para algo que já não produz efeitos — e eles
     * continuariam válidos, a liquidar e a rectificar um documento que deixou de
     * existir para efeitos fiscais. Anula-se de fora para dentro.
     *
     * Os já anulados não contam: se o recibo foi anulado, a factura volta a poder
     * sê-lo.
     */
    const dependente = await Factura.query()
      .where('documento_origem_id', factura.id)
      .whereNot('status', 'anulada')
      .whereNull('deleted_at')
      .first()

    if (dependente) {
      throw new DocumentoComDependentesException()
    }

    factura.status = 'anulada'
    factura.motivo_anulacao = data.motivo_anulacao
    await factura.save()
    return factura
  }
}
