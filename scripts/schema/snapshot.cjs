/**
 * Fotografia canónica do schema MySQL, para comparar "antes" e "depois".
 *
 * Não usa `mysqldump`: o binário não existe em todas as máquinas da equipa e a
 * sua saída traz ruído que muda entre execuções sem o schema ter mudado
 * (AUTO_INCREMENT corrente, ordem de índices, comentários de versão). Isto lê
 * o `information_schema` e escreve um texto ordenado deterministicamente — duas
 * fotografias do mesmo schema dão ficheiros byte a byte iguais, e um `diff`
 * mostra exactamente a coluna/índice/FK que mudou.
 *
 * Uso:
 *   node scripts/schema/snapshot.cjs --env .env --out baseline.txt
 *   node scripts/schema/snapshot.cjs --host h --port 3306 --user u --password p --database d --out x.txt
 */
const fs = require('node:fs')
const path = require('node:path')
const mysql = require('mysql2/promise')

function lerArgs(argv) {
  const args = {}
  for (let i = 2; i < argv.length; i++) {
    if (argv[i].startsWith('--')) args[argv[i].slice(2)] = argv[i + 1]
  }
  return args
}

function lerEnv(ficheiro) {
  if (!fs.existsSync(ficheiro)) return {}
  const out = {}
  for (const linha of fs.readFileSync(ficheiro, 'utf8').split(/\r?\n/)) {
    const t = linha.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i < 0) continue
    let v = t.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    out[t.slice(0, i).trim()] = v
  }
  return out
}

// Tabelas que guardam o ESTADO da máquina, não a sua forma. Comparar o schema
// destas é legítimo; comparar o seu conteúdo entre ambientes nunca o é, e é fácil
// alguém confundir as duas coisas ao ler o ficheiro. Ficam assinaladas.
const TABELAS_DE_ESTADO = new Set(['adonis_schema', 'adonis_schema_versions'])

async function main() {
  const args = lerArgs(process.argv)
  const env = lerEnv(args.env || '.env')
  const cfg = {
    host: args.host || env.DB_HOST || '127.0.0.1',
    port: Number(args.port || env.DB_PORT || 3306),
    user: args.user || env.DB_USER,
    password: args.password !== undefined ? args.password : env.DB_PASSWORD,
    database: args.database || env.DB_DATABASE,
  }

  const c = await mysql.createConnection(cfg)
  const q = async (sql, p) => (await c.query(sql, p))[0]
  const db = cfg.database
  const L = []

  const [{ v: versao }] = await q('SELECT VERSION() v')
  L.push(`# schema snapshot`)
  L.push(`# database: ${db}`)
  L.push(`# mysql: ${versao}`)
  L.push(``)

  const tabelas = await q(
    `SELECT TABLE_NAME, ENGINE, TABLE_COLLATION FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME`, [db]
  )

  const colunas = await q(
    `SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA,
            CHARACTER_SET_NAME, COLLATION_NAME, GENERATION_EXPRESSION
     FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ?
     ORDER BY TABLE_NAME, COLUMN_NAME`, [db]
  )

  const indices = await q(
    `SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, INDEX_TYPE,
            GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR ',') AS COLS
     FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ?
     GROUP BY TABLE_NAME, INDEX_NAME, NON_UNIQUE, INDEX_TYPE
     ORDER BY TABLE_NAME, INDEX_NAME`, [db]
  )

  // O nome da FK é irrelevante para o comportamento e é gerado pelo motor; o que
  // importa é (colunas locais) -> (tabela/colunas alvo) + as regras de apagar e
  // actualizar. Comparar por nome faria uma reorganização inofensiva parecer uma
  // alteração de schema.
  const fks = await q(
    `SELECT k.TABLE_NAME, k.CONSTRAINT_NAME, r.UPDATE_RULE, r.DELETE_RULE,
            k.REFERENCED_TABLE_NAME,
            GROUP_CONCAT(k.COLUMN_NAME ORDER BY k.ORDINAL_POSITION SEPARATOR ',') AS COLS,
            GROUP_CONCAT(k.REFERENCED_COLUMN_NAME ORDER BY k.ORDINAL_POSITION SEPARATOR ',') AS REF_COLS
     FROM information_schema.KEY_COLUMN_USAGE k
     JOIN information_schema.REFERENTIAL_CONSTRAINTS r
       ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME
     WHERE k.CONSTRAINT_SCHEMA = ? AND k.REFERENCED_TABLE_NAME IS NOT NULL
     GROUP BY k.TABLE_NAME, k.CONSTRAINT_NAME, r.UPDATE_RULE, r.DELETE_RULE, k.REFERENCED_TABLE_NAME
     ORDER BY k.TABLE_NAME, COLS, k.REFERENCED_TABLE_NAME`, [db]
  )

  const checks = await q(
    `SELECT tc.TABLE_NAME, cc.CONSTRAINT_NAME, cc.CHECK_CLAUSE
     FROM information_schema.CHECK_CONSTRAINTS cc
     JOIN information_schema.TABLE_CONSTRAINTS tc
       ON tc.CONSTRAINT_SCHEMA = cc.CONSTRAINT_SCHEMA AND tc.CONSTRAINT_NAME = cc.CONSTRAINT_NAME
     WHERE cc.CONSTRAINT_SCHEMA = ? ORDER BY tc.TABLE_NAME, cc.CHECK_CLAUSE`, [db]
  ).catch(() => [])

  const triggers = await q(
    `SELECT EVENT_OBJECT_TABLE, TRIGGER_NAME, ACTION_TIMING, EVENT_MANIPULATION, ACTION_STATEMENT
     FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = ?
     ORDER BY EVENT_OBJECT_TABLE, ACTION_TIMING, EVENT_MANIPULATION, TRIGGER_NAME`, [db]
  ).catch(() => [])

  const porTabela = (linhas, campo = 'TABLE_NAME') => {
    const m = new Map()
    for (const l of linhas) {
      if (!m.has(l[campo])) m.set(l[campo], [])
      m.get(l[campo]).push(l)
    }
    return m
  }

  const cols = porTabela(colunas), idx = porTabela(indices)
  const fk = porTabela(fks), ck = porTabela(checks), tg = porTabela(triggers, 'EVENT_OBJECT_TABLE')

  for (const t of tabelas) {
    const n = t.TABLE_NAME
    L.push(`TABLE ${n}${TABELAS_DE_ESTADO.has(n) ? '   [estado do migrador — o conteudo difere entre ambientes por desenho]' : ''}`)
    L.push(`  engine=${t.ENGINE} collation=${t.TABLE_COLLATION}`)
    for (const c2 of cols.get(n) || []) {
      const g = c2.GENERATION_EXPRESSION ? ` generated=${c2.GENERATION_EXPRESSION}` : ''
      L.push(`  COLUMN ${c2.COLUMN_NAME} type=${c2.COLUMN_TYPE} null=${c2.IS_NULLABLE} default=${c2.COLUMN_DEFAULT === null ? 'NULL' : c2.COLUMN_DEFAULT} extra=${c2.EXTRA || '-'} charset=${c2.CHARACTER_SET_NAME || '-'} collation=${c2.COLLATION_NAME || '-'}${g}`)
    }
    for (const i of idx.get(n) || []) {
      L.push(`  INDEX ${i.INDEX_NAME} unique=${i.NON_UNIQUE === 0 ? 'yes' : 'no'} type=${i.INDEX_TYPE} cols=(${i.COLS})`)
    }
    for (const f of fk.get(n) || []) {
      L.push(`  FOREIGN KEY (${f.COLS}) -> ${f.REFERENCED_TABLE_NAME}(${f.REF_COLS}) on_delete=${f.DELETE_RULE} on_update=${f.UPDATE_RULE}`)
    }
    for (const k of ck.get(n) || []) L.push(`  CHECK ${k.CHECK_CLAUSE}`)
    for (const g of tg.get(n) || []) {
      L.push(`  TRIGGER ${g.ACTION_TIMING} ${g.EVENT_MANIPULATION} :: ${String(g.ACTION_STATEMENT).replace(/\s+/g, ' ').trim()}`)
    }
    L.push(``)
  }

  L.push(`# resumo: ${tabelas.length} tabelas, ${colunas.length} colunas, ${indices.length} indices, ${fks.length} chaves estrangeiras, ${triggers.length} gatilhos`)

  const out = args.out || 'schema-snapshot.txt'
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true })
  fs.writeFileSync(out, L.join('\n') + '\n', 'utf8')
  console.log(`escrito: ${out}  (${tabelas.length} tabelas, ${colunas.length} colunas, ${indices.length} indices, ${fks.length} FKs, ${triggers.length} gatilhos)`)
  await c.end()
}

main().catch((e) => { console.error('FALHOU:', e.message); process.exit(1) })
