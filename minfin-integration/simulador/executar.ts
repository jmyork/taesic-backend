/**
 * Corredor dos cenários, fora do AdonisJS.
 *
 *     npx tsx minfin-integration/simulador/executar.ts
 *     npx tsx minfin-integration/simulador/executar.ts Rede      # só um grupo
 *
 * Não precisa de base de dados, de `.env`, nem de aplicação a arrancar — corre
 * numa máquina limpa. É de propósito: a alternativa era não poder exercitar nada
 * enquanto não houvesse MySQL de pé, e a pergunta que este módulo tem de
 * responder ("o que sai daqui está certo?") não depende de MySQL nenhum.
 *
 * Sai com código 1 se algum cenário falhar, para servir num CI.
 */

import { construirCenarios } from './cenarios.js'

const VERDE = '\x1b[32m'
const VERMELHO = '\x1b[31m'
const CINZA = '\x1b[90m'
const NEGRITO = '\x1b[1m'
const FIM = '\x1b[0m'

async function principal(): Promise<number> {
  const filtro = process.argv[2]
  const todos = construirCenarios()

  const cenarios = filtro
    ? todos.filter(
        (c) =>
          c.grupo.toLowerCase().includes(filtro.toLowerCase()) ||
          c.nome.toLowerCase().includes(filtro.toLowerCase())
      )
    : todos

  if (cenarios.length === 0) {
    const grupos = [...new Set(todos.map((c) => c.grupo))].join(', ')
    console.log(`Nenhum cenário corresponde a "${filtro}". Grupos: ${grupos}`)
    return 1
  }

  console.log(`\n${NEGRITO}Integração MINFIN — ${cenarios.length} cenários${FIM}`)
  console.log(
    `${CINZA}Blueprint do Serviço de Facturação Electrónica v1.5 (AGT 4.0 / SIGT)${FIM}\n`
  )

  const falhas: Array<{ cenario: string; erro: unknown }> = []
  let grupoActual = ''
  const inicio = Date.now()

  for (const cenario of cenarios) {
    if (cenario.grupo !== grupoActual) {
      grupoActual = cenario.grupo
      console.log(`${NEGRITO}${grupoActual}${FIM}`)
    }

    try {
      await cenario.executar()
      console.log(`  ${VERDE}✓${FIM} ${cenario.nome}`)
    } catch (erro) {
      falhas.push({ cenario: `${cenario.grupo} > ${cenario.nome}`, erro })
      console.log(`  ${VERMELHO}✗ ${cenario.nome}${FIM}`)
      console.log(`    ${VERMELHO}${(erro as Error)?.message ?? erro}${FIM}`)
    }
  }

  const duracao = ((Date.now() - inicio) / 1000).toFixed(2)
  console.log('')

  if (falhas.length === 0) {
    console.log(
      `${VERDE}${NEGRITO}${cenarios.length} cenários, todos a passar${FIM} ${CINZA}(${duracao}s)${FIM}\n`
    )
    return 0
  }

  console.log(
    `${VERMELHO}${NEGRITO}${falhas.length} de ${cenarios.length} cenários a falhar${FIM} ${CINZA}(${duracao}s)${FIM}\n`
  )

  for (const falha of falhas) {
    console.log(`  ${VERMELHO}${falha.cenario}${FIM}`)
    const pilha = (falha.erro as Error)?.stack
    if (pilha) console.log(`${CINZA}${pilha.split('\n').slice(0, 4).join('\n')}${FIM}`)
  }

  console.log('')
  return 1
}

principal()
  .then((codigo) => process.exit(codigo))
  .catch((erro) => {
    console.error(erro)
    process.exit(1)
  })
