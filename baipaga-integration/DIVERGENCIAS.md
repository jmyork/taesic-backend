# Divergências e omissões da especificação do BAI Paga

Cada entrada é uma coisa que a especificação não diz, diz de duas maneiras, ou diz
de uma maneira que não pode estar certa. Estão aqui numeradas para que o código
lhes possa apontar, e para que quando o BAI responder a alguma se saiba
exactamente onde mexer.

Fonte: `openapi/swagger.json`, cópia literal de
`https://ib.bancobai.ao/QUAMDW-3G/internet-banking/api/swagger.json`,
`openapi: 3.0.1`, `info.version: v0.0.1-SNAPSHOT`.

> `v0.0.1-SNAPSHOT` não é um número de versão de uma API em produção. É o valor
> por omissão de um projecto Maven que nunca foi versionado. Vale a pena
> perguntar ao BAI qual é a versão real antes de assentar contratos nesta.

---

## A — Assinatura

### #A-01 — Como se escreve o `amount` na cadeia assinada

**O que a especificação diz** (descrição de `MobilePaymentView.signature`):

```
HMAC(sharedKey, id|nonce|externalReference|amount|lastChangeDate|merchant.externalId)
```

**O problema.** O `amount` é um número em JSON. `1500`, `1500.0` e `1500.00` são
o mesmo número e três cadeias diferentes, e produzem três HMAC diferentes. O
`JSON.parse` do Node reduz as três a `1500` — a forma original perde-se antes de
chegarmos a poder usá-la.

**O que fazemos.** `assinatura/hmac.ts` trata o formato do montante como uma
estratégia enumerada: `montante-simples` (`"1500"`), `montante-1-casa`
(`"1500.0"`, o que produz `Double.toString()` em Java) e `montante-2-casas`
(`"1500.00"`, o que produz um `BigDecimal` de escala 2). Em `auto`, tenta as três
e diz num aviso qual bateu. Como último recurso, `montantesCrusDaResposta()` vai
buscar os tokens numéricos originais ao corpo em bruto e experimenta-os também.

**Como se fecha.** Correr uma consulta de estado real contra o ambiente de
qualidade, ler o aviso, e fixar `BAIPAGA_CANONICALIZACAO`.

### #A-02 — Campos nulos na cadeia assinada

A especificação não diz o que ocupa o lugar de um campo ausente. `externalReference`
e `nonce` são declarados opcionais; um pagamento sem referência externa produz uma
cadeia com um buraco no meio.

**O que fazemos.** Cadeia vazia entre os dois separadores — a leitura mais comum
de um `String.join` sobre nulos em Java. A alternativa (o literal `null`) está a
uma linha de distância em `escreverTexto()`.

### #A-03 — Codificação da assinatura

Não é dito se o HMAC vem em hexadecimal ou em Base64.

**O que fazemos.** Deduzimo-lo do comprimento: 32 bytes são 64 caracteres
hexadecimais ou 43/44 em Base64, e nenhuma cadeia é as duas coisas. Não há aqui
nada para configurar porque não há nada para escolher.

### #A-04 — A `sharedKey` não existe na especificação

O campo `signature` é descrito em função de uma `sharedKey` que não aparece em
lado nenhum: nem como parâmetro, nem como cabeçalho, nem como nota. Chega por
fora, no acordo de integração.

**Consequência prática.** Até ela existir, `verificarAssinatura` fica desligada e
cada consulta de estado traz um aviso a dizer que a origem da resposta não foi
verificada. **Isto não é aceitável em produção** — ver a lista de verificação no
`README.md`.

---

## C — Contratos

### #C-01 — `responseCode` é texto ou número?

Está declarado como `string` com dezassete valores (`OK`, `FATAL`, …) e a seguir
descrito como *"Code 0 indicates success, negative codes indicate various error
conditions"*, que é a descrição de um campo numérico — provavelmente o que este
campo era numa versão anterior e nunca foi actualizado.

**O que fazemos.** `eSucesso()` aceita `"OK"`, `0` e `"0"`. Emitimos sempre a
comparação pela forma textual.

### #C-02 — Quatro objectos para dois conceitos

`ShoppingCartItem` e `ShoppingCartItemDetails` têm os mesmos campos e diferem só
no `id` (que só a segunda tem). `CartItemVatPercentage`,
`CartItemVatPercentageCommonView` e `CartItemVatPercentageView` são três objectos
com exactamente os mesmos três campos.

**O que fazemos.** Dois tipos: `LinhaDoCarrinho` (entrada) e
`LinhaDoCarrinhoCalculada` (saída, estende a primeira com `id`), e um só
`PercentagemIva`. Se o BAI vier a divergi-los a sério, separa-se.

### #C-03 — `totalCartAmountWithVatGroups`: qual é a chave?

Descrito como *"key: VAT percentage, value: total amount for that rate"*. Não diz
se a chave é `"14"`, `"14.0"`, `"0.14"` ou o `id` da percentagem.

**O que fazemos.** `Record<string, number>` sem interpretar a chave. Nada no
módulo depende dela.

### #C-04 — `int64` em JSON

`payment.id`, `merchant.id`, `accountId`, `operationId` e `acceptancePointId`
são `int64`. O `JSON.parse` do JavaScript lê números como `double`, exacto só até
2^53−1. Acima disso o valor lido difere do enviado, em silêncio.

**O que fazemos.** `avisosDePrecisao()` verifica e avisa, e a documentação diz
para usar a `externalReference` — que é texto e é nossa — como identificador.

### #C-05 — `externalReference` sem comprimento nem alfabeto

É o campo que impede uma segunda cobrança e a especificação não declara `maxLength`,
`pattern` nem `minLength`. Um limite existe algures do lado deles, e descobre-se
com um `INVALID_PARAMETERS`.

**O que fazemos.** Limite prudente de 120 caracteres em `eReferenciaExterna()`,
para que a recusa aconteça aqui e diga porquê.

### #C-06 — Operações identificadas por dois campos, ambos opcionais

Em `GET /payment`, `POST /payment/captive/confirm` e `POST /payment/captive/cancel`,
`paymentId` e `externalReference` são ambos opcionais no esquema, e a descrição
diz *"must be identified by either paymentId or externalReference"*. Um pedido
sem nenhum dos dois é sintacticamente válido e semanticamente impossível.

**O que fazemos.** `identificacaoDoPagamento()` exige um dos dois, antes de sair.

### #C-07 — O callback que existe mas não está descrito

`MobilePaymentView.callbackResult` é *"result of the callback notification to the
merchant"*. Portanto há notificações. Mas não há, em nenhum lado da
especificação: o URL que temos de expor, o formato do corpo, o método, como se
autentica a chamada, se há repetições, nem o que o BAI espera receber de volta.

**Consequência prática.** Este módulo sonda (`esperarDesfecho()`). Sondar é mais
caro e mais lento do que ser notificado, e é o que há enquanto o callback não for
documentado. **Vale a pena pedi-lo ao BAI antes de pôr isto em produção com
volume.**

### #C-08 — Nenhum esquema de segurança declarado

`security` e `components.securitySchemes` são ambos nulos. A chave de API é um
parâmetro de cabeçalho (`X-MP-ApiKey`) declarado onze vezes, uma por operação.

**Consequência prática.** Qualquer gerador de clientes a partir desta
especificação produz um cliente que trata a chave como um argumento normal de
cada método, em vez de a configurar uma vez. É uma das razões pelas quais este
módulo é escrito à mão.

### #C-09 — Duas operações sem `responseCode`

`POST /calculateCart` e `GET /cartVatPercentages` devolvem objectos sem
`responseCode` nem `message`. São as duas únicas.

**O que fazemos.** `OpcoesDeChamada.temCodigoResposta` distingue-as. Sem isso,
toda a chamada bem sucedida a estas duas pareceria falhada.

### #C-10 — Respostas de erro sem corpo declarado

Todas as respostas 400/401/404/500 dos onze endpoints têm `description` e mais
nada: nenhum `content`, nenhum esquema. Não há forma de saber, pela
especificação, o que vem no corpo de um erro HTTP.

**O que fazemos.** Traduzimos o estatuto HTTP para um código do catálogo deles
(`401`/`403` → `INVALID_API_KEY`, `404` → `INVALID_EXTERNAL_REFERENCE`, `400` →
`INVALID_PARAMETERS`, `5xx` → `CORE_BANKING_UNAVAILABLE`) e guardamos a resposta
em bruto.

### #C-11 — `merchantId` opcional e sem regra

`POST /payment/request` aceita um `merchantId`; os outros quatro endpoints de
criação de pagamento não. Não é dito o que acontece se for omitido (presume-se
que se deriva da chave de API), nem o que acontece se for um comerciante
diferente do da chave (presume-se `UNAUTHORIZED`).

### #C-12 — A resposta de estado arrasta o modelo interno do banco

`MobilePaymentView.customerOperation` traz `Account`, `Customer`, `Branch`,
`BankMovement`, `ClientSegment` e `OperationCost` — com número de conta, NIB,
nome do primeiro titular, número fiscal, morada, balcão e segmento do cliente.

Isto são dados pessoais do cliente do banco que uma integração de pagamentos não
precisa de ter, e que passamos a ter de guardar em conformidade a partir do
momento em que os recebemos.

**O que fazemos.** `contratos.ts` não declara esses ramos, para que ninguém
comece a depender deles. Continuam a chegar na resposta em bruto — **quem
guardar `Resultado.respostaBruta` a longo prazo está a guardar dados pessoais de
clientes do BAI e tem de decidir isso de propósito**, não por omissão.

### #C-13 — Devoluções sem endpoint

`MobilePaymentView` tem `totalReversed`, `maxReversible` e `reversible`. Não há
nenhum endpoint para devolver. Ou a devolução se faz por outro canal, ou por
outra API, ou não se faz — a especificação não diz qual.

### #C-14 — O cativo não devolve a validade

`POST /payment/captive` devolve só `paymentId`, sem `captiveValidUntil` — apesar
de a `MobilePaymentView` ter esse campo e de um cativo ter, por definição, prazo.
Para saber até quando a autorização é válida é preciso uma consulta de estado a
seguir à criação.

---

## RN — Regras de negócio

### #RN-01 — Que moedas são aceites

Existe um `INVALID_CURRENCY` e não existe uma lista de moedas aceites. Presume-se
`AOA`; a variável `BAIPAGA_MOEDA` existe para o caso de não ser só essa.

### #RN-02 — Prazo de validade de um pedido de pagamento

`expirationDate` vem na resposta, mas o prazo não é configurável no pedido nem
está documentado quanto é. Não dá para planear um ecrã de contagem decrescente
sem primeiro observar o valor real.

### #RN-03 — `MAX_FAILED_RETRIES_REACHED` sem número

Existe o código, não existe o limite: não é dito quantas tentativas, em que
janela, nem sobre o quê (um pagamento? um número? uma chave?). Não é possível
implementar uma política de repetição que o respeite sem o descobrir a bater
nele.
