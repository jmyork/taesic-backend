import { BaseSchema } from '@adonisjs/lucid/schema'

import { temTabela } from '../helpers/esquema.js'

/**
 * Que utilizador pode entrar no backoffice, e a partir de que endereço.
 *
 * ── O problema ────────────────────────────────────────────────────────────────
 *
 * O backoffice é *cross-tenant*: vê a receita da plataforma, o registo de
 * auditoria de todas as empresas, e suspende inquilinos. Está num domínio
 * público (`admin.taesic.bknkv.com`), portanto quem tiver credenciais entra de
 * qualquer ponto do mundo. Credenciais roubadas — reutilizadas, apanhadas num
 * *phishing*, tiradas de um portátil — bastam.
 *
 * Esta tabela acrescenta um segundo factor que não depende do que o utilizador
 * sabe nem do que carrega no bolso: **de onde vem**.
 *
 * ── Confiança no primeiro uso ─────────────────────────────────────────────────
 *
 * A tabela nasce vazia, e com ela vazia o filtro está DESLIGADO. Tem de ser: a
 * primeira conta cria-se em `/instalacao`, e se o filtro já estivesse activo não
 * haveria endereço autorizado nenhum a partir do qual instalar.
 *
 * No instante em que essa primeira conta é criada, o endereço que a criou é
 * registado aqui — e o portão fecha-se. A partir daí, cada endereço novo é
 * autorizado por alguém já autenticado com papel de escopo `plataforma`.
 *
 * O que guarda a janela entre o arranque e a instalação continua a ser o
 * `PLATFORM_SETUP_TOKEN`, não esta tabela. Ver
 * `taesic-backoffice-api/app/repositories/instalacao_repository.ts`.
 *
 * ── Porquê aqui, e não no taesic-backoffice-api ───────────────────────────────
 *
 * Regra 7.18: o esquema tem um dono único, e é este projecto. O
 * `taesic-backoffice-api` partilha a base de dados, tem o model e o repositório
 * desta tabela, e não tem migrações nenhumas — nem sequer os comandos de
 * migração do Lucid registados. Uma coluna nova pede-se aqui.
 *
 * ── O que esta tabela NÃO protege ─────────────────────────────────────────────
 *
 * Nada disto vale se o Caddy deixar de ver o endereço real do visitante. Com o
 * proxy do Cloudflare ligado (nuvem laranja) em `admin.*`, todos os pedidos
 * chegam com endereços do Cloudflare, e o filtro passa a autorizar o mundo
 * inteiro — silenciosamente, sem erro nenhum. Por isso `admin.*` fica em
 * **DNS only**, e o `Caddyfile` não declara `trusted_proxies`.
 *
 * O caminho do endereço, hoje:
 *
 *     browser → Caddy (vê o IP real, descarta o X-Forwarded-For do cliente)
 *             → Next  (reencaminha o cabeçalho tal e qual)
 *             → Adonis (trustProxy: 'loopback', logo respeita-o)
 */
export default class extends BaseSchema {
  protected tableName = 'backoffice_ip_permitido'

  /** Re-executável, como todas as outras — ver database/helpers/esquema.ts. */
  async up() {
    this.defer(async (db) => {
      if (!(await temTabela(db, this.tableName))) {
        await db.schema.createTable(this.tableName, (table) => {
          table.uuid('id').notNullable()
          table.timestamp('created_at').notNullable().defaultTo(this.now())
          table.timestamp('updated_at').notNullable().defaultTo(this.now())

          /**
           * Revogação. Soft delete como no resto do esquema — uma autorização
           * retirada tem de continuar legível no histórico, porque a pergunta
           * "quem é que deixou entrar este endereço, e quando é que isso acabou"
           * é exactamente o tipo de pergunta que se faz depois de um incidente.
           */
          table.timestamp('deleted_at').nullable()

          table.uuid('user_id').notNullable()

          /**
           * O endereço, exacto.
           *
           * 45 caracteres: é o comprimento máximo de um IPv6 na forma textual
           * mais longa (`::ffff:255.255.255.255` mapeado, ou 8 grupos de 4 com
           * separadores e um sufixo de zona).
           *
           * Guardado NORMALIZADO — minúsculas, IPv6 na forma comprimida, e o
           * `::ffff:` de um IPv4 mapeado já retirado. Sem isso, `::FFFF:1.2.3.4`
           * e `1.2.3.4` seriam duas linhas para o mesmo sítio, e a comparação
           * falharia consoante o browser negociasse IPv4 ou IPv6. Quem normaliza
           * é `normalizarIp()` no taesic-backoffice-api.
           */
          table.string('ip', 45).notNullable()

          /** "Escritório", "casa do José", "VPN". Para quem lê a lista meses depois. */
          table.string('descricao', 255).nullable()

          /**
           * Quem autorizou. Nulo na linha que a instalação cria — nessa altura
           * ainda não existe ninguém que pudesse ter autorizado, e é esse o
           * ponto da confiança no primeiro uso.
           */
          table.uuid('criado_por_user_id').nullable()

          /**
           * Validade opcional. Existe para o caso concreto de um acesso
           * temporário — um consultor, uma viagem — poder ser dado sem depender
           * de alguém se lembrar de o retirar. Nulo = sem prazo.
           */
          table.timestamp('expira_em').nullable()

          /** Só para diagnóstico: "porque é que isto deixou de funcionar ontem?" */
          table.timestamp('ultimo_acesso_em').nullable()

          table.primary(['id'])

          /**
           * Um par (utilizador, endereço) só existe uma vez. Reautorizar um
           * endereço revogado é levantar o `deleted_at` da linha que já lá está,
           * não criar uma segunda — assim o histórico fica numa linha só e a
           * lista não enche de duplicados.
           */
          table.unique(['user_id', 'ip'], {
            indexName: 'backoffice_ip_permitido_user_id_ip_unique',
          })

          /**
           * O índice que o portão pré-autenticação usa: "este endereço está
           * autorizado para ALGUÉM?". Sem ele, essa pergunta — feita em cada
           * navegação — varria a tabela toda.
           */
          table.index(['ip'], 'backoffice_ip_permitido_ip_index')
          table.index(['deleted_at'], 'backoffice_ip_permitido_deleted_at_index')

          table
            .foreign(['user_id'], 'backoffice_ip_permitido_user_id_foreign')
            .references(['id'])
            .inTable('user')
            .onDelete('CASCADE')
            .onUpdate('NO ACTION')

          /**
           * `SET NULL` e não `CASCADE`: apagar quem autorizou não pode apagar a
           * autorização — isso trancava fora as pessoas erradas, e no pior
           * momento possível.
           */
          table
            .foreign(['criado_por_user_id'], 'backoffice_ip_permitido_criado_por_foreign')
            .references(['id'])
            .inTable('user')
            .onDelete('SET NULL')
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
