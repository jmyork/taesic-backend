import { test } from '@japa/runner'
import { construirCenarios } from '../simulador/cenarios.js'

/**
 * Os cenários do simulador, corridos pelo Japa.
 *
 * ── Porque é que este ficheiro não tem testes escritos ────────────────────────
 *
 * Porque estão todos em `simulador/cenarios.ts`, e este ficheiro só os percorre.
 * A lista tem de correr em dois sítios — aqui, para o `node ace test` a apanhar
 * (regra 1 do CLAUDE.md), e como script solto (`simulador/executar.ts`), para
 * poder ser exercitada numa máquina sem MySQL nem `.env`.
 *
 * Escrever os cenários duas vezes seria garantir que as duas versões divergem: a
 * primeira correcção feita só num dos lados deixaria "passou nos testes" e
 * "passou no simulador" a querer dizer coisas diferentes.
 *
 * NENHUM destes cenários toca na base de dados. Exercitam o cliente HTTP contra
 * o servidor simulado (`simulador/servidor_agt_simulado.ts`) — a única coisa que
 * há para exercitar enquanto a AGT não entregar endereços reais, já que o
 * Blueprint os entrega como `http://xxx.xxx.xxx.xxx:yyyy/`.
 */
test.group('MINFIN — facturação electrónica (AGT 4.0)', () => {
  for (const cenario of construirCenarios()) {
    test(`${cenario.grupo} › ${cenario.nome}`, async () => {
      await cenario.executar()
    })
  }
})
