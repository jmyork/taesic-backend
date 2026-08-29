/**
 * Gera as migrations consolidadas (uma por tabela) a partir de um schema MySQL real.
 *
 * Porquê gerar em vez de escrever à mão: são 55 tabelas, 531 colunas, 210 índices e
 * 82 chaves estrangeiras. Escrever isso à mão é garantir enganos silenciosos — uma
 * coluna que fica `nullable` por distracção não parte nada até ao dia em que parte.
 * Aqui a fonte é o `information_schema` da base que as 125 migrations originais
 * produzem, e o resultado é verificado por `diff` contra essa mesma base.
 *
 * O ficheiro gerado NÃO é intocável: é um ponto de partida legível, em chamadas
 * normais do construtor do Lucid, para ser editado à mão daí em diante como
 * qualquer outra migration.
 *
 * Uso:
 *   node scripts/schema/gerar_migrations.cjs --database reorg_baseline --out /tmp/novas
 */
const fs = require('node:fs')
const path = require('node:path')
const mysql = require('mysql2/promise')

function lerArgs(argv) {
  const a = {}
  for (let i = 2; i < argv.length; i++) if (argv[i].startsWith('--')) a[argv[i].slice(2)] = argv[i + 1]
  return a
}

function lerEnv(f) {
  if (!fs.existsSync(f)) return {}
  const o = {}
  for (const l of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const t = l.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i < 0) continue
    let v = t.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    o[t.slice(0, i).trim()] = v
  }
  return o
}

const aspas = (s) => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'"
const crase = '`'

/**
 * SQL cru para dentro de um template literal do TypeScript.
 *
 * O MySQL devolve os identificadores entre crases (`` `empresa` ``) e a crase é
 * precisamente o que fecha um template literal — sem isto, o ficheiro gerado nem
 * compila. O mesmo vale para `${`, que o TypeScript leria como interpolação.
 */
const sqlParaTemplate = (s) => String(s).replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')

/** Uma coluna do information_schema -> a chamada equivalente do construtor do Lucid. */
function chamadaDeColuna(c, pkCols) {
  const n = aspas(c.COLUMN_NAME)
  const t = c.COLUMN_TYPE
  const auto = (c.EXTRA || '').includes('auto_increment')

  if (auto) {
    // `increments`/`bigIncrements` já implicam unsigned, not null e chave primária.
    const base = t.startsWith('bigint') ? `table.bigIncrements(${n})` : `table.increments(${n})`
    return { linha: base, jaEhPrimaria: pkCols.length === 1 && pkCols[0] === c.COLUMN_NAME }
  }

  let base
  let m
  if (t === 'char(36)') base = `table.uuid(${n})`
  else if ((m = t.match(/^varchar\((\d+)\)$/))) base = `table.string(${n}, ${m[1]})`
  else if (t === 'tinyint(1)') base = `table.boolean(${n})`
  else if ((m = t.match(/^decimal\((\d+),(\d+)\)$/))) base = `table.decimal(${n}, ${m[1]}, ${m[2]})`
  else if (t === 'int') base = `table.integer(${n})`
  else if (t === 'int unsigned') base = `table.integer(${n}).unsigned()`
  else if (t === 'bigint unsigned') base = `table.bigint(${n}).unsigned()`
  else if (t === 'timestamp') base = `table.timestamp(${n})`
  else if (t === 'datetime') base = `table.dateTime(${n})`
  else if (t === 'date') base = `table.date(${n})`
  else if (t === 'longtext') base = `table.text(${n}, 'longtext')`
  else if (t === 'text') base = `table.text(${n})`
  else if (t.startsWith('enum(')) {
    const vals = [...t.slice(5, -1).matchAll(/'((?:[^']|'')*)'/g)].map((x) => aspas(x[1].replace(/''/g, "'")))
    base = `table.enum(${n}, [${vals.join(', ')}])`
  } else base = `table.specificType(${n}, ${aspas(t)})` // porta de escape: nada fica por representar

  base += c.IS_NULLABLE === 'YES' ? '.nullable()' : '.notNullable()'

  if (c.COLUMN_DEFAULT !== null) {
    const d = c.COLUMN_DEFAULT
    if (/^CURRENT_TIMESTAMP/i.test(d)) base += '.defaultTo(this.now())'
    else if (t === 'tinyint(1)') base += `.defaultTo(${d === '1' ? 'true' : 'false'})`
    else if (/^-?\d+(\.\d+)?$/.test(d)) base += `.defaultTo(${d})`
    else base += `.defaultTo(${aspas(d)})`
  }

  return { linha: base, jaEhPrimaria: false }
}

async function main() {
  const args = lerArgs(process.argv)
  const env = lerEnv(args.env || '.env')
  const cfg = {
    host: args.host || env.DB_HOST,
    port: Number(args.port || env.DB_PORT || 3306),
    user: args.user || env.DB_USER,
    password: args.password !== undefined ? args.password : env.DB_PASSWORD,
    database: args.database,
  }
  const destino = args.out || 'database/migrations'
  const db = cfg.database
  const c = await mysql.createConnection(cfg)
  const q = async (s, p) => (await c.query(s, p))[0]

  // `adonis_schema*` são o registo do próprio migrador — nunca migrations.
  const IGNORAR = new Set(['adonis_schema', 'adonis_schema_versions'])

  const tabelas = (
    await q(
      `SELECT TABLE_NAME FROM information_schema.TABLES
       WHERE TABLE_SCHEMA=? AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME`,
      [db]
    )
  )
    .map((r) => r.TABLE_NAME)
    .filter((t) => !IGNORAR.has(t))

  const colunas = await q(
    `SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA, ORDINAL_POSITION
     FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? ORDER BY TABLE_NAME, ORDINAL_POSITION`,
    [db]
  )
  const indices = await q(
    `SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE,
            GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR ',') COLS
     FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=?
     GROUP BY TABLE_NAME, INDEX_NAME, NON_UNIQUE ORDER BY TABLE_NAME, INDEX_NAME`,
    [db]
  )
  const fks = await q(
    `SELECT k.TABLE_NAME, k.CONSTRAINT_NAME, r.UPDATE_RULE, r.DELETE_RULE, k.REFERENCED_TABLE_NAME,
            GROUP_CONCAT(k.COLUMN_NAME ORDER BY k.ORDINAL_POSITION SEPARATOR ',') COLS,
            GROUP_CONCAT(k.REFERENCED_COLUMN_NAME ORDER BY k.ORDINAL_POSITION SEPARATOR ',') REF
     FROM information_schema.KEY_COLUMN_USAGE k
     JOIN information_schema.REFERENTIAL_CONSTRAINTS r
       ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME
     WHERE k.CONSTRAINT_SCHEMA=? AND k.REFERENCED_TABLE_NAME IS NOT NULL
     GROUP BY k.TABLE_NAME,k.CONSTRAINT_NAME,r.UPDATE_RULE,r.DELETE_RULE,k.REFERENCED_TABLE_NAME
     ORDER BY k.TABLE_NAME, k.CONSTRAINT_NAME`,
    [db]
  )
  const checks = await q(
    `SELECT tc.TABLE_NAME, cc.CONSTRAINT_NAME, cc.CHECK_CLAUSE
     FROM information_schema.CHECK_CONSTRAINTS cc
     JOIN information_schema.TABLE_CONSTRAINTS tc
       ON tc.CONSTRAINT_SCHEMA=cc.CONSTRAINT_SCHEMA AND tc.CONSTRAINT_NAME=cc.CONSTRAINT_NAME
     WHERE cc.CONSTRAINT_SCHEMA=? ORDER BY tc.TABLE_NAME`,
    [db]
  ).catch(() => [])
  const triggers = await q(
    `SELECT EVENT_OBJECT_TABLE, TRIGGER_NAME, ACTION_TIMING, EVENT_MANIPULATION, ACTION_STATEMENT
     FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=? ORDER BY EVENT_OBJECT_TABLE, TRIGGER_NAME`,
    [db]
  ).catch(() => [])

  const agrupar = (rs, k = 'TABLE_NAME') => rs.reduce((m, r) => ((m[r[k]] ??= []).push(r), m), {})
  const C = agrupar(colunas)
  const I = agrupar(indices)
  const F = agrupar(fks)
  const K = agrupar(checks)
  const T = agrupar(triggers, 'EVENT_OBJECT_TABLE')

  // ── Ordem topológica ────────────────────────────────────────────────────────
  // Uma migration por tabela só funciona se cada tabela nascer depois daquelas que
  // referencia. Há um ciclo real no schema (`user` <-> `empresa`), que nenhuma ordem
  // resolve: uma das duas arestas tem de ser adiada para depois de as duas tabelas
  // existirem. Era isso que o antigo ficheiro `...622.1_alter_pos` estava a fazer.
  const dep = new Map(tabelas.map((t) => [t, new Set()]))
  for (const f of fks) {
    if (!dep.has(f.TABLE_NAME) || f.REFERENCED_TABLE_NAME === f.TABLE_NAME) continue
    if (dep.has(f.REFERENCED_TABLE_NAME)) dep.get(f.TABLE_NAME).add(f.REFERENCED_TABLE_NAME)
  }
  const ARESTAS_ADIADAS = [{ tabela: 'user', refere: 'empresa' }]
  for (const a of ARESTAS_ADIADAS) dep.get(a.tabela)?.delete(a.refere)
  const adiada = (f) =>
    ARESTAS_ADIADAS.some((a) => a.tabela === f.TABLE_NAME && a.refere === f.REFERENCED_TABLE_NAME)

  const ordem = []
  const visto = new Set()
  const emCurso = new Set()
  const visitar = (t) => {
    if (visto.has(t)) return
    if (emCurso.has(t)) {
      throw new Error(`Ciclo de chaves estrangeiras não resolvido em "${t}". Acrescenta a aresta a ARESTAS_ADIADAS.`)
    }
    emCurso.add(t)
    for (const d of [...(dep.get(t) || [])].sort()) visitar(d)
    emCurso.delete(t)
    visto.add(t)
    ordem.push(t)
  }
  for (const t of tabelas) visitar(t)

  // ── Emissão ─────────────────────────────────────────────────────────────────
  fs.mkdirSync(destino, { recursive: true })
  const BASE = Number(args.base || 1790000000000)
  const PASSO = 10
  let i = 0
  const escritos = []

  for (const t of ordem) {
    const pk = (I[t] || []).find((x) => x.INDEX_NAME === 'PRIMARY')
    const pkCols = pk ? pk.COLS.split(',') : []
    const temCheck = (K[t] || []).length > 0
    const temTrigger = (T[t] || []).length > 0
    const importados = ['temTabela']
    if (temCheck) importados.push('temRestricao')
    if (temTrigger) importados.push('temGatilho')

    const L = []
    L.push(`import { BaseSchema } from '@adonisjs/lucid/schema'`)
    L.push(``)
    L.push(`import { ${importados.join(', ')} } from '../helpers/esquema.js'`)
    L.push(``)
    L.push(`export default class extends BaseSchema {`)
    L.push(`  protected tableName = ${aspas(t)}`)
    L.push(``)
    L.push(`  /**`)
    L.push(`   * Re-executável: cada passo pergunta antes de fazer. Ver`)
    L.push(`   * \`database/helpers/esquema.ts\` para o porquê de isto não ser opcional — o MySQL`)
    L.push(`   * não faz DDL transaccional, portanto uma migração que falhe a meio deixa o`)
    L.push(`   * esquema meio alterado E por registar, e a corrida seguinte bate na mesma`)
    L.push(`   * instrução para sempre.`)
    L.push(`   */`)
    L.push(`  async up() {`)
    L.push(`    this.defer(async (db) => {`)
    L.push(`      if (!(await temTabela(db, this.tableName))) {`)
    L.push(`        await db.schema.createTable(this.tableName, (table) => {`)

    let primariaFeita = false
    for (const col of C[t] || []) {
      const { linha, jaEhPrimaria } = chamadaDeColuna(col, pkCols)
      if (jaEhPrimaria) primariaFeita = true
      L.push(`          ${linha}`)
    }
    if (pkCols.length && !primariaFeita) {
      L.push(`          table.primary([${pkCols.map(aspas).join(', ')}])`)
    }

    // Índices com o NOME explícito. O knex derivaria um nome das colunas, e basta
    // uma ordem diferente para o nome mudar — o que faria um `diff` de schema
    // acusar uma alteração onde não há nenhuma.
    for (const ix of I[t] || []) {
      if (ix.INDEX_NAME === 'PRIMARY') continue
      // O índice que a própria chave estrangeira cria sai com ela, mais abaixo.
      if ((F[t] || []).some((f) => f.CONSTRAINT_NAME === ix.INDEX_NAME)) continue
      const cols = ix.COLS.split(',').map(aspas).join(', ')
      L.push(
        ix.NON_UNIQUE === 0
          ? `          table.unique([${cols}], { indexName: ${aspas(ix.INDEX_NAME)} })`
          : `          table.index([${cols}], ${aspas(ix.INDEX_NAME)})`
      )
    }

    for (const f of F[t] || []) {
      if (adiada(f)) continue
      L.push(`          table`)
      L.push(`            .foreign([${f.COLS.split(',').map(aspas).join(', ')}], ${aspas(f.CONSTRAINT_NAME)})`)
      L.push(`            .references([${f.REF.split(',').map(aspas).join(', ')}])`)
      L.push(`            .inTable(${aspas(f.REFERENCED_TABLE_NAME)})`)
      L.push(`            .onDelete(${aspas(f.DELETE_RULE)})`)
      L.push(`            .onUpdate(${aspas(f.UPDATE_RULE)})`)
    }
    L.push(`        })`)
    L.push(`      }`)

    // CHECK e TRIGGER não têm equivalente no construtor do Lucid — só SQL.
    const id = (nome) => `\\${crase}${nome}\\${crase}` // identificador citado, escapado para o template
    for (const k of K[t] || []) {
      const clausula = sqlParaTemplate(String(k.CHECK_CLAUSE).replace(/\\'/g, "'"))
      L.push(``)
      L.push(`      if (!(await temRestricao(db, this.tableName, ${aspas(k.CONSTRAINT_NAME)}))) {`)
      L.push(`        await db.rawQuery(`)
      L.push(`          \`ALTER TABLE ${id(t)} ADD CONSTRAINT ${id(k.CONSTRAINT_NAME)} CHECK ${clausula}\``)
      L.push(`        )`)
      L.push(`      }`)
    }

    // ── Gatilhos: criados se faltarem, e a falha NÃO pára a migração ──────────
    // Aprendido em `api-qua`: `CREATE TRIGGER` exige `SUPER` (ou
    // `log_bin_trust_function_creators`) quando o binlog está ligado, e o utilizador
    // da aplicação não o tem. Um `CREATE TRIGGER` que rebente aqui bloqueia esta
    // migração e TODAS as seguintes, em todos os deploys — e a aplicação já preenche
    // `chave_escopo` por si (`@beforeSave` em app/models/auth/papel.ts). Ver a
    // secção 7.20.1 do CLAUDE.md.
    for (const g of T[t] || []) {
      const corpo = sqlParaTemplate(String(g.ACTION_STATEMENT).replace(/\s+/g, ' ').trim())
      L.push(``)
      L.push(`      if (!(await temGatilho(db, ${aspas(g.TRIGGER_NAME)}))) {`)
      L.push(`        try {`)
      L.push(`          await db.rawQuery(`)
      L.push(
        `            \`CREATE TRIGGER ${id(g.TRIGGER_NAME)} ${g.ACTION_TIMING} ${g.EVENT_MANIPULATION} ON ${id(t)} FOR EACH ROW ${corpo}\``
      )
      L.push(`          )`)
      L.push(`        } catch (erro: any) {`)
      L.push(`          console.warn(`)
      // `\${` sai como `${` no ficheiro gerado — interpolação a sério. Com uma barra
      // a mais saía escapado, e a migração imprimiria o texto do erro em vez do erro.
      L.push(
        `            \`[migração] não foi possível criar o gatilho ${g.TRIGGER_NAME}: \${erro?.sqlMessage ?? erro?.message}\\n\` +`
      )
      L.push(`              '  A aplicação preenche esta coluna por si, por isso NÃO impede o funcionamento.\\n' +`)
      L.push(`              '  Fica sem cobertura quem escreva na tabela por fora (o taesic-backoffice-api,\\n' +`)
      L.push(`              '  SQL à mão). Para corrigir, conforme o erro acima:\\n' +`)
      L.push(`              '    · "SUPER privilege ... binary logging" (1419) -> log_bin_trust_function_creators = 1\\n' +`)
      L.push(`              '    · "command denied ... TRIGGER" (1142) -> GRANT TRIGGER ao utilizador da BD.\\n' +`)
      L.push(`              '  Depois, voltar a correr esta migração (é idempotente).'`)
      L.push(`          )`)
      L.push(`        }`)
      L.push(`      }`)
    }

    L.push(`    })`)
    L.push(`  }`)
    L.push(``)
    L.push(`  async down() {`)
    L.push(`    this.defer(async (db) => {`)
    L.push(`      if (await temTabela(db, this.tableName)) {`)
    L.push(`        await db.schema.dropTable(this.tableName)`)
    L.push(`      }`)
    L.push(`    })`)
    L.push(`  }`)
    L.push(`}`)
    L.push(``)

    const nome = `${BASE + i * PASSO}_create_${t}_table.ts`
    fs.writeFileSync(path.join(destino, nome), L.join('\n'), 'utf8')
    escritos.push(nome)
    i++
  }

  // A aresta adiada, agora que as duas tabelas existem.
  if (ARESTAS_ADIADAS.length) {
    const L = []
    L.push(`import { BaseSchema } from '@adonisjs/lucid/schema'`)
    L.push(``)
    L.push(`import { temRestricao } from '../helpers/esquema.js'`)
    L.push(``)
    L.push(`/**`)
    L.push(` * A chave estrangeira que fecha o ciclo \`user\` <-> \`empresa\`.`)
    L.push(` *`)
    L.push(` * Um utilizador pertence a uma empresa e uma empresa tem um utilizador dono: as`)
    L.push(` * duas tabelas referem-se uma à outra, e nenhuma ordem de criação satisfaz as`)
    L.push(` * duas restrições ao mesmo tempo. \`user\` nasce com a COLUNA \`empresa_id\` mas sem`)
    L.push(` * a restrição, e é aqui — com as duas tabelas já criadas — que a restrição entra.`)
    L.push(` *`)
    L.push(` * (Era esta a razão de ser do antigo \`1771767984622.1_alter_pos\`, cujo \`.1\` no`)
    L.push(` * nome existia só para o ficheiro caber entre dois já numerados.)`)
    L.push(` */`)
    L.push(`export default class extends BaseSchema {`)
    for (const a of ARESTAS_ADIADAS) {
      const relevantes = fks.filter(
        (f) => f.TABLE_NAME === a.tabela && f.REFERENCED_TABLE_NAME === a.refere
      )
      L.push(`  protected tableName = ${aspas(a.tabela)}`)
      L.push(``)
      L.push(`  /** Re-executável, como todas as outras — ver database/helpers/esquema.ts. */`)
      L.push(`  async up() {`)
      L.push(`    this.defer(async (db) => {`)
      for (const f of relevantes) {
        L.push(`      if (!(await temRestricao(db, this.tableName, ${aspas(f.CONSTRAINT_NAME)}))) {`)
        L.push(`        await db.schema.alterTable(this.tableName, (table) => {`)
        L.push(`          table`)
        L.push(`            .foreign([${f.COLS.split(',').map(aspas).join(', ')}], ${aspas(f.CONSTRAINT_NAME)})`)
        L.push(`            .references([${f.REF.split(',').map(aspas).join(', ')}])`)
        L.push(`            .inTable(${aspas(f.REFERENCED_TABLE_NAME)})`)
        L.push(`            .onDelete(${aspas(f.DELETE_RULE)})`)
        L.push(`            .onUpdate(${aspas(f.UPDATE_RULE)})`)
        L.push(`        })`)
        L.push(`      }`)
      }
      L.push(`    })`)
      L.push(`  }`)
      L.push(``)
      L.push(`  async down() {`)
      L.push(`    this.defer(async (db) => {`)
      for (const f of relevantes) {
        L.push(`      if (await temRestricao(db, this.tableName, ${aspas(f.CONSTRAINT_NAME)})) {`)
        L.push(`        await db.schema.alterTable(this.tableName, (table) => {`)
        L.push(`          table.dropForeign([${f.COLS.split(',').map(aspas).join(', ')}], ${aspas(f.CONSTRAINT_NAME)})`)
        L.push(`        })`)
        L.push(`      }`)
      }
      L.push(`    })`)
      L.push(`  }`)
    }
    L.push(`}`)
    L.push(``)
    const nome = `${BASE + i * PASSO}_alter_user_add_empresa_foreign.ts`
    fs.writeFileSync(path.join(destino, nome), L.join('\n'), 'utf8')
    escritos.push(nome)
  }

  console.log(`geradas ${escritos.length} migrations em ${destino}`)
  console.log(`ordem: ${ordem.slice(0, 5).join(' -> ')} ... ${ordem.slice(-3).join(' -> ')}`)
  await c.end()
}

main().catch((e) => {
  console.error('FALHOU:', e.message)
  process.exit(1)
})
