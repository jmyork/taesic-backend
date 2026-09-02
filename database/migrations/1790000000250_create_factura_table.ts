import { BaseSchema } from '@adonisjs/lucid/schema'

import { temTabela } from '../helpers/esquema.js'
import { TIPOS_DE_DOCUMENTO_VALIDOS } from '../../app/helpers/tipos_de_documento.js'

/**
 * As facturas e demais documentos fiscalmente relevantes.
 *
 * ── O que esta tabela tem de garantir ────────────────────────────────────────
 *
 * O Decreto Presidencial n.º 71/25, de 20 de Março (Regime Jurídico das Facturas
 * e Documentos Equivalentes) governa o que aqui se grava. Três exigências dele
 * moldam o esquema:
 *
 *  - **art.º 10.º** — numeração «sequencial e cronológica por tipo de documento»
 *    e por ano económico, podendo usar-se várias séries desde que identificadas.
 *    Daí `serie` e `ano`, e daí o índice único ser por série (ver abaixo).
 *  - **art.º 10.º** — o documento tem de trazer a data, a HORA e o LOCAL da
 *    operação, a sede do adquirente, e o código hash e a identificação do
 *    software validado.
 *  - **art.º 8.º** — a emissão pode ocorrer até ao quinto dia útil seguinte ao da
 *    operação. É por isso que `data_operacao` existe ao lado de `data_emissao`:
 *    numa venda de balcão coincidem, mas não têm de coincidir, e é a data da
 *    operação que conta para o imposto.
 *
 * ── Os tipos vêm da tabela, e não de uma lista escrita aqui ──────────────────
 *
 * `app/helpers/tipos_de_documento.ts` é a fonte única — dela saem também o tipo
 * TypeScript do model, as regras do validator e o mapeamento para a AGT. Repetir
 * a lista nesta migração era garantir que um dia divergiriam, e a divergência
 * apareceria como um `ER_DATA_TRUNCATED` na emissão, em produção, com o
 * utilizador à espera.
 */
export default class extends BaseSchema {
  protected tableName = 'factura'

  /**
   * Re-executável: cada passo pergunta antes de fazer. Ver
   * `database/helpers/esquema.ts` para o porquê de isto não ser opcional — o MySQL
   * não faz DDL transaccional, portanto uma migração que falhe a meio deixa o
   * esquema meio alterado E por registar, e a corrida seguinte bate na mesma
   * instrução para sempre.
   */
  async up() {
    this.defer(async (db) => {
      if (!(await temTabela(db, this.tableName))) {
        await db.schema.createTable(this.tableName, (table) => {
          table.uuid('id').notNullable()
          table.uuid('empresa_id').notNullable()

          /**
           * Anulável: há documentos que nascem SEM venda.
           *
           * Um recibo, um aviso de cobrança, uma nota de crédito autónoma e uma
           * factura de adiantamento não têm venda nenhuma por trás — e a factura
           * global tem várias, nenhuma delas «a» venda. A chave estrangeira
           * mantém-se: numa coluna anulável, verifica o valor quando ele existe e
           * não verifica nada quando é nulo, que é exactamente o que se quer.
           */
          table.uuid('venda_id').nullable()

          /**
           * ── QUEM EMITIU o documento ──────────────────────────────────────────
           *
           * Não confundir com o vendedor. O vendedor resolve-se por
           * `venda → caixa → user` e só existe nos documentos que nascem de uma
           * venda — pouco mais de um terço dos tipos. Uma nota de crédito, um
           * recibo, um aviso de cobrança e um estorno não têm venda nenhuma por
           * trás, e por isso apareciam com o responsável a traço: documentos que
           * movem dinheiro sem ninguém identificado a assiná-los.
           *
           * Anulável por duas razões legítimas, e não por descuido: os avisos de
           * cobrança emitidos pela varredura diária (`aviso-cobranca:emitir`) não
           * têm utilizador nenhum por trás — nasceram de um prazo que passou —, e
           * os documentos gravados antes desta coluna existir não têm como saber
           * quem os emitiu. Quem lê mostra "Sistema" no primeiro caso.
           *
           * `RESTRICT` na chave: apagar o utilizador que assinou um documento
           * fiscal apagaria a única identificação de quem o emitiu.
           */
          table.uuid('emitido_por_user_id').nullable()

          /**
           * Sequencial DENTRO da série — não por empresa.
           *
           * Sozinho não identifica nada: pode haver uma nota de crédito n.º 14 e
           * uma factura n.º 14 na mesma empresa, no mesmo ano, e ambas correctas.
           * O que identifica um documento é `<código> <série>/<número>`, montado
           * em `referenciaDe()`.
           */
          table.integer('numero').notNullable()

          /**
           * A série de numeração (`FT2026`, `FR2026`, ...) e o ano económico.
           *
           * Anuláveis, e não `NOT NULL`, por causa da regra 7.20: um campo novo tem
           * de ter valor por omissão ou ser opcional, e a obrigatoriedade impõe-se
           * no validator, não na base de dados. Aqui não há valor por omissão
           * possível — a série depende do tipo e do ano da própria linha —, pelo
           * que a alternativa a anulável seria uma coluna obrigatória sem default:
           * exactamente a forma do incidente de `api-qua` que deixou a tabela
           * `papel` só de leitura.
           *
           * Quem as preenche é `factura_repository.emitir()`, sempre, em todos os
           * caminhos. Um nulo aqui é o sinal de que alguma coisa escreveu por um
           * caminho não previsto — visível numa consulta, e não uma paragem.
           */
          table.string('serie', 60).nullable()
          table.smallint('ano').unsigned().nullable()

          table.enum('tipo', TIPOS_DE_DOCUMENTO_VALIDOS).notNullable()
          table.enum('status', ['emitida', 'anulada']).notNullable().defaultTo('emitida')

          /**
           * Porque é que o documento foi anulado.
           *
           * `I` — anulada por incorrecta identificação do adquirente;
           * `N` — anulada por não ter sido enviado o documento ao adquirente.
           *
           * São os dois únicos motivos que os n.ºs 8 e 9 do art.º 8.º do Decreto
           * Presidencial 71/25 admitem, e são os mesmos dois que a AGT aceita em
           * `documentCancelReason` — obrigatório quando, e só quando, o documento
           * vai com `documentStatus = 'A'`.
           *
           * Sem esta coluna, um documento anulado ficava impossível de comunicar:
           * `facturaParaDocumento()` recusava-se a montar o envelope por não ter o
           * motivo, e ninguém o tinha perguntado no momento da anulação. Anular é
           * o único sítio onde essa informação existe.
           *
           * Anulável porque só se preenche ao anular; a obrigatoriedade vive no
           * validator de `anular` (regra 7.20).
           */
          table.enum('motivo_anulacao', ['I', 'N']).nullable()

          /**
           * O documento que este rectifica ou liquida.
           *
           * Obrigatório nas notas de crédito — a AGT recusa-as com E13 sem
           * referência à origem — e é o que permite a um recibo dizer o que está a
           * pagar. Quais os tipos que o exigem está em `exigeOrigem`, na tabela de
           * tipos de documento.
           */
          table.uuid('documento_origem_id').nullable()

          table.string('cliente_nome', 255).nullable()
          table.string('cliente_nif', 255).nullable()

          /** Sede ou domicílio do adquirente (art.º 10.º), copiado no momento. */
          table.string('cliente_morada', 255).nullable()

          table.decimal('total', 22, 2).notNullable()

          table.timestamp('data_emissao').notNullable()

          /** Data, hora e local da OPERAÇÃO (art.º 10.º) — ver o cabeçalho. */
          table.dateTime('data_operacao').nullable()
          table.string('local_operacao', 255).nullable()

          /**
           * A data em que este documento tem de estar pago.
           *
           * ── É a coluna que define uma conta a receber ──────────────────────
           *
           * Até esta coluna existir, o sistema não sabia responder a «o que é que
           * a empresa tem por receber». Não era uma omissão do relatório — era uma
           * omissão do MODELO: uma venda só fechava com o dinheiro todo em cima do
           * balcão, e portanto nunca havia nada por receber.
           * `relatorios_repository.dashboardExecutivo()` devolvia literalmente
           * `valor_por_receber_mes: 0`, com um comentário a explicar porquê.
           *
           * A regra das contas a receber é uma linha, e está escrita em
           * `estaEmDivida()`:
           *
           *     está em dívida  ⇔  tem `data_vencimento`  e  não tem recibo por cima
           *
           * ── Porquê uma data e não um estado «paga/por pagar» ───────────────
           *
           * Um campo de estado teria de ser mantido em sintonia com os documentos
           * que o alteram — o recibo que liquida, a nota de crédito que reduz, a
           * anulação que apaga tudo. O dia em que um desses caminhos se esquecesse
           * de o actualizar, o mapa de cobranças passaria a mentir sem nada a
           * assinalar. A data não se desactualiza: é um facto do momento da
           * emissão, e quem quer saber se ainda há dívida pergunta aos documentos
           * que apontam para esta linha.
           *
           * Anulável, e é o normal: a maior parte dos documentos nasce sem ela —
           * tudo o que é pago no acto, e tudo o que não titula uma dívida. A
           * obrigatoriedade, onde existe, vive no validator (`vencimento: 'exige'`
           * na tabela de tipos), nunca aqui — regra 7.20.
           */
          table.date('data_vencimento').nullable()

          /**
           * Período coberto, para a factura global. O art.º 8.º limita a
           * periodicidade a mensal. Nulo em tudo o resto.
           */
          table.date('periodo_inicio').nullable()
          table.date('periodo_fim').nullable()

          /**
           * Código hash do documento e identificação do software validado
           * (art.º 10.º). Preenchidos por quem assina — ficam nulos enquanto a
           * comunicação à AGT não estiver ligada, e é essa a leitura correcta: um
           * documento sem hash é um documento por comunicar.
           */
          table.string('hash', 255).nullable()
          table.string('software_id', 60).nullable()

          table.text('observacoes').nullable()

          table.timestamp('created_at').notNullable().defaultTo(this.now())
          table.timestamp('updated_at').notNullable().defaultTo(this.now())
          table.timestamp('deleted_at').nullable()

          table.primary(['id'])
          table.index(['deleted_at'], 'factura_deleted_at_index')

          /**
           * O índice das cobranças.
           *
           * Serve as duas perguntas que se fazem a esta tabela todos os dias, e
           * nenhuma delas é «esta linha»: «o que está por receber» (varre tudo o
           * que tem vencimento preenchido) e «o que venceu» (compara com hoje).
           * Sem ele, o comando dos avisos de cobrança faz varredura completa da
           * tabela que mais cresce neste sistema.
           *
           * `empresa_id` primeiro porque toda a leitura é por inquilino.
           */
          table.index(['empresa_id', 'data_vencimento'], 'factura_vencimento_index')

          /**
           * A numeração: única por EMPRESA, SÉRIE, ANO e NÚMERO.
           *
           * ── Sem o `tipo` na chave, e é deliberado ──────────────────────────
           *
           * Pôr lá o tipo pareceria mais apertado e seria mais FROUXO. `Factura` e
           * `Factura Genérica` são dois tipos internos que a AGT comunica ambos
           * como `FT` e que partilham, por isso, a série `FT2026`. Com o tipo na
           * chave, cada um abriria o seu contador e os dois primeiros documentos
           * sairiam ambos como `FT FT2026/1` — o mesmo `documentNo` para dois
           * documentos diferentes, que é precisamente o que a numeração existe
           * para impedir.
           *
           * Uma série serve um tipo de documento só (E37 da AGT), portanto a série
           * já determina o tipo e a coluna não acrescenta nada de legítimo à chave.
           */
          table.unique(['empresa_id', 'serie', 'ano', 'numero'], {
            indexName: 'factura_numeracao_unique',
          })

          table
            .foreign(['empresa_id'], 'factura_empresa_id_foreign')
            .references(['id'])
            .inTable('empresa')
            .onDelete('CASCADE')
            .onUpdate('NO ACTION')
          table
            .foreign(['venda_id'], 'factura_venda_id_foreign')
            .references(['id'])
            .inTable('vendas')
            .onDelete('RESTRICT')
            .onUpdate('NO ACTION')

          /**
           * `RESTRICT` e não `CASCADE`: apagar a factura que uma nota de crédito
           * rectifica deixaria a nota a apontar para lado nenhum, e é essa
           * referência que a torna válida perante a AGT.
           */
          table
            .foreign(['emitido_por_user_id'], 'factura_emitido_por_user_id_foreign')
            .references(['id'])
            .inTable('user')
            .onDelete('RESTRICT')
            .onUpdate('NO ACTION')

          table
            .foreign(['documento_origem_id'], 'factura_documento_origem_id_foreign')
            .references(['id'])
            .inTable('factura')
            .onDelete('RESTRICT')
            .onUpdate('NO ACTION')
        })
      }
    })
  }

  async down() {
    this.defer(async (db) => {
      if (await temTabela(db, this.tableName)) {
        await db.schema.dropTable(this.tableName)
      }
    })
  }
}
