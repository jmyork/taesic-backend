import { test } from '@japa/runner'
import { readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * Todos os ficheiros deste módulo carregam sem rebentar.
 *
 * É a mesma rede que `tests/unit/modules_load.spec.ts` estende ao resto do
 * projecto, e o CLAUDE.md chama-lhe "a rede de segurança mais barata deste
 * projecto" — foi ela que apanhou ~14 repositórios a importar o modelo errado.
 *
 * Aqui apanha uma coisa concreta e recorrente: **um import com a casing errada**.
 * O Windows é case-insensitive e o Linux não, portanto `#models/Empresa` funciona
 * na máquina de quem escreve e rebenta no servidor. Os models deste módulo
 * importam de `#models/`, `#models/faturacao/` — dois sítios com convenções
 * diferentes (secção 6 do CLAUDE.md) — e é exactamente onde esse erro nasce.
 *
 * Carregar os models também obriga o Lucid a resolver as relações, o que
 * significa que uma `@belongsTo` sem `foreignKey` explícito (o outro erro
 * recorrente, 17 relações partidas na secção 7.2) tem aqui a primeira barreira.
 *
 * Continua a ser só um smoke test: prova que carrega, não que faz o que deve.
 * Isso é `cenarios.spec.ts`.
 */

const RAIZ = new URL('../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

/** Tudo o que é `.ts` do módulo, menos o que não é para carregar directamente. */
function ficheirosDoModulo(pasta: string, acumulado: string[] = []): string[] {
  for (const entrada of readdirSync(pasta)) {
    const caminho = join(pasta, entrada)

    if (statSync(caminho).isDirectory()) {
      // As migrações não se carregam à mão — quem as corre é o Lucid, e importá-las
      // fora desse contexto não prova nada de útil.
      if (entrada === 'migrations' || entrada === 'testes') continue
      ficheirosDoModulo(caminho, acumulado)
      continue
    }

    if (!entrada.endsWith('.ts')) continue

    // `executar.ts` é um script: importá-lo corre os cenários e chama
    // `process.exit()`, o que mataria a suite a meio.
    if (entrada === 'executar.ts') continue

    acumulado.push(caminho)
  }

  return acumulado
}

test.group('MINFIN — todos os módulos carregam', () => {
  const ficheiros = ficheirosDoModulo(RAIZ)

  test('há ficheiros para carregar', ({ assert }) => {
    // Sem isto, uma varredura que não encontrasse nada (caminho errado, pasta
    // renomeada) passaria com zero testes e pareceria sucesso.
    assert.isAbove(ficheiros.length, 10, 'a varredura devia encontrar o módulo inteiro')
  })

  for (const ficheiro of ficheiros) {
    test(relative(RAIZ, ficheiro).replace(/\\/g, '/'), async ({ assert }) => {
      const modulo = await import(pathToFileURL(ficheiro).href)

      // `assert.exists` e não `isObject`: o namespace de um módulo ES é um
      // objecto exótico com `Symbol.toStringTag = 'Module'`, e o `isObject` do
      // chai recusa-o. O que este teste prova é que o `import` não rebentou —
      // qualquer asserção mais forte estaria a testar o chai, não o módulo.
      assert.exists(modulo, 'o módulo devia carregar')
    })
  }
})

/**
 * As migrações, à parte.
 *
 * Não se pode CORRER uma migração sem base de dados, mas pode-se provar que ela
 * carrega e tem a forma certa — e é isso que apanha o erro mais provável neste
 * módulo em concreto: **o caminho relativo para `database/helpers/esquema.js`**.
 *
 * As migrações deste módulo vivem em `minfin-integration/migrations/` e não em
 * `database/migrations/`, portanto o caminho para os helpers do esquema é
 * `../../database/helpers/esquema.js` — uma profundidade diferente de todas as
 * outras ~120 migrações do projecto. Um `../` a mais ou a menos só se descobre
 * a meio de um `migration:run` num servidor, que é exactamente o momento em que
 * o CLAUDE.md §7.19 documenta que não se quer descobrir nada.
 */
test.group('MINFIN — as migrações carregam e têm a forma certa', () => {
  const pastaDeMigracoes = join(RAIZ, 'migrations')
  const migracoes = readdirSync(pastaDeMigracoes).filter((f) => f.endsWith('.ts'))

  test('há migrações', ({ assert }) => {
    assert.isAbove(migracoes.length, 0, 'a pasta de migrações não devia estar vazia')
  })

  for (const migracao of migracoes) {
    test(migracao, async ({ assert }) => {
      const modulo = await import(pathToFileURL(join(pastaDeMigracoes, migracao)).href)
      const Classe = modulo.default

      assert.isFunction(Classe, 'uma migração exporta uma classe por omissão')
      assert.isFunction(Classe.prototype.up, 'tem de ter up()')
      assert.isFunction(
        Classe.prototype.down,
        'tem de ter down() — um down em falta impede o rollback e só se nota quando é preciso'
      )
    })
  }
})
