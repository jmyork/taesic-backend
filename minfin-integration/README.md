# minfin-integration

Integração com os serviços de **facturação electrónica da AGT** (Administração
Geral Tributária de Angola), segundo o *Blueprint do Serviço de Facturação
Electrónica* **v1.5** — projecto AGT 4.0 / SIGT.

Todo o módulo vive nesta pasta. Fora dela existem **quatro linhas de registo**, e
nenhuma contém lógica de integração — estão listadas no fim, em
[Pontos de registo](#pontos-de-registo).

---

## Estado: pronto a ligar, **por ligar**

O Blueprint entrega os endpoints assim:

```
Testes:    http://xxx.xxx.xxx.xxx:yyyy/facturaElectronica/registarFactura/
Produção:  http://xxx.xxx.xxx.xxx:yyyy/facturaElectronica/registarFactura/
```

Sem endereço, sem porta, sem certificado, sem mecanismo de autenticação descrito,
e sem número de certificação de software. **Não é possível fazer uma única chamada
real hoje.**

O que ESTÁ feito e verificado a correr: montar o envelope, assinar, validar as 20
regras de negócio verificáveis localmente, serializar, atravessar um socket, ler a
resposta nas duas formas que o documento descreve, classificar cada modo de falha,
e gravar tudo. **112 testes**, contra um servidor que finge ser a AGT.

O que falta para produção está em [O que falta](#o-que-falta-para-produção), e as
perguntas a fazer à AGT estão em [`DIVERGENCIAS.md`](./DIVERGENCIAS.md).

---

## Comece por aqui

```bash
# Correr os cenários — não precisa de base de dados, .env, nem app a arrancar
npx tsx minfin-integration/simulador/executar.ts

# Só um grupo
npx tsx minfin-integration/simulador/executar.ts Rede
npx tsx minfin-integration/simulador/executar.ts Falhas

# O mesmo, dentro do Japa
node ace test minfin
```

Os dois correm **os mesmos cenários** (`simulador/cenarios.ts`) — escrevê-los duas
vezes garantiria que as duas versões divergem.

---

## Como está organizado

```
minfin-integration/
├── configuracao.ts          lê o ambiente, valida, falha com mensagens úteis
├── dominio/                 o vocabulário do Blueprint
│   ├── tipos_documento.ts     FT, FR, NC, RC... e quais levam recibo em vez de linhas
│   ├── estados.ts            documentStatus, resultCode, seriesStatus, acções
│   ├── impostos.ts           IVA/IS/IEC/NS, códigos, retenções na fonte
│   ├── isencoes_iva.ts       anexo 2.4 — os 38 códigos M** e a menção legal de cada
│   └── codigos_erro.ts       E01–E99, indexados POR SERVIÇO (ver DIVERGENCIAS #C-04)
├── contratos/contratos.ts   as formas JSON dos sete serviços
├── validacao/
│   ├── formatos.ts          predicados de formato e aritmética de dinheiro
│   └── regras.ts            as regras E01–E43 verificáveis antes de a chamada sair
├── assinatura/jws.ts        as três assinaturas, como estratégia substituível
├── transporte/http.ts       GET com corpo, timeouts, as três estratégias
├── cliente/
│   ├── cliente_agt.ts       ← A CLASSE. Sete métodos, um por serviço
│   └── normalizacao.ts      lê as respostas nas duas grafias do documento
├── mapeamento/              factura interna → document da AGT (converte IVA incluído)
├── models/                  minfin_submissao, minfin_documento, minfin_serie
├── migrations/              as três tabelas, re-executáveis (regra 7.19)
├── repositorios/
│   ├── credenciais.ts       de quem é a chave que assina (ver #D-01)
│   └── minfin_repository.ts a ponte entre o cliente e a base de dados
├── servicos/minfin_service.ts   a fachada — é isto que o resto da aplicação importa
├── comandos/                a varredura periódica (node ace minfin:sincronizar)
├── simulador/               um servidor que finge ser a AGT + 82 cenários
├── testes/                  as specs do Japa
└── DIVERGENCIAS.md          ⚠️ LEIA ISTO antes de falar com a AGT
```

---

## A classe

```ts
import { ClienteAgt } from './minfin-integration/cliente/cliente_agt.js'

const cliente = new ClienteAgt()

const r = await cliente.registarFacturas([documento])

if (r.ok) {
  console.log(r.dados.requestID)   // guardar — o veredicto vem depois
} else {
  console.log(r.tipo)              // validacao-local | recusado | indisponivel | resposta-invalida
  console.log(r.repetivel)         // vale a pena tentar outra vez?
  console.log(r.erros)             // [{ codigo: 'E22', descricao: '...', documentNo }]
}
```

Sete métodos, um por serviço:

| método | serviço | tipo |
|---|---|---|
| `registarFacturas(documentos)` | `registarFactura` | POST, **assíncrono** |
| `obterEstado(requestID)` | `obterEstado` | GET |
| `listarFacturas(inicio, fim)` | `listarFacturas` | GET |
| `consultarFactura(documentNo)` | `consultarFactura` | GET |
| `solicitarSerie({...})` | `solicitarSerie` | POST |
| `listarSeries({...})` | `listarSeries` | GET |
| `confirmarRejeitarDocumento(documentNo, 'C'\|'R')` | `confirmarRejeitarDocumento` | POST |

### A decisão que molda tudo: isto **não lança** por falha da AGT

Um serviço do Estado em baixo, um timeout, um 429 — nada disso é uma excepção.
São respostas, e vêm num `Resultado` que quem chama tem de abrir.

A razão é a mesma que já está escrita em `app/repositories/nif_repository.ts`
deste projecto: **quem chama isto está a meio de uma venda.** Se a integração
lançar, o `try/catch` mais próximo decide o destino da factura — e o mais próximo
é quase sempre um que não sabe nada de facturação electrónica.

Lança em dois casos, ambos de programação e não de operação: configuração inválida
e assinatura pedida sem chave.

---

## O fluxo, e porque é que ele tem duas metades

`registarFactura` é **assíncrono**. A chamada devolve um `requestID` e mais nada:

```
1. registarFacturas([...])  →  requestID          (a chamada acabou; não se sabe nada)
                                    ↓
2.                          ...horas depois...
                                    ↓
3. obterEstado(requestID)   →  resultCode 8       (ainda a processar — voltar mais tarde)
   obterEstado(requestID)   →  resultCode 0/1/2   (agora sim: V ou I, documento a documento)
```

**A AGT não avisa ninguém.** Não há callback, não há webhook, não há nada no
Blueprint que aponte para o nosso lado. Alguém tem de perguntar — e é isso que
`node ace minfin:sincronizar` faz:

```bash
node ace minfin:sincronizar              # a varredura
node ace minfin:sincronizar --simular    # o que seria consultado, sem chamar
node ace minfin:sincronizar --limite=200
```

Por cron externo, como `estoque:check-alertas`. De cinco em cinco minutos é um
ponto de partida; quem decide o ritmo real é a coluna `proxima_consulta_em` de cada
submissão (recuo exponencial até uma hora), e a varredura só toca nas vencidas —
correr mais vezes não faz mais chamadas à AGT.

**Sem esta varredura, cada submissão fica "aceite" para sempre e ninguém sabe se as
facturas passaram.** Não é um relatório em falta: é a diferença entre ter facturado
e ter facturado validamente.

---

## Variáveis de ambiente

```bash
# ── Obrigatórias ─────────────────────────────────────────────────────────────
MINFIN_BASE_URL=https://sigt.minfin.gv.ao:8443/facturaElectronica
MINFIN_NIF=5000000000
MINFIN_SOFTWARE_NOME=taesic
MINFIN_SOFTWARE_VERSAO=1.0.0
MINFIN_SOFTWARE_CERTIFICACAO=123456789      # atribuído pela AGT; sem ele → E07

# Chaves privadas em PEM. Cada uma aceita o PEM literal ou <NOME>_FILE com um caminho.
MINFIN_CHAVE_PRODUTOR_FILE=/etc/taesic/minfin/produtor.pem
MINFIN_CHAVE_EMISSOR_FILE=/etc/taesic/minfin/emissor.pem

# ── Opcionais ────────────────────────────────────────────────────────────────
MINFIN_SCHEMA_VERSION=1.0
MINFIN_NOMENCLATURA=exemplos          # exemplos | tabelas       — DIVERGENCIAS #C-02
MINFIN_ESTRATEGIA_GET=corpo-em-get    # corpo-em-get | post | query — #T-01
MINFIN_TIMEOUT_MS=30000
MINFIN_CASAS_DECIMAIS=2
MINFIN_REGISTAR_PAYLOADS=true         # ⚠️ guarda pedidos e respostas na BD
```

**Nenhuma tem valor por omissão perigoso.** O módulo recusa-se a arrancar sem as
obrigatórias, e a mensagem diz exactamente quais faltam e porquê.

⚠️ `MINFIN_REGISTAR_PAYLOADS=true` grava o pedido completo em
`minfin_submissao.pedido_json` — incluindo as assinaturas e os dados fiscais dos
clientes. Num ambiente com dados reais, essa tabela fica sujeita às mesmas regras
de retenção que `activity_logs`.

### Validação no arranque (opcional)

A configuração é validada na primeira utilização, não na importação. Para a ter
validada no arranque da aplicação, acrescente a `start/env.ts`:

```ts
MINFIN_BASE_URL: Env.schema.string.optional(),
MINFIN_NIF: Env.schema.string.optional(),
MINFIN_SOFTWARE_NOME: Env.schema.string.optional(),
MINFIN_SOFTWARE_VERSAO: Env.schema.string.optional(),
MINFIN_SOFTWARE_CERTIFICACAO: Env.schema.string.optional(),
MINFIN_NOMENCLATURA: Env.schema.enum.optional(['exemplos', 'tabelas'] as const),
MINFIN_ESTRATEGIA_GET: Env.schema.enum.optional(['corpo-em-get', 'post', 'query'] as const),
MINFIN_TIMEOUT_MS: Env.schema.number.optional(),
MINFIN_CASAS_DECIMAIS: Env.schema.number.optional(),
MINFIN_REGISTAR_PAYLOADS: Env.schema.boolean.optional(),
```

Nada no módulo muda com isso.

---

## O simulador

`simulador/servidor_agt_simulado.ts` é um servidor HTTP que responde aos sete
serviços com as formas e os modos de falha do documento. Existe porque, sem ele,
tudo isto seria "deve funcionar" — e este projecto tem uma regra escrita contra
isso (CLAUDE.md, secção 1).

Cenários disponíveis: `sucesso`, `sucesso-forma-de-exemplo` (a outra grafia do
documento), `erro-de-validacao` (400 com `errorList`), `nif-diferente` (422 E95),
`prematura` (422 E97), `em-processamento` (422 E96), `demasiadas-solicitacoes`
(429 E98), `erro-de-estrutura` (400 E96), `avaria` (500), `corpo-nao-json`,
`sem-resposta` (timeout).

Mais `ciclosDeProcessamento`, que modela a validação diferida: quantas chamadas a
`obterEstado` respondem `resultCode: 8` antes de o veredicto sair.

O servidor **regista o que recebeu**, incluindo `trouxeCorpo` — a pergunta que
justifica metade do ficheiro do transporte (ver `DIVERGENCIAS.md` #T-01).

### Bugs que os cenários já apanharam

Não é decoração. Ao correr os cenários pela primeira vez, três falharam:

1. **`errorEntry` como objecto único.** As tabelas de saída do documento dizem
   "Object errorEntry" no singular para os 400/422/429, enquanto 1.1.3 diz "array
   errorList" para o 400 do `registarFactura`. A normalização só aceitava arrays —
   e os cinco erros de chamada (E94–E98) chegavam todos como "E99, sem detalhe".
2. **Um corpo sem códigos de erro inventava um erro** de código e descrição vazios,
   pelo caminho de recurso que passa o corpo inteiro ao leitor de erros.
3. Um cenário meu mal construído (um total negativo, que era recusado por E02 antes
   de a regra que eu queria exercitar chegar a correr).

Os dois primeiros estão corrigidos e têm cenário próprio a fixá-los.

---

## O que falta para produção

| # | o quê | quem responde |
|---|---|---|
| 🚫 | **Endereços, esquema e certificado** dos ambientes de testes e produção | AGT |
| 🚫 | **Como se autentica** — o documento diz "autenticação e autorização, com criptografia" e não descreve nenhum mecanismo. Não há `Authorization` em nenhum exemplo | AGT |
| 🚫 | **Número de certificação do software** | AGT (processo de certificação) |
| 🚫 | **Formato exacto das assinaturas** e o que significam os 256 caracteres (`DIVERGENCIAS.md` #C-03) | AGT |
| 🚫 | **Qual das duas grafias** vale (#C-02) — a resposta errada faz todas as chamadas falharem | AGT |
| 🚫 | **Onde vivem as chaves privadas dos inquilinos** (#D-01) | decisão interna |
| ⚠️ | Confirmar que o ambiente deles aceita GET com corpo (#T-01) | AGT |
| ⚠️ | Ritmo mínimo entre chamadas a `obterEstado` (#RN-05) | AGT |
| ⚠️ | Confirmar o sentido crédito/débito das linhas (#RN-01) | AGT |
| ⚠️ | Correr as migrações — **ainda não foram executadas** (não havia MySQL disponível) | interno |

---

## Multi-inquilino: por decidir

O Blueprint distingue duas chaves privadas:

- **`jwsSoftwareSignature`** → chave do **produtor de software**. É nossa, é uma só.
- **`jwsDocumentSignature`** e **`jwsSignature`** → chave do **emissor**, o
  contribuinte que factura.

Este backend é um SaaS multi-inquilino: cada `empresa` é um contribuinte
**diferente**, com o seu NIF e a sua chave. Uma única `MINFIN_CHAVE_EMISSOR` no
ambiente serve uma instalação de um só contribuinte — e assinaria as facturas de
todos os inquilinos com a chave de um deles.

**Isto não foi resolvido a adivinhar.** Guardar chaves privadas de terceiros exige
decisões que não são técnicas: onde ficam (coluna cifrada? KMS? HSM?), quem as pode
ler, como se rodam, e o que acontece quando uma expira a meio de um dia de
facturação. E exige saber como a AGT as entrega — o documento não diz.

O que existe é a fronteira: `repositorios/credenciais.ts` define a interface, e a
implementação por omissão (`CredenciaisDoAmbiente`) **recusa-se a assinar** em nome
de um contribuinte diferente do configurado, com a mensagem a dizer o que falta.
Falha alto em vez de assinar com a chave errada — que não daria erro nenhum e
atribuiria a facturação de uma empresa a outra.

Para ligar, implemente `ResolvedorDeCredenciais` e passe-o ao serviço:

```ts
new MinfinService({ credenciais: new MinhasCredenciais() })
```

---

## Ligar ao fluxo de venda

**Nada neste módulo está ligado ao fluxo de facturação existente.** É deliberado:
ligar `factura_repository.emitir()` a isto muda o comportamento de um caminho que
já está em produção, e essa é uma decisão a tomar com os endereços na mão.

Quando for para ligar, o caminho é:

```ts
import MinfinService from './minfin-integration/servicos/minfin_service.js'
import { facturaParaDocumento } from './minfin-integration/mapeamento/factura_para_documento.js'

const { documento, avisos } = await facturaParaDocumento(factura.id, companyAlias, {
  serie: 'FT12025',       // série JÁ registada na AGT — ver solicitarSerie
  eacCode: '47730',
})

const { submissao, resultado } = await new MinfinService().registarFacturas(companyAlias, [
  { documento, factura_id: factura.id },
])
```

Três coisas a saber antes:

1. **Uma série tem de estar registada na AGT antes do primeiro documento** (E34).
   `MinfinService.solicitarSerie()` e `serieUtilizavel()`.
2. **Os preços deste sistema incluem IVA** e os da AGT não. O mapeamento converte,
   e avisa quando o total comunicado difere do total interno por arredondamento
   (`DIVERGENCIAS.md` #D-02).
3. **A submissão é gravada ANTES de sair.** Se o processo morrer entre o envio e a
   resposta, fica rasto da tentativa e do `submissionGUID` usado — senão a repetição
   gera um identificador novo, a AGT vê duas submissões das mesmas facturas, e a
   segunda volta com E09 para todas.

---

## Base de dados

Três tabelas, todas com prefixo `minfin_`, isoladas por `empresa_id`:

| tabela | uma linha por | para quê |
|---|---|---|
| `minfin_submissao` | chamada a `registarFactura` | guardar o `requestID` e o estado do ciclo assíncrono |
| `minfin_documento` | documento dentro de uma submissão | o veredicto é **por documento**, não por submissão |
| `minfin_serie` | série de numeração | não depender de uma chamada de rede para saber se se pode emitir |

As migrações são **re-executáveis** (perguntam ao `information_schema` antes de
alterar), como manda a regra 7.19 do CLAUDE.md, e alinham charset/collation antes
de criar cada chave estrangeira (7.20.2). As chaves estrangeiras são criadas à
parte e a falha é tolerada com aviso — o que pode falhar vem depois do que torna a
tabela utilizável (7.20.1).

```bash
node ace migration:status     # ver antes
node ace migration:run        # em produção: --force
```

---

## Pontos de registo

As únicas quatro linhas deste módulo que vivem fora desta pasta. Nenhuma contém
lógica de integração:

| ficheiro | o quê | porquê |
|---|---|---|
| `config/database.ts` | `'minfin-integration/migrations'` no array `paths` | o Lucid só descobre migrações nos caminhos configurados |
| `adonisrc.ts` | a suite `minfin` em `tests.suites` | o Japa só corre suites declaradas |
| `commands/minfin_sincronizar.ts` | `export { default } from '../minfin-integration/comandos/...'` | o Adonis varre `commands/` por directório, não por configuração |
| `.env` | as variáveis `MINFIN_*` | não é versionado |

---

## Fonte

*Serviços de Facturação Electrónica v1.5* — Blueprint do Serviço de Facturação
Electrónica, projecto AGT 4.0, SIGT (Sistema Integrado de Gestão Tributária),
52 páginas.

Contacto de notificação de erros indicado no documento:
`monitoramento.integracao@minfin.gv.ao`
