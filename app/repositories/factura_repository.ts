import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import Factura from '#models/faturacao/factura'
import Vendas from '#models/faturacao/vendas'
import FacturaVenda from '#models/faturacao/factura_venda'
import Cliente from '#models/cliente'
import Empresa from '#models/empresa'
import { proximoNumeroPorSerie } from '../helpers/sequencial_numero.js'
import { definicaoDe, serieDefault } from '../helpers/tipos_de_documento.js'
import {
  type EstadoDoDocumento,
  TIPOS_QUE_LIQUIDAM,
  TIPOS_QUE_TITULAM_A_VENDA,
  jaIncluiPagamento,
  liquida,
  podeSerAnulado,
  proximosDocumentos,
  titulaAVenda,
} from '../helpers/regras_de_emissao.js'
import { AnularFacturaDTO, EmitirFacturaDTO, FacturaQueryDTO, ShowFacturaDTO } from '#dtos/factura_dto'
import VendaNaoFechadaException from '#exceptions/venda_nao_fechada_exception'
import VendaObrigatoriaException from '#exceptions/venda_obrigatoria_exception'
import VendaJaFacturadaException from '#exceptions/venda_ja_facturada_exception'
import DocumentoJaPagoException from '#exceptions/documento_ja_pago_exception'
import ValorExcedeOrigemException from '#exceptions/valor_excede_origem_exception'
import DocumentoComDependentesException from '#exceptions/documento_com_dependentes_exception'
import FacturaJaAnuladaException from '#exceptions/factura_ja_anulada_exception'
import ValorDoDocumentoEmFaltaException from '#exceptions/valor_do_documento_em_falta_exception'
import PeriodoDeFacturacaoInvalidoException from '#exceptions/periodo_de_facturacao_invalido_exception'
import DocumentoDeOrigemInvalidoException from '#exceptions/documento_de_origem_invalido_exception'

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
      .select(
        'factura.*',
        'empresa.nome as empresa_nome',
        'empresa.nif as empresa_nif',
        'empresa.localizacao as empresa_localizacao',
        'empresa.contacto as empresa_contacto',
        'user.id as vendedor_id',
        'user.username as vendedor_nome'
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
     * A ordenação passa a ser por série e depois por número.
     *
     * Só por `numero`, com várias séries na mesma listagem, o resultado
     * intercalava a factura 7 com a nota de crédito 7 — dois documentos
     * diferentes com o mesmo número, que é precisamente o que a numeração por
     * tipo torna normal. Ordenar por série primeiro devolve cada livro seguido.
     */
    return query
      .orderBy('factura.ano', 'desc')
      .orderBy('factura.serie', 'asc')
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
      liquidado: dependentes.some((d) => (TIPOS_QUE_LIQUIDAM as readonly string[]).includes(d.tipo)),
      temDependentes: dependentes.length > 0,
    }

    return {
      documento: factura,
      proximos: proximosDocumentos(estado),
      pode_anular: podeSerAnulado(estado),
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
  private async vendaJaTitulada(vendaId: string): Promise<boolean> {
    const porColuna = await Factura.query()
      .where('venda_id', vendaId)
      .whereIn('tipo', [...TIPOS_QUE_TITULAM_A_VENDA])
      .whereNot('status', 'anulada')
      .whereNull('deleted_at')
      .first()

    if (porColuna) return true

    const porGlobal = await FacturaVenda.query()
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
   */
  async emitir(data: EmitirFacturaDTO) {
    const empresa = await Empresa.findByOrFail('company_alias', data.company_alias)
    const definicao = definicaoDe(data.tipo)

    /*
     * 1. A venda, quando o tipo a exige.
     *
     * Os tipos que não a exigem nunca a procuram — um recibo ou uma factura de
     * adiantamento não têm venda nenhuma, e ir buscá-la "se vier" abriria a porta
     * a emitir um recibo agarrado a uma venda por engano.
     */
    let venda: Vendas | null = null

    if (definicao.exigeVenda) {
      /*
       * O validator já exigiu `venda_id` para estes tipos (regra 7.20). Isto é a
       * segunda defesa, para quem chame o repositório directamente: sem ela o
       * `undefined` chega ao `.where()` do Lucid e sai «.where expects value to be
       * defined» — um 500 que não diz que campo falta. Foi assim que este caminho
       * rebentou em `relatorios_repository.spec.ts`.
       */
      if (!data.venda_id) {
        throw new VendaObrigatoriaException()
      }

      venda = await Vendas.query()
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
       * Factura, factura-recibo, factura genérica e talão de venda são alternativas
       * entre si, não cumulativas (art.º 5.º). Sem esta verificação, a mesma
       * operação era declarada às Finanças tantas vezes quantas alguém carregasse
       * no botão — a base de desenvolvimento tinha uma venda de 20.000 Kz com OITO
       * documentos a titulá-la.
       *
       * Os anulados não contam: anular existe precisamente para se poder emitir de
       * novo depois de um erro.
       */
      if (titulaAVenda(data.tipo)) {
        if (await this.vendaJaTitulada(venda.id)) {
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

      origem = await Factura.query()
        .where('id', data.documento_origem_id)
        .where('empresa_id', empresa.id)
        .whereNull('deleted_at')
        .first()

      if (!origem || origem.status === 'anulada') {
        throw new DocumentoDeOrigemInvalidoException()
      }

      /*
       * REGRA 2 e 3 — um recibo só sobre um documento por pagar, e um só.
       *
       * Sobre uma factura-recibo ou um talão de venda nunca faz sentido: esses
       * titulam a operação E o pagamento no mesmo acto. Sobre uma factura que já
       * tem recibo, seria receber o mesmo dinheiro duas vezes no papel.
       */
      if (liquida(data.tipo)) {
        if (jaIncluiPagamento(origem.tipo)) {
          throw new DocumentoJaPagoException()
        }

        const jaLiquidado = await Factura.query()
          .where('documento_origem_id', origem.id)
          .whereIn('tipo', [...TIPOS_QUE_LIQUIDAM])
          .whereNot('status', 'anulada')
          .whereNull('deleted_at')
          .first()

        if (jaLiquidado) {
          throw new DocumentoJaPagoException()
        }
      }

      /*
       * REGRA 5 — o aviso de cobrança reclama uma dívida, portanto não se emite
       * sobre um documento que já foi pago.
       */
      if (data.tipo === 'Aviso de Cobrança' && jaIncluiPagamento(origem.tipo)) {
        throw new DocumentoJaPagoException()
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

      vendasCobertas = await Vendas.query()
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

      const jaTituladas = await Factura.query()
        .whereIn('venda_id', ids)
        .whereIn('tipo', [...TIPOS_QUE_TITULAM_A_VENDA])
        .whereNot('status', 'anulada')
        .whereNull('deleted_at')
        .first()

      const jaEmOutraGlobal = await FacturaVenda.query()
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
      const creditadas = await Factura.query()
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
    let clienteNome: string | null = origem?.cliente_nome ?? null
    let clienteNif: string | null = origem?.cliente_nif ?? null
    let clienteMorada: string | null = data.cliente_morada ?? origem?.cliente_morada ?? null

    if (venda?.cliente_presencial_id) {
      const cliente = await Cliente.find(venda.cliente_presencial_id)
      clienteNome = cliente?.nome ?? null
      clienteNif = cliente?.nif ?? null
      clienteMorada = data.cliente_morada ?? cliente?.endereco ?? null
    }

    const agora = DateTime.now()
    const ano = agora.year
    const serie = data.serie ?? serieDefault(data.tipo, ano)

    /*
     * Data, hora e local da operação (art.º 10.º). Por omissão são os da emissão —
     * verdade numa venda de balcão. O local por omissão é o da empresa, que é onde
     * a operação de facto ocorreu; indicar outro é para quem factura fora da sede.
     */
    const dataOperacao = data.data_operacao ? DateTime.fromJSDate(data.data_operacao) : agora
    const localOperacao = data.local_operacao ?? empresa.localizacao ?? null

    const criada = await db.transaction(async (trx) => {
      const proximoNumero = await proximoNumeroPorSerie(trx, empresa.id, Factura, { serie, ano })

      const emitida = await Factura.create(
        {
          empresa_id: empresa.id,
          venda_id: venda?.id ?? null,
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
    })

    /*
     * Relido pelo mesmo caminho que o `GET` usa.
     *
     * `Factura.create()` devolve o model tal como foi escrito — sem os campos que
     * `baseQuery()` acrescenta por join (a empresa, e o vendedor resolvido por
     * vendas→caixa→user). Sem esta releitura, o mesmo documento tinha DUAS formas
     * conforme o verbo: o `POST` sem vendedor, o `GET` com. Apanhado a exercitar o
     * fluxo por HTTP, onde a resposta da emissão vinha com `vendedor_nome` vazio.
     */
    return this.findOrFail({ id: criada.id, company_alias: data.company_alias })
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
