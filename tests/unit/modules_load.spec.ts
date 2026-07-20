import { test } from '@japa/runner'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * "Nada se assume a funcionar sem teste": esta suite teria apanhado de imediato os
 * ~14 repositórios e políticas que importavam o modelo errado (ex.: `#models/papel`
 * em vez de `#models/auth/papel`, `#models/project_role` em vez de
 * `#models/authplatform/project_role`) — bugs que faziam o módulo rebentar em
 * qualquer pedido real, mas que nenhum teste funcional cobria porque nunca chegavam
 * a ser exercitados. Todos os testes aqui são unitários (sem BD): apenas confirmam
 * que cada ficheiro carrega e expõe uma classe por omissão.
 */

function tsFilesIn(dirUrl: URL): string[] {
  return fs
    .readdirSync(fileURLToPath(dirUrl))
    .filter((f) => f.endsWith('.ts'))
    .sort()
}

async function assertLoadsWithDefaultExport(assert: any, dirUrl: URL, file: string) {
  const mod = await import(new URL(file, dirUrl).href)
  assert.isDefined(mod.default, `${file} deveria ter um "export default"`)
}

test.group('app/repositories carregam sem erro', () => {
  const dir = new URL('../../app/repositories/', import.meta.url)
  for (const file of tsFilesIn(dir)) {
    test(file, async ({ assert }) => {
      await assertLoadsWithDefaultExport(assert, dir, file)
    })
  }
})

test.group('app/policies carregam sem erro', () => {
  const dir = new URL('../../app/policies/', import.meta.url)
  for (const file of tsFilesIn(dir)) {
    if (file === 'main.ts') continue // agrega as outras políticas, não é uma política em si
    test(file, async ({ assert }) => {
      await assertLoadsWithDefaultExport(assert, dir, file)
    })
  }
})

test.group('app/services carregam sem erro', () => {
  const dir = new URL('../../app/services/', import.meta.url)
  for (const file of tsFilesIn(dir)) {
    test(file, async ({ assert }) => {
      await assertLoadsWithDefaultExport(assert, dir, file)
    })
  }
})

test.group('app/controllers carregam sem erro', () => {
  const dir = new URL('../../app/controllers/', import.meta.url)
  for (const file of tsFilesIn(dir)) {
    test(file, async ({ assert }) => {
      await assertLoadsWithDefaultExport(assert, dir, file)
    })
  }
})

test.group('app/validators carregam sem erro', () => {
  const dir = new URL('../../app/validators/', import.meta.url)
  for (const file of tsFilesIn(dir)) {
    if (file === 'example.ts') continue // ficheiro de exemplo vazio, não é um validator real
    test(file, async ({ assert }) => {
      // Validators exportam consts nomeadas (createXValidator/updateXValidator), não default.
      const mod = await import(new URL(file, dir).href)
      assert.isAbove(Object.keys(mod).length, 0, `${file} deveria exportar pelo menos um validator`)
    })
  }
})
