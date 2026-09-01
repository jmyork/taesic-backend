# Divergências do Blueprint v1.5

Contradições, ambiguidades e omissões encontradas no documento
**"Blueprint do Serviço de Facturação Electrónica" (AGT 4.0 / SIGT), versão 1.5** —
cada uma com o que o código faz hoje e o que é preciso perguntar à AGT.

Isto não é uma crítica ao documento. É a lista de sítios onde **duas leituras
razoáveis dão resultados diferentes**, e onde escolher em silêncio produziria uma
integração que funciona em desenvolvimento e é recusada em produção — ou, pior,
aceite com os valores errados.

**Cada entrada tem um número, e esse número aparece no código, junto à decisão
que ela justifica.** Quando a AGT responder, procure o número.

---

## Como ler a coluna "o que fazemos"

| marca | significado |
|---|---|
| ✅ | resolvido, com fundamento verificável |
| ⚙️ | há um interruptor de configuração — muda-se sem tocar em código |
| ⚠️ | escolhemos uma leitura e ela pode estar errada; precisa de confirmação |
| 🚫 | bloqueia a entrada em produção |

---

## Contradições dentro do documento

### #C-01 — Anexos e secções referenciados que não existem 🚫

O corpo do documento remete para:

- "anexo 6.1" (códigos CAE), "6.2" (IEC), "6.3" (verbas de IS), "6.4" (isenções de IVA) —
  os anexos existem mas estão numerados **2.1 a 2.4**;
- **"secção 4.1.5"** (tabela de erros de `registarFactura`, citada em 1.1.3.1) — não existe;
- **"secção 5.5.5"** (tabela de erros de `solicitarSerie`, citada em 1.5.3.1) — não existe.

**O que fazemos:** assumimos que 6.1–6.4 são 2.1–2.4 (a correspondência de conteúdo
é inequívoca) e que as secções 4.1.5 e 5.5.5 são as tabelas 1.1.4 e 1.5.3.2, que
estão imediatamente a seguir às referências. ✅

**A perguntar:** se falta um capítulo do documento (a numeração 4.x/5.x/6.x sugere
que este PDF é um extracto de um documento maior), pedi-lo — pode conter regras que
não temos.

---

### #C-02 — Duas grafias para os mesmos campos ⚙️

O documento descreve cada serviço duas vezes, e as duas não coincidem:

| conceito | exemplos de JSON | tabelas de campos |
|---|---|---|
| identificador da solicitação | `submissionGUID` (UUID) | `submissionId` (`xxxxx-99999999-9999`) — excepto em 1.1.2, que também diz `submissionGUID` |
| objecto de detalhes | `softwareInfoDetails` | `softwareInfoDetail` |
| nome do software | `softwareName` | `productId` |
| versão | `softwareVersion` | `productVersion` |
| nº de certificação | `softwareValidationNo` | `softwareValidationNumber` |

**O que fazemos:** emitimos a grafia dos **exemplos** por omissão, e a das tabelas
com `MINFIN_NOMENCLATURA=tabelas`. Uma variável de ambiente e não uma constante,
porque a resposta pode ser diferente entre o ambiente de testes e o de produção
deles. ⚙️

**O argumento a favor dos exemplos:** a própria tabela de erros nomeia
`"softwareValidationNo"` no texto do E07 — ou seja, o documento contradiz a sua
própria tabela de campos, do lado dos exemplos.

**A perguntar:** qual vale. É a primeira pergunta a fazer, porque a resposta errada
faz TODAS as chamadas falharem.

---

### #C-03 — As assinaturas não cabem no comprimento declarado 🚫

`jwsSoftwareSignature`, `jwsDocumentSignature` e `jwsSignature` são declarados com
`"minlength": 256` **e** `"maxlength": 256` — exactamente 256 caracteres.

Isso é impossível para o que o nome dos campos indica:

| formato | comprimento |
|---|---|
| assinatura RSA-2048 crua, em base64url | **342** caracteres |
| JWS compacto RS256 (cabeçalho + payload + assinatura) | **450+** caracteres |
| assinatura RSA-2048 crua, em hexadecimal | 512 caracteres |
| **declarado no documento** | **256** |

256 é o número de BYTES de uma assinatura RSA-2048. É plausível que o documento
tenha trocado bytes por caracteres.

**O que fazemos:** produzimos um JWS compacto RS256 (é "jws" que está no nome dos
três campos), **verificamos o comprimento e avisamos** — nunca truncamos. Uma
assinatura truncada tem o tamanho certo e é criptograficamente inútil; a AGT
recusa-a com E08 sem dizer porquê. O aviso fica gravado em
`minfin_submissao.avisos_json`. ⚠️

A assinatura é uma **estratégia substituível** (`assinatura/jws.ts`): quando a AGT
esclarecer, escreve-se outra classe e troca-se uma linha.

**A perguntar, tudo junto:** algoritmo (RS256?), formato (JWS compacto? assinatura
crua? em que codificação?), formato do payload assinado (objecto JSON? concatenação
dos valores? por que ordem?), e o que significam exactamente os 256.

---

### #C-04 — O mesmo código de erro quer dizer coisas diferentes ⚠️

Verificado tabela a tabela:

| código | em `registarFactura` (1.1.4) | em `solicitarSerie` (1.5.3.2) |
|---|---|---|
| **E06** | "a data de criação do pedido `creationDate` não está dentro do período permitido" | "contribuinte não aderiu à facturação electrónica" |
| **E30** | (não usado) | "contribuinte não possui actividade registada" |
| **E05** | "número fiscal do emissor não possui actividade registada" | (não usado) |

E entre `listarFacturas` (1.3.4) e os restantes serviços de consulta:

| código | em `listarFacturas` | em `obterEstado`/`consultarFactura`/`listarSeries` |
|---|---|---|
| **E31** | "assinatura do produtor ≠ Certificação do Software" | (em `solicitarSerie`: "código de série já em utilização") |
| **E39** | "assinatura do produtor ≠ processo de Certificação" | idem |
| **E40** | não mencionado | "assinatura da chamada `jwsSignature` ≠ informação da chamada" |

A tabela 1.3.4 é a única das quatro que não menciona E40, e repete a mesma descrição
em duas linhas.

**O que fazemos:** o catálogo (`dominio/codigos_erro.ts`) é indexado **por serviço**.
Um `Record<codigo, descricao>` único era mais simples e daria a mensagem errada
exactamente nos casos em que ela importa. ✅

**Nota sobre a coluna "Regra de negócio":** a correspondência FE-RNG-xxx ↔ E-xx
**não** está no código. Na tabela 1.1.4 essa coluna está desalinhada da dos códigos
(há uma linha, `FE-RNG-002`, sem código nem descrição), e a partir daí o par desfaz-se.
O que é reconstruível com confiança é **código → descrição**, confirmado em cinco
tabelas independentes do próprio documento (1.2.4, 1.3.4, 1.4.4, 1.5.3.2, 1.6.4) que
coincidem nos códigos que partilham.

---

### #C-05 — E96 tem dois significados no mesmo serviço ⚠️

Na tabela de saída de `obterEstado` (1.2.3):

- **HTTP 422** → E96, "erro na chamada, solicitação ainda em processamento"
- **HTTP 400** → E96, "solicitação mal efectuada – erro de estrutura"

São situações opostas: a primeira quer dizer "volte mais tarde", a segunda quer
dizer "o que enviou está mal, repetir não resolve".

**O que fazemos:** `descreverErroDeChamada(codigo, httpStatus)` e
`erroEhTransitorio(codigo, httpStatus)` exigem o código HTTP. É a única coisa que
desfaz a ambiguidade. ✅

---

### #C-06 — `withholdingTaxType` declara 3 caracteres e lista valores de 4 ⚠️

O campo tem `"maxLength": 3` e a lista de valores possíveis inclui `IRPC` e `IRPS`.

**O que fazemos:** aceitamos os nove valores da lista (a lista é mais específica
que o atributo). Se a AGT validar pelo comprimento, `IRPC`/`IRPS` devolvem E03. ⚠️

---

### #C-07 — "Formatos numéricos portugueses" em JSON ⚠️

Os requisitos técnicos (secção 1) dizem que "tem de ser suportados os caracteres e
formatos numéricos portugueses". O formato numérico português usa **vírgula** como
separador decimal — e `1234,56` não é um número JSON válido.

**O que fazemos:** os números vão como números JSON (ponto decimal), que é a única
coisa que o formato permite. Lemos o requisito como aplicando-se ao TEXTO que se
mostra e imprime, e é isso que `formatarMontante()` faz. ✅

**A perguntar:** se a AGT espera os montantes como *strings* com vírgula. Se sim, é
uma alteração de uma linha em `validacao/formatos.ts` — mas tem de ser sabida antes.

---

### #C-08 — `solicitarSerie` chama `"signature"` ao `jwsSignature` ✅

O exemplo de 1.5.1 mostra `"signature": "eyJhbdddddd."`; a tabela 1.5.2 chama-lhe
`jwsSignature`, como todos os outros serviços.

**O que fazemos:** emitimos `jwsSignature`, seguindo a tabela e os outros seis
serviços. Um contra seis.

---

### #C-09 — `sourceDocuments` vs `sourceDocumentList` ✅

A tabela 1.1.2.9 chama à propriedade `sourceDocuments`; o TÍTULO da 1.1.2.10 chama
à mesma coisa `sourceDocumentList`.

**O que fazemos:** emitimos `sourceDocuments` (é o nome que está numa tabela de
campos, não num título) e aceitamos os dois na leitura.

---

### #C-10 — O exemplo de `documents` não é JSON válido ✅

O exemplo de 1.1.1.1 mostra:

```json
"documents": [
    "document": {
      "documentNo": 1,
      ...
```

Um array cujos elementos têm nome. Não é JSON. E a composição 1.1.2.3 descreve
`documents` como "array com a lista de documentos (object document)", o que se lê
como `[{ "document": {...} }]`.

**O que fazemos:** emitimos o array liso de objectos `document` — a única leitura
que produz JSON válido. Na LEITURA aceitamos as duas formas.

**Nota adicional:** o mesmo exemplo mostra `"documentNo": 1` (um número), enquanto a
tabela 1.1.2.4 declara `documentNo` como string de 8 a 60 caracteres com o formato
do SAF-T(AO). Emitimos string.

---

### #C-11 — `listarFacturas`: dois nomes para tudo ✅

| | exemplo (1.3.1) | tabela (1.3.3.1) |
|---|---|---|
| objecto de resposta | `statusFEListResult` | `documentListResult` |
| array | `resultEntryList` | `documentResultList` |
| item | `{ "documentEntryResult": {...} }` | objecto liso |

**O que fazemos:** `cliente/normalizacao.ts` aceita as duas formas. Custa vinte
linhas e evita um deploy para descobrir qual era.

---

### #C-12 — O campo `hash` só existe nos exemplos ⚠️

A resposta de `consultarFactura` (1.4.1) e a de `confirmarRejeitarDocumento` (1.7.1)
mostram um `"hash": "XXXXXXXXX"` dentro de `document`. **Nenhuma tabela de
composição o define** — nem tipo, nem comprimento, nem o que é.

**O que fazemos:** guardamo-lo (`minfin_documento.hash`) se vier. É plausível que
seja o identificador que a lei obriga a imprimir na factura.

**A perguntar:** o que é, como se calcula, e se tem de constar do documento impresso.

---

### #C-13 — `confirmarRejeitarDocumento`: três descrições da mesma resposta ✅

- tabela de saída 1.7.3: o 200 devolve `statusResult`
- composição 1.7.3.1: define `confirmRejectResult` (`actionResultCode`, `errorList`)
- exemplo 1.7.1: devolve `statusFEResult` com `actionIntended` e um `statusResult`
  aninhado — campos que não constam de tabela nenhuma

**O que fazemos:** seguimos a composição (é a única das três que descreve os campos
que a operação precisa de devolver) e aceitamos as outras formas na leitura.

---

### #C-14 — A assinatura de `listarSeries` cobre um campo que não existe ⚠️

A tabela 1.6.2 diz que o `jwsSignature` de `listarSeries` se faz sobre
"`taxRegistrationNumber`" e "`documentNo`". **`listarSeries` não tem `documentNo`** —
é texto copiado de `consultarFactura`, onde a mesma frase faz sentido.

**O que fazemos:** assinamos o NIF sozinho. Inventar um `documentNo` vazio produziria
uma assinatura sobre um valor que ninguém do outro lado sabe reconstruir. ⚠️

**A perguntar:** que campos entram nesta assinatura. Provavelmente
`taxRegistrationNumber` + os filtros preenchidos, mas isso é adivinhar.

---

### #C-15 — `listarSeries`: pedido e resposta trocados no exemplo ✅

A secção 1.6.1 mostra como "exemplo pedido (GET)" um `{ "seriesCode": "FT12025" }`
e como "exemplo resposta (GET)" um objecto que contém `schemaVersion`,
`submissionGUID`, `softwareInfo` e `jwsSignature` — que são campos de PEDIDO.

**O que fazemos:** seguimos as tabelas 1.6.2 e 1.6.3, que estão coerentes com os
outros seis serviços.

---

### #C-16 — `submissionId` é "fornecido pelo barramento", e não se diz como se pede ⚠️

As tabelas de 1.2.2 a 1.7.2 dizem que o identificador da solicitação é "fornecido
pelo barramento". Não há serviço para o pedir, nem indicação de como se obtém.

**O que fazemos:** geramos um que respeita o formato (`ClienteAgt.gerarSubmissionId`).
O pedido não sai sem ele. ⚠️

**A perguntar:** se há um serviço de barramento a chamar primeiro, ou se o
identificador é mesmo nosso para gerar.

---

### #C-17 — Nomes de campo diferentes entre a tabela de totais e a de erros ✅

A tabela 1.1.2.12 define `netTotal` e `grossTotal`. As descrições dos erros E23 e
E24 falam de **`netPayable`** e **`grossPayable`**.

**O que fazemos:** emitimos `netTotal`/`grossTotal`, da tabela de campos. Os textos
de erro do catálogo ficam como estão no documento — mudá-los seria esconder a
divergência à pessoa que um dia vai comparar a nossa mensagem com a deles.

---

### #C-18 — `RG` tem duas designações ✅

`RG - Recibo` em 1.1.2.4; `RG - Outros Recibos Emitidos` em 1.5.2 e 1.6.3.2.

**O que fazemos:** ficamos com a das secções 1.5/1.6 (duas contra uma). É texto de
apresentação — não muda um byte do que sai na chamada.

---

## Ambiguidades de regra de negócio

### #RN-01 — Que sinal levam as linhas: crédito ou débito? ⚠️

O documento nunca diz. O que diz são as regras E16 e E17:

- **E16:** numa nota de crédito, a soma dos créditos tem de ser **inferior** à dos débitos;
- **E17:** em qualquer outro documento, tem de ser **superior**.

Daí segue que uma venda normal usa `creditAmount` e uma nota de crédito usa
`debitAmount` — que é a convenção do SAF-T.

**O que fazemos:** é essa a leitura, e é por ela que `validarTotais()` calcula
`netTotal` esperado (`créditos − débitos`, invertido na NC) e que o mapeamento
emite `creditAmount`. ⚠️

**A perguntar:** confirmar. Se estiver invertido, todas as facturas falham E17.

---

### #RN-02 — Como se apuram os totais de um recibo 🚫

Para `AR`, `RC` e `RG`, o documento diz que `taxPayable`, `netTotal` e
`withholdingTaxAmount` são "apurados somando os valores dos diferentes documentos
origem regularizados pelo recibo, sendo as NC contabilizadas com sinal negativo".

Esses documentos de origem estão no repositório da AGT, não aqui.

**O que fazemos:** **não** verificamos E22 nem E23 em recibos. Verificá-los seria
compará-los contra zero e reprovar todos os recibos válidos. E24
(`grossTotal = netTotal + taxPayable`) continua a ser verificado, porque é
aritmética interna. ✅

**A perguntar:** se o emissor tem de conhecer os totais dos documentos de origem
para os somar, ou se a AGT os apura. Se for a primeira, falta desenhar como este
sistema os guarda.

---

### #RN-03 — Tolerância de arredondamento ⚠️

As regras E21–E25 comparam montantes que passaram por divisões (rateio de desconto
global, extracção de IVA de um preço com imposto incluído, conversão cambial). O
documento não diz com que precisão a comparação é feita.

**O que fazemos:** comparamos em unidades menores (cêntimos), com tolerância de
**uma** unidade. `MINFIN_CASAS_DECIMAIS` ajusta as casas. ⚙️

---

### #RN-04 — `resultCode` invertido entre serviços ✅

- `solicitarSerie` (1.5.3): **1 = sucesso**, 0 = insucesso
- `obterEstado` (1.2.3.1): **0 = melhor caso** (concluído sem facturas inválidas)

Está assim no documento. Registado aqui para ninguém o "corrigir" mais tarde por
parecer um engano.

**Consequência prática, e é a que morde:** um `solicitarSerie` que devolva HTTP 200
com `resultCode: 0` é uma **recusa**, comunicada com sucesso. `ClienteAgt` devolve
`ok: true` (a chamada correu) e `dados.sucesso: false` (a série não foi criada).
Confundir os dois cria séries que a AGT nunca registou — há um cenário no simulador
só para isto.

---

### #RN-05 — Quando é que se pode voltar a chamar `obterEstado` ⚠️

A validação é diferida "de acordo com a capacidade e programação dos processamentos
batch" (1.1.4). O documento não diz quanto tempo demora, nem qual é o intervalo
mínimo entre chamadas — mas define E97 ("solicitação prematura") e E98 ("demasiadas
solicitações repetidas") para quem se enganar.

**O que fazemos:** primeira consulta 1 minuto depois; a seguir, recuo exponencial
(1, 2, 4, 8, 16, 32, 60...) com tecto de uma hora. `minfin_submissao.tentativas_estado`
guarda a contagem. ⚠️

**A perguntar:** o intervalo mínimo e o tempo típico de processamento.

---

### #RN-06 — `taxExemptionCode` é obrigatório em NS, mas e em ISE? ⚠️

1.1.2.6 torna o código de isenção obrigatório quando `taxType = NS`. Não diz nada
sobre `taxCode = ISE` (isento), que é a outra forma de uma linha não levar imposto.

**O que fazemos:** exigimos o código só no caso escrito (NS). ⚠️

---

### #RN-07 — `taxCode` de IS e IEC não é um conjunto fechado ✅

Para `IVA` há cinco valores. Para `IS` é "a verba de IS" (anexo 2.3) e para `IEC` é
"o código pautal" (anexo 2.2) — duas tabelas legais que mudam por diploma.

**O que fazemos:** validamos a FORMA (2 a 10 caracteres, `ISE` sempre aceite) e
deixamos o valor à AGT. Congelar as tabelas em TypeScript garantiria só uma coisa:
que uma verba nova era recusada pelo nosso validador antes de chegar a eles.

---

### #RN-08 — Que ano é que "após 15 de Dezembro" inclui ⚠️

1.5.2: "De 1 de Janeiro até 15 de Dezembro é possível criar séries somente para o
ano de sistema, após essa data é possível criar séries para o ano de sistema e para
o ano imediatamente posterior."

O dia 15 é o limite escrito de um intervalo que começa a 1 de Janeiro; "após essa
data" começa onde?

**O que fazemos:** a janela do ano seguinte abre **a 15 de Dezembro, inclusive**. Um
intervalo que excluísse as duas pontas deixava o próprio dia 15 sem regra nenhuma. ⚠️

---

## Transporte

### #T-01 — Quatro serviços são GET com corpo JSON 🚫

`obterEstado`, `listarFacturas`, `consultarFactura` e `listarSeries` são definidos
como **GET**, e os exemplos mostram um corpo JSON com o envelope completo
(`schemaVersion`, `softwareInfo`, `jwsSignature`, ...).

Dois problemas, e o segundo é o grave:

1. **O `fetch()` do Node recusa-se a fazê-lo** — `TypeError: Request with GET/HEAD
   method cannot have body`. A especificação do Fetch proíbe. O HTTP/1.1 não.
   Resolvido usando `node:http` directamente (`transporte/http.ts`).

2. **A infra-estrutura descarta corpos de GET.** Proxies, WAFs, balanceadores e
   caches fazem-no com frequência — e quando o fazem, o pedido chega à AGT vazio e
   volta com um erro de estrutura que não diz que o corpo se perdeu pelo caminho.

**O que fazemos:** três estratégias em `MINFIN_ESTRATEGIA_GET` ⚙️

| valor | o que faz |
|---|---|
| `corpo-em-get` (omissão) | GET com corpo, literalmente o que o documento pede |
| `post` | POST com o mesmo corpo + `X-HTTP-Method-Override: GET` |
| `query` | campos de topo na query string, sem corpo |

**A perguntar:** confirmar que o ambiente deles aceita mesmo GET com corpo, e o que
usar se não aceitar. É a segunda pergunta mais importante, depois de #C-02.

---

### #T-02 — Não há endpoints 🚫

O documento entrega os sete endpoints assim:

```
Testes:    http://xxx.xxx.xxx.xxx:yyyy/facturaElectronica/registarFactura/
Produção:  http://xxx.xxx.xxx.xxx:yyyy/facturaElectronica/registarFactura/
```

Sem endereço, sem porta. E `http`, não `https` — apesar de a tabela
"Características do Serviço" dizer `https` no protocolo de comunicação, e de o
requisito de segurança ser "autenticação e autorização, com criptografia".

**O que fazemos:** o endereço vem de `MINFIN_BASE_URL` e o módulo recusa-se a
arrancar sem ele. O caminho de cada serviço é `<base>/<nomeDoServico>/`, com a
barra final que os exemplos mostram. Tudo o resto é exercitado contra o servidor
simulado (`simulador/`). ⚙️

**A perguntar:** endereços de testes e de produção, esquema (http ou https),
certificado, e **como é feita a autenticação** — o documento diz "autenticação e
autorização, com criptografia" e não descreve nenhum mecanismo. Não há cabeçalho
`Authorization` em nenhum exemplo. Sem isto não há integração.

---

## Decisões nossas por confirmar

### #D-01 — Cada empresa é um contribuinte, e a chave é uma só 🚫

O Blueprint distingue a chave do **produtor de software** (nossa, uma) da chave do
**emissor** (do contribuinte que factura). Este backend é multi-inquilino: cada
`empresa` é um contribuinte diferente, com o seu NIF e a sua chave.

Uma única `MINFIN_CHAVE_EMISSOR` no ambiente serve uma instalação de um só
contribuinte, e assinaria as facturas de todos os inquilinos com a chave de um deles.

**O que fazemos:** a resolução de credenciais é uma interface
(`repositorios/credenciais.ts`). A implementação por omissão **recusa-se a assinar**
em nome de um contribuinte diferente do configurado, com a mensagem a dizer o que
falta. Falha alto em vez de assinar com a chave errada. 🚫

**Por decidir:** onde vivem as chaves privadas dos inquilinos (coluna cifrada? KMS?
HSM?), quem as pode ler, como se rodam, e como a AGT as entrega. Nenhuma dessas
perguntas é técnica sozinha.

---

### #D-02 — Os preços deste sistema incluem IVA ✅

`relatorios_repository.ivaLiquidado()` extrai o imposto de um total que já o
contém (`iva = total × pct / (100 + pct)`). Todos os montantes do Blueprint são
**líquidos**, com o imposto à parte.

`mapeamento/factura_para_documento.ts` faz a conversão. Traduzir errado aqui não dá
erro nenhum: dá uma factura comunicada com valores plausíveis e 14% acima do que
foi cobrado.

Os totais comunicados são **somados a partir das linhas já arredondadas** (para E22
a E24 baterem certo por construção), e a diferença face ao total interno é reportada
como aviso.

---

### #D-03 — Uma factura anulada e uma factura inválida não são a mesma coisa ✅

O Blueprint chama `documentStatus` a dois campos diferentes:

| onde | valores | o que é |
|---|---|---|
| 1.1.2.4, na entrada | `N`, `S`, `A`, `R` | o que NÓS declaramos |
| 1.2.3.2, na saída | `V`, `I` | o veredicto da AGT |

Um documento pode ser `A` (anulado por nós) e `V` (validamente comunicado) ao mesmo
tempo — anular uma factura é uma comunicação legítima. São duas colunas em
`minfin_documento` (`document_status` e `veredicto`) e dois tipos em TypeScript.
