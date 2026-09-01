# `baipaga-integration`

Integração com o **BAI Paga** — a *Mobile Payments API for external partners* do
Banco BAI.

Módulo fechado, à imagem do `minfin-integration/`: arranca, valida-se e falha
sozinho, e pode ser copiado para outro serviço sem arrastar meio `start/`. Não
importa nada de `app/`, `config/` ou `start/`.

---

## A especificação

O que nos foi indicado — `https://ib.bancobai.ao/QUAMDW-3G/internet-banking/docs/swagger-ui.html`
— é o invólucro em JavaScript do Swagger UI. A especificação está em

```
https://ib.bancobai.ao/QUAMDW-3G/internet-banking/api/swagger.json
```

e está guardada em [`openapi/swagger.json`](openapi/swagger.json), para que estes
tipos possam ser conferidos contra ela sem depender de o servidor deles estar de
pé, e para que se veja o que mudou quando mudar.

`openapi: 3.0.1`, `info.version: v0.0.1-SNAPSHOT`, um `tag` (*External
Partners*), onze operações.

> **`QUAMDW-3G` é o ambiente de qualidade deles.** Não é um caminho fixo da API —
> é o nome de uma instância, e em produção muda. Por isso o URL inteiro é
> configurável e não há neste código nenhuma constante com "QUAMDW" lá dentro.

---

## As três coisas que é preciso saber antes de mexer

### 1. HTTP 200 não quer dizer que correu bem

Dez dos onze endpoints devolvem o veredicto de negócio num campo `responseCode`
**dentro de um 200**. `INVALID_MSISDN`, `CORE_BANKING_UNAVAILABLE` e
`UNAUTHORIZED` chegam todos com o mesmo 200 que o `OK`.

Um cliente que olhe para `response.ok` dá por concluídos pagamentos que nunca
existiram. `ClienteBaipaga` verifica os dois veredictos e só devolve `ok: true`
quando concordam. É a razão principal pela qual esta classe existe em vez de meia
dúzia de `fetch()` espalhados pelos controladores.

### 2. `ACCEPTED` não é `SUCCESS`

`ACCEPTED` diz que o cliente autorizou. `SUCCESS` diz que o dinheiro saiu da
conta dele. Só `SUCCESS` liquida — use `estadoLiquidou()` / `podeEntregar()` e
nunca `estado !== 'ERROR'`.

E o contrário também não é simétrico: `TIMEOUT` e `UNKNOWN` **não** querem dizer
"não foi cobrado". Só `REJECTED`, `EXPIRED`, `CANCELED` e `ERROR` o confirmam —
é o que `estadoConfirmaQueNadaFoiCobrado()` responde.

### 3. A `externalReference` é a única defesa contra cobrar duas vezes

O BAI recusa uma referência repetida com `EXISTING_EXTERNAL_REFERENCE`. Isso só
protege se a referência for **derivada da encomenda** e estável entre tentativas.
Uma referência nova a cada carregamento do ecrã transforma a protecção em
decoração.

E quando um pedido falha por timeout, a resposta certa **não** é repetir: é
consultar. O pedido pode ter chegado. `ErroNormalizado.consultarAntesDeRepetir`
marca exactamente esses casos.

---

## Estrutura

| Ficheiro | O que lá está |
| --- | --- |
| `configuracao.ts` | Leitura e validação do ambiente, uma vez, à primeira utilização. |
| `contratos/contratos.ts` | As formas JSON dos onze endpoints. Só tipos. |
| `dominio/estados.ts` | Os quinze estados de pagamento e os cinco fluxos, e o que cada um autoriza. |
| `dominio/codigos_resposta.ts` | Os dezassete `responseCode`, com texto técnico e texto para o ecrã. |
| `assinatura/hmac.ts` | Verificação do HMAC-SHA256 das respostas de estado. |
| `transporte/http.ts` | `fetch()` com timeout, e a garantia de que a chave de API não entra em registos. |
| `validacao/formatos.ts` | MSISDN, moeda, e aritmética de dinheiro em inteiros. |
| `validacao/regras.ts` | O que se consegue recusar antes de gastar uma chamada. |
| `cliente/normalizacao.ts` | Leitura defensiva das respostas. |
| `cliente/cliente_baipaga.ts` | A classe. Um método por endpoint, mais `esperarDesfecho()`. |
| `simulador/servidor.ts` | Um servidor que finge ser o BAI — incluindo assinar mal, de propósito. |
| `testes/` | A suite `baipaga`. |
| `openapi/swagger.json` | A especificação, como veio. |
| `DIVERGENCIAS.md` | O que a especificação não diz, diz duas vezes, ou diz mal. |

### Testes

```bash
node ace test baipaga
```

Não precisa de base de dados e não toca no BAI: corre contra o
`simulador/servidor.ts`. Além das razões habituais para não testar contra o
ambiente deles — cada chamada consome uma referência externa, e não há forma de
lhes pedir um `CORE_BANKING_UNAVAILABLE` a pedido — há uma que é só desta
integração: **a única maneira de afirmar que uma resposta forjada é recusada é
forjar uma**, e isso exige um servidor nosso.

O simulador responde ao que lhe mandarem responder e não decide nada sozinho:
uma suposição sobre o comportamento do BAI dentro de um simulador passa a ser
testada como se fosse verdade.

---

## Os onze endpoints, e o que os cobre

| Operação | Método deste módulo |
| --- | --- |
| `GET /cartVatPercentages` | `percentagensDeIva()` |
| `POST /calculateCart` | `calcularCarrinho()` |
| `GET /msisdn/{msisdn}/validate` | `validarMsisdn()` |
| `GET /merchants/{id}/acceptancePoint/{id}` | `pontoDeAceitacao()` |
| `POST /payment/request` | `pedirPagamento()` |
| `POST /payment/initiate` | `iniciarPagamentoComOtp()` |
| `POST /payment/captive` | `criarCativo()` |
| `POST /payment/captive/confirm` | `confirmarCativo()` |
| `POST /payment/captive/cancel` | `anularCativo()` |
| `POST /qrCode` | `gerarQrCode()` |
| `GET /payment` | `consultarPagamento()`, `esperarDesfecho()` |

---

## Os quatro fluxos

**Valor fixo** (`pedirPagamento`) — o cliente recebe uma notificação na aplicação
do banco e confirma lá. Para venda ao balcão.

**OTP** (`iniciarPagamentoComOtp`) — devolve um `urlDeConfirmacao` para onde se
encaminha o browser do cliente, que confirma com um código. Para venda na web.

**Cativo** (`criarCativo` → `confirmarCativo` / `anularCativo`) — pré-autoriza um
valor estimado com um tecto, e cobra o valor final depois. Para bombas de
combustível, hotéis, aluguer.

> ⚠️ Um cativo criado **tem** de ser confirmado ou anulado. Esquecido, deixa o
> dinheiro do cliente retido até `captiveValidUntil` — que a criação nem sequer
> devolve (ver `DIVERGENCIAS.md` #C-14).

**QR Code** (`gerarQrCode`) — o código não tem MSISDN: quem paga é quem o ler. Não
há `paymentId` para acompanhar, só a `externalReference` que se tenha passado.

---

## Como se usa

```ts
import { ClienteBaipaga, mensagemDaFalha } from './baipaga-integration/cliente/cliente_baipaga.js'

const bai = new ClienteBaipaga()

// 1. O número serve? Barato, e evita gastar uma referência externa.
const cliente = await bai.validarMsisdn('923 456 789')   // normaliza para 244923456789
if (!cliente.ok || !cliente.dados.valido) {
  return { erro: cliente.ok ? 'Número sem conta no BAI.' : mensagemDaFalha(cliente) }
}

// 2. Pedir o pagamento. A referência vem da encomenda, e é sempre a mesma.
const pedido = await bai.pedirPagamento({
  msisdn: cliente.dados.msisdn,
  total: 15_000,
  referencia: `ENC-${encomenda.id}`,
  descricao: 'Compra na Loja Central',
})

if (!pedido.ok) {
  if (pedido.erros[0]?.consultarAntesDeRepetir) {
    // Pode ter passado. Consultar antes de fazer o que quer que seja.
    const estado = await bai.consultarPagamento({ referencia: `ENC-${encomenda.id}` })
    // ...
  }
  return { erro: mensagemDaFalha(pedido) }
}

// 3. Esperar pelo desfecho.
const desfecho = await bai.esperarDesfecho({ referencia: `ENC-${encomenda.id}` })

if (desfecho.ok && desfecho.dados.liquidado) {
  entregarMercadoria()
} else if (desfecho.ok && desfecho.dados.pendente) {
  // NÃO é uma falha. Gravar como pendente e voltar a perguntar mais tarde.
  gravarPendente()
} else {
  naoEntregar()
}
```

### Carrinho com IVA

As linhas identificam a taxa pelo `id` da tabela do BAI, não pelo valor. E a
forma de nunca ver um `SHOPPING_CART_AMOUNT_NOT_EQUAL_TO_TOTAL_AMOUNT` é deixar
que sejam eles a fazer as contas:

```ts
const taxas = await bai.percentagensDeIva()
const iva14 = taxas.ok ? taxas.dados.find((t) => t.value === 14) : undefined

const calculado = await bai.calcularCarrinho({
  items: [
    { description: 'Artigo XYZ', amountPerItem: 250, count: 2, discount: 50, vatPercentage: iva14 },
  ],
})

if (calculado.ok) {
  await bai.pedirPagamento({
    msisdn: '244923456789',
    total: calculado.dados.totalCartAmountWithVat!,
    referencia: `ENC-${encomenda.id}`,
    carrinho: calculado.dados,
  })
}
```

---

## Variáveis de ambiente

| Variável | Obrigatória | Omissão | O que é |
| --- | --- | --- | --- |
| `BAIPAGA_BASE_URL` | sim | — | Raiz da API, sem barra final. Tem de ser `https://`. |
| `BAIPAGA_API_KEY` | sim | — | Cabeçalho `X-MP-ApiKey`. |
| `BAIPAGA_CHAVE_PARTILHADA` | ver abaixo | — | Segredo com que o BAI assina as respostas de estado. |
| `BAIPAGA_MERCHANT_EXTERNAL_ID` | ver abaixo | — | `merchant.externalId`, último campo da cadeia assinada. |
| `BAIPAGA_MERCHANT_ID` | não | — | Omissão de `merchantId` em `pedirPagamento`. |
| `BAIPAGA_ACCEPTANCE_POINT_ID` | não | — | Omissão do ponto de aceitação em `gerarQrCode`. |
| `BAIPAGA_MOEDA` | não | `AOA` | ISO 4217. |
| `BAIPAGA_INDICATIVO_PAIS` | não | `244` | Para normalizar números escritos à angolana. |
| `BAIPAGA_TIMEOUT_MS` | não | `30000` | |
| `BAIPAGA_CASAS_DECIMAIS` | não | `2` | Precisão das comparações de montantes. |
| `BAIPAGA_VERIFICAR_ASSINATURA` | não | ligada, se houver com quê | Ver abaixo. |
| `BAIPAGA_CANONICALIZACAO` | não | `auto` | `auto`, `montante-simples`, `montante-1-casa`, `montante-2-casas`. Ver #A-01. |
| `BAIPAGA_REGISTAR_PAYLOADS` | não | `true` | Guardar os corpos enviados para auditoria. |

```bash
BAIPAGA_BASE_URL=https://ib.bancobai.ao/QUAMDW-3G/internet-banking/api
BAIPAGA_API_KEY=
BAIPAGA_CHAVE_PARTILHADA=
BAIPAGA_MERCHANT_EXTERNAL_ID=
```

### Sobre `BAIPAGA_VERIFICAR_ASSINATURA`

A resposta de estado é o que decide se se entrega mercadoria. Sem a assinatura
verificada, quem conseguir responder no lugar do BAI — um DNS envenenado, um
proxy comprometido, um ambiente de testes mal apontado — consegue dizer `SUCCESS`
sobre um pagamento que nunca existiu.

A verificação precisa de **dois** ingredientes que a especificação não fornece: a
chave partilhada e o `merchant.externalId` (que tem de vir da configuração e
nunca da própria resposta — senão quem a forja forja também o campo).

- Sem os dois, a verificação fica desligada e **cada consulta traz um aviso a
  dizer porquê**. Nunca devolve "válida" por não ter tido com que verificar.
- Pôr `BAIPAGA_VERIFICAR_ASSINATURA=true` **sem** os dois é um erro de
  configuração e a aplicação recusa arrancar a integração: uma verificação que
  passa por omissão é pior do que nenhuma, porque quem a lê acredita nela.

---

## Antes de ir para produção

- [ ] Pedir ao BAI a **chave partilhada** e o **`merchant.externalId`**, e ligar
      `BAIPAGA_VERIFICAR_ASSINATURA`. (#A-04)
- [ ] Correr uma consulta de estado real, ler o aviso do formato, e fixar
      `BAIPAGA_CANONICALIZACAO`. (#A-01)
- [ ] Pedir ao BAI a documentação do **callback** — URL, formato, autenticação,
      repetições. Sondar funciona; ser notificado é melhor. (#C-07)
- [ ] Pedir o **limite da `externalReference`** e o **limite de tentativas** por
      trás do `MAX_FAILED_RETRIES_REACHED`. (#C-05, #RN-03)
- [ ] Perguntar se há **endpoint de devolução** — `totalReversed` e
      `maxReversible` existem, o endpoint não. (#C-13)
- [ ] Decidir de propósito o que se faz a `Resultado.respostaBruta`: ela contém
      dados pessoais de clientes do BAI (conta, NIB, NIF, morada, balcão).
      (#C-12)
- [ ] Trocar `QUAMDW-3G` pelo ambiente de produção em `BAIPAGA_BASE_URL`.

---

## Validação no arranque (opcional)

Este módulo valida-se à primeira utilização, e não no arranque — o preço de ser
independente de `start/`. Quem quiser a rede acrescenta isto a `start/env.ts` e
nada aqui muda:

```ts
BAIPAGA_BASE_URL: Env.schema.string({ format: 'url' }),
BAIPAGA_API_KEY: Env.schema.string(),
BAIPAGA_CHAVE_PARTILHADA: Env.schema.string.optional(),
BAIPAGA_MERCHANT_EXTERNAL_ID: Env.schema.string.optional(),
BAIPAGA_MERCHANT_ID: Env.schema.number.optional(),
BAIPAGA_ACCEPTANCE_POINT_ID: Env.schema.number.optional(),
BAIPAGA_MOEDA: Env.schema.string.optional(),
BAIPAGA_INDICATIVO_PAIS: Env.schema.string.optional(),
BAIPAGA_TIMEOUT_MS: Env.schema.number.optional(),
BAIPAGA_CASAS_DECIMAIS: Env.schema.number.optional(),
BAIPAGA_VERIFICAR_ASSINATURA: Env.schema.boolean.optional(),
BAIPAGA_CANONICALIZACAO: Env.schema.enum.optional([
  'auto',
  'montante-simples',
  'montante-1-casa',
  'montante-2-casas',
] as const),
BAIPAGA_REGISTAR_PAYLOADS: Env.schema.boolean.optional(),
```
