/**
 * Validação à mão do sintoma "o 429 barra todos os dispositivos".
 *
 * Os testes em tests/functional/limiter_chaves.spec.ts já provam a correcção, e
 * são eles que travam a regressão. Este script existe para outra coisa: ver o
 * mesmo comportamento no SERVIDOR A CORRER, com pedidos HTTP a sério, porque foi
 * assim que o problema apareceu e é assim que se confirma que desapareceu.
 *
 * COMO CORRER
 *
 *   1. node ace serve --hmr          (noutro terminal)
 *   2. node ace limiter:reset        (senão os contadores vêm da tentativa anterior)
 *   3. node scripts/validar-limitadores.mjs
 *
 * Variáveis aceites:
 *   API           endereço da API              (por omissão http://localhost:3333)
 *   BFF_SECRET    valor do cabeçalho x-bff-secret, se o ApenasBffMiddleware
 *                 estiver activo neste ambiente (ver .env: BFF_SHARED_SECRET)
 *
 * COMO É QUE ISTO CONSEGUE FINGIR DOIS DISPOSITIVOS
 *
 * Pelo `X-Forwarded-For`, tal como o BFF faz em produção. O `trustProxy:
 * 'loopback'` em config/app.ts diz ao AdonisJS para acreditar nesse cabeçalho
 * quando o pedido chega de 127.0.0.1 — que é o caso quando este script corre na
 * mesma máquina que a API. É por isso que o script tem de correr localmente: de
 * fora, o cabeçalho é (bem) ignorado.
 *
 * PORQUE É QUE UM 400 CONTA COMO SUCESSO
 *
 * Os pedidos abaixo levam identificadores que não existem, de propósito: nenhum
 * email é enviado e nada é criado. O limitador corre ANTES da validação, por isso
 * o que interessa é só distinguir 429 (travado pelo limitador) de qualquer outra
 * coisa (passou o limitador). 400 é "passou".
 */

const API = (process.env.API ?? 'http://localhost:3333').replace(/\/+$/, '')
const SEGREDO = process.env.BFF_SECRET?.trim()

const VERDE = '\x1b[32m'
const VERMELHO = '\x1b[31m'
const CINZA = '\x1b[90m'
const FIM = '\x1b[0m'

/** Um pedido, feito como se viesse do dispositivo com o IP indicado. */
async function pedir(caminho, corpo, ipDoDispositivo) {
  const cabecalhos = {
    'content-type': 'application/json',
    'accept': 'application/json',
    'x-forwarded-for': ipDoDispositivo,
  }
  if (SEGREDO) cabecalhos['x-bff-secret'] = SEGREDO

  const resposta = await fetch(`${API}${caminho}`, {
    method: 'POST',
    headers: cabecalhos,
    body: JSON.stringify(corpo),
  })

  return { estado: resposta.status, travado: resposta.status === 429 }
}

let falhou = false

function verificar(descricao, condicao, detalhe) {
  if (condicao) {
    console.log(`  ${VERDE}OK${FIM}  ${descricao}`)
  } else {
    falhou = true
    console.log(`  ${VERMELHO}FALHA${FIM}  ${descricao}`)
    if (detalhe) console.log(`        ${CINZA}${detalhe}${FIM}`)
  }
}

/**
 * O caso que reproduzia o sintoma: `api/resend-company-activation-email` não
 * traz nenhum dos campos que o `emailActionThrottle` procurava, por isso todos os
 * pedidos do mundo caíam na mesma chave.
 */
async function cenarioReenvioDeActivacao() {
  console.log('\nReenvio de activação — esgotar uma empresa não pode bloquear outra')

  const CAMINHO = '/api/resend-company-activation-email'
  const dispositivoA = '203.0.113.10'
  const dispositivoB = '198.51.100.20'

  const doA = []
  for (let i = 0; i < 6; i++) {
    doA.push(await pedir(CAMINHO, { nif_ou_company_alias: 'empresa-inexistente-a' }, dispositivoA))
  }

  verificar(
    'os 5 primeiros pedidos do dispositivo A passam o limitador',
    doA.slice(0, 5).every((r) => !r.travado),
    `estados obtidos: ${doA.slice(0, 5).map((r) => r.estado).join(', ')}`
  )
  verificar(
    'o 6.º pedido do dispositivo A é travado com 429',
    doA[5].travado,
    `estado obtido: ${doA[5].estado} — o limite tem de continuar a existir`
  )

  const doB = await pedir(
    CAMINHO,
    { nif_ou_company_alias: 'empresa-inexistente-b' },
    dispositivoB
  )
  verificar(
    'o dispositivo B, com outra empresa, NÃO é travado',
    !doB.travado,
    `estado obtido: ${doB.estado} — se for 429, a chave voltou a ser global (ver chaveDoAlvo em start/limiter.ts)`
  )
}

/**
 * O caso mais perigoso: pedidos sem nada que identifique o alvo. Antes da
 * correcção consumiam uma chave partilhada e fechavam a confirmação de OTP a toda
 * a gente durante 10 minutos.
 */
async function cenarioPedidosSemAlvo() {
  console.log('\nPedidos sem nada que identifique o alvo — o lixo de um não fecha a porta aos outros')

  const CAMINHO = '/api/promotores/otp/confirmar'
  const atacante = '203.0.113.66'
  const outraPessoa = '198.51.100.77'

  const doAtacante = []
  for (let i = 0; i < 11; i++) {
    doAtacante.push(await pedir(CAMINHO, {}, atacante))
  }

  verificar(
    'os 10 primeiros pedidos do atacante passam o limitador',
    doAtacante.slice(0, 10).every((r) => !r.travado),
    `estados obtidos: ${doAtacante.slice(0, 10).map((r) => r.estado).join(', ')}`
  )
  verificar(
    'o 11.º pedido do atacante é travado com 429',
    doAtacante[10].travado,
    `estado obtido: ${doAtacante[10].estado}`
  )

  const deOutraPessoa = await pedir(CAMINHO, {}, outraPessoa)
  verificar(
    'outra pessoa, noutro dispositivo, NÃO é travada',
    !deOutraPessoa.travado,
    `estado obtido: ${deOutraPessoa.estado} — se for 429, o corpo vazio voltou a produzir uma chave global`
  )
}

console.log(`A validar os limitadores em ${API}`)
console.log(`${CINZA}(correr "node ace limiter:reset" antes, senão os contadores vêm da tentativa anterior)${FIM}`)

try {
  await cenarioReenvioDeActivacao()
  await cenarioPedidosSemAlvo()
} catch (erro) {
  console.error(`\n${VERMELHO}Não foi possível falar com a API em ${API}${FIM}`)
  console.error(`${CINZA}${erro.message}${FIM}`)
  console.error('A API está a correr? "node ace serve --hmr"')
  process.exit(2)
}

if (falhou) {
  console.log(`\n${VERMELHO}Há limitadores a barrar dispositivos que não deviam ser barrados.${FIM}`)
  process.exit(1)
}

console.log(`\n${VERDE}Todos os limites travam apenas quem os esgotou.${FIM}`)
console.log(`${CINZA}Para voltar a correr do zero: node ace limiter:reset${FIM}`)
