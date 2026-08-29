/**
 * Extrai o catálogo RBAC (papéis, permissões e a matriz papel->permissões) de
 * `database/seeders/database_seeder.ts` para `app/helpers/rbac_padrao.ts`.
 *
 * Correu-se UMA vez, para a extracção inicial. Fica no repositório porque é a
 * prova de como o ficheiro nasceu — os 316 nomes de permissão e as ~880 ligações
 * não foram copiados à mão, e portanto não há transcrição errada escondida lá
 * dentro. Depois desta extracção, `rbac_padrao.ts` passa a ser a fonte e edita-se
 * à mão como qualquer outro ficheiro; este script não volta a correr.
 *
 * Os comentários dos blocos são levados tal e qual: dizem porque é que cada papel
 * tem o que tem, e essa é a parte que ninguém consegue reconstruir depois.
 */
const fs = require('node:fs')

const ORIGEM = 'database/seeders/database_seeder.ts'

// O destino é obrigatório e o script RECUSA-SE a escrever por cima de um ficheiro
// que já exista. `rbac_padrao.ts` levou depois desta extracção uma função escrita à
// mão (`semearRbacPadrao`), e um `node extrair_rbac.cjs` distraído apagava-a sem
// aviso. Para reconferir a extracção, manda para um ficheiro novo e compara.
const DESTINO = process.argv[2]
if (!DESTINO) {
  console.error('uso: node scripts/schema/extrair_rbac.cjs <ficheiro-de-destino>')
  process.exit(1)
}
if (fs.existsSync(DESTINO)) {
  console.error(`recuso-me a escrever por cima de ${DESTINO}. Escolhe um ficheiro novo e compara.`)
  process.exit(1)
}

const src = fs.readFileSync(ORIGEM, 'utf8')

/**
 * Devolve o texto entre o `[` que se segue a `marcador` e o `]` que o fecha.
 * Conta parênteses rectos para não parar num `]` que esteja dentro de uma string
 * ou de um objecto aninhado.
 */
function blocoDepoisDe(marcador, desde = 0) {
  const i = src.indexOf(marcador, desde)
  if (i < 0) throw new Error(`não encontrei: ${marcador}`)
  const abre = src.indexOf('[', i)
  if (abre < 0) throw new Error(`sem "[" depois de: ${marcador}`)
  let nivel = 0
  let emString = null
  for (let p = abre; p < src.length; p++) {
    const ch = src[p]
    const anterior = src[p - 1]
    if (emString) {
      if (ch === emString && anterior !== '\\') emString = null
      continue
    }
    if (ch === "'" || ch === '"' || ch === '`') { emString = ch; continue }
    if (ch === '[') nivel++
    else if (ch === ']') {
      nivel--
      if (nivel === 0) return { texto: src.slice(abre + 1, p), fim: p }
    }
  }
  throw new Error(`"[" sem fecho depois de: ${marcador}`)
}

// ── Papéis e permissões ──────────────────────────────────────────────────────
const papeis = blocoDepoisDe('await Papel.createMany(')
const permissoes = blocoDepoisDe('await Permissao.createMany(')

// ── A matriz papel -> permissões ─────────────────────────────────────────────
// Só as chamadas com um literal de papel; a de `Platform_Admin` é calculada
// (todas as permissões que não sejam de inquilino) e por isso continua a ser
// código, não dados.
const matriz = []
const re = /await givePermissionsToRole\('([A-Za-z_]+)',\s*\[/g
let m
while ((m = re.exec(src)) !== null) {
  const nome = m[1]
  const bloco = blocoDepoisDe(`await givePermissionsToRole('${nome}',`, m.index)
  // O comentário imediatamente acima da chamada explica o papel — vem junto.
  const antes = src.slice(Math.max(0, m.index - 400), m.index)
  const linhasAntes = antes.split('\n').filter((l) => l.trim().startsWith('//'))
  const comentario = []
  for (let i = linhasAntes.length - 1; i >= 0; i--) {
    if (!linhasAntes[i].trim().startsWith('//')) break
    comentario.unshift(linhasAntes[i].trim())
  }
  matriz.push({ nome, permissoes: bloco.texto, comentario })
  re.lastIndex = bloco.fim
}

const nomesPapeis = [...papeis.texto.matchAll(/nome:\s*'([^']+)'/g)].map((x) => x[1])
const nomesPerms = [...permissoes.texto.matchAll(/nome:\s*'([^']+)'/g)].map((x) => x[1])

console.log(`papéis:      ${nomesPapeis.length}`)
console.log(`permissões:  ${nomesPerms.length}`)
console.log(`matriz:      ${matriz.length} papéis com permissões atribuídas`)
for (const e of matriz) {
  const n = (e.permissoes.match(/'/g) || []).length / 2
  console.log(`   ${e.nome.padEnd(24)} ${n} permissões`)
}

// ── Emissão ──────────────────────────────────────────────────────────────────
const L = []
L.push(`import type { ESCOPO_PAPEL } from '#models/auth/papel'`)
L.push(``)
L.push(`/**`)
L.push(` * O catálogo RBAC por omissão: que papéis existem, que permissões existem, e`)
L.push(` * quais delas cada papel tem.`)
L.push(` *`)
L.push(` * Estava dentro de \`database_seeder.ts\`, e isso tinha um custo concreto: o`)
L.push(` * seeder NÃO é idempotente (\`Users.createMany\` rebenta com emails repetidos),`)
L.push(` * por isso não havia como levar uma permissão nova a uma base que já tem dados.`)
L.push(` * O caminho era \`node ace permissao:conceder\`, um comando de cada vez. Aqui os`)
L.push(` * dados ficam separados do acto de os inserir, e \`semearRbacPadrao()\` pode`)
L.push(` * correr as vezes que forem precisas.`)
L.push(` *`)
L.push(` * Os papéis de inquilino nascem como \`modelo\`: ninguém os usa directamente. Cada`)
L.push(` * empresa recebe a SUA cópia no registo (ver \`clonarPapeisPadrao()\` em`)
L.push(` * papeis_da_empresa.ts), e é a cópia que é atribuída. É isso que permite a uma`)
L.push(` * empresa mudar o seu "Vendedor" sem mudar o de todas as outras — e é também a`)
L.push(` * razão de afinar um modelo aqui só afectar empresas criadas a partir de então.`)
L.push(` * Para as que já existem: \`node ace permissao:conceder <perm> <papel> --todas-empresas\`.`)
L.push(` *`)
L.push(` * Extraído mecanicamente do seeder (scripts/schema/extrair_rbac.cjs) para que`)
L.push(` * nenhum dos ${nomesPerms.length} nomes de permissão dependesse de uma cópia à mão.`)
L.push(` */`)
L.push(``)
L.push(`export interface PapelPadrao {`)
L.push(`  nome: string`)
L.push(`  descricao: string`)
L.push(`  escopo: (typeof ESCOPO_PAPEL)[keyof typeof ESCOPO_PAPEL]`)
L.push(`}`)
L.push(``)
L.push(`export interface PermissaoPadrao {`)
L.push(`  nome: string`)
L.push(`  descricao: string`)
L.push(`}`)
L.push(``)
L.push(`export const PAPEIS_PADRAO: PapelPadrao[] = [`)
L.push(papeis.texto.replace(/^\n+|\n+$/g, ''))
L.push(`]`)
L.push(``)
L.push(`export const PERMISSOES_PADRAO: PermissaoPadrao[] = [`)
L.push(permissoes.texto.replace(/^\n+|\n+$/g, ''))
L.push(`]`)
L.push(``)
L.push(`/**`)
L.push(` * As permissões de cada papel MODELO, pelo nome.`)
L.push(` *`)
L.push(` * \`Platform_Admin\` não está aqui de propósito: as permissões dele são "todas as`)
L.push(` * que não são de inquilino", uma regra e não uma lista, e mantê-la como regra é o`)
L.push(` * que garante que uma permissão de plataforma nova lhe chega sem ninguém se`)
L.push(` * lembrar de a acrescentar em dois sítios. Ver \`semearRbacPadrao()\`.`)
L.push(` */`)
L.push(`export const PERMISSOES_POR_PAPEL: Record<string, string[]> = {`)
for (const e of matriz) {
  for (const c of e.comentario) L.push(`  ${c}`)
  L.push(`  ${e.nome}: [`)
  L.push(e.permissoes.replace(/^\n+|\n+$/g, ''))
  L.push(`  ],`)
  L.push(``)
}
L.push(`}`)
L.push(``)

fs.writeFileSync(DESTINO, L.join('\n'), 'utf8')
console.log(`\nescrito: ${DESTINO}`)
