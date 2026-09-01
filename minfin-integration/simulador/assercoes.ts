/**
 * Asserções mínimas.
 *
 * Existem para que os cenários de `cenarios.ts` corram nos DOIS sítios em que
 * têm de correr: dentro do `node ace test` (Japa) e como script solto
 * (`executar.ts`), que é o que permite exercitar a integração numa máquina sem
 * base de dados nem configuração de aplicação. Um cenário que dependesse do
 * `assert` do Japa só correria no primeiro.
 */

export class FalhaDeCenario extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'FalhaDeCenario'
  }
}

export function verdade(condicao: unknown, mensagem: string): asserts condicao {
  if (!condicao) throw new FalhaDeCenario(mensagem)
}

export function igual<T>(obtido: T, esperado: T, contexto: string): void {
  if (obtido !== esperado) {
    throw new FalhaDeCenario(
      `${contexto}: esperado ${JSON.stringify(esperado)}, obtido ${JSON.stringify(obtido)}`
    )
  }
}

/** A lista de códigos de erro contém este código? */
export function temCodigo(codigos: readonly string[], codigo: string, contexto: string): void {
  if (!codigos.includes(codigo)) {
    throw new FalhaDeCenario(
      `${contexto}: esperava o código ${codigo}, obtive [${codigos.join(', ')}]`
    )
  }
}

/** A lista NÃO contém este código — para provar que uma regra não dispara a mais. */
export function naoTemCodigo(codigos: readonly string[], codigo: string, contexto: string): void {
  if (codigos.includes(codigo)) {
    throw new FalhaDeCenario(`${contexto}: não esperava o código ${codigo}, mas ele apareceu`)
  }
}
