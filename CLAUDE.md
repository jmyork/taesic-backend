# taesic-backend — regras de trabalho para o Claude

Backend AdonisJS 7 + Lucid (MySQL) + VineJS + Bouncer + Japa. SaaS multi-tenant de
faturação/POS: `empresa` → `user` (com `papel`/`permissao`) → `pos` → `produtos`/`lote` →
`caixa` → `vendas`/`venda_itens` → `vendapagamento`, tudo isolado por `company_alias`.
~48 repositórios, 55 controladores, RBAC próprio (`permission_middleware` por nome de
rota) complementado por Bouncer policies pontuais.

Este ficheiro é o contrato para **qualquer tarefa de testar/corrigir funcionalidade ou
segurança** neste repositório. As regras abaixo não são sugestões — são a definição de
"feito" para este projecto.

## 1. Nada se assume a funcionar sem teste

- Nenhuma alteração (bugfix, feature, refactor) é dada como concluída sem correr
  `node ace test` e `npm run typecheck`, e ver o resultado real — nunca "deve funcionar".
- Antes de corrigir um bug, escrever primeiro o teste que o reproduz (falha → corrige →
  passa). Padrão a seguir: `tests/functional/tenant_isolation.spec.ts` (isolamento
  multi-tenant), `tests/functional/empresa_clean_expired.spec.ts` e
  `tests/functional/validate_company_alias_middleware.spec.ts` (bugs corrigidos nesta
  sessão, ver secção 7).
- `tests/unit/modules_load.spec.ts` é a rede de segurança mais barata deste projecto:
  importa dinamicamente **todos** os ficheiros de `app/repositories`, `app/policies`,
  `app/services`, `app/controllers` e `app/validators` e falha se algum não carregar.
  Foi assim que se confirmou (e corrigiu) que ~14 repositórios/policies importavam o
  modelo errado (secção 7) — um bug que nenhum teste funcional apanhava porque essas
  rotas nunca chegavam a ser exercitadas. **Sempre que criar um ficheiro novo nestas
  pastas, este teste corre automaticamente sobre ele — não precisa de ser editado.**
  Continua a ser só um smoke test de "carrega sem rebentar"; não substitui testes
  funcionais para comportamento.
- Exemplo do que "assumir sem testar" produzia (já corrigido, mantido aqui como
  referência do género de bug a procurar): `commands/empresa_clean_expired.ts` filtrava
  por `empresa.verifiyed` (nome errado) e por uma coluna que só existe em
  `verification_token_hash` — falhava com erro de SQL sempre que corria, nunca apagou
  nada em produção. A lógica foi movida e corrigida em
  `EmpresaRepository.deleteExpiredUnverified()`, com teste próprio.

## 2. Reutilização antes de reinvenção

- Antes de escrever repositório/serviço/controller/DTO/validator novo, olhar para um
  par existente e seguir a mesma forma.
- `app/repositories/base_repository.ts` é agora uma `BaseRepository<Model, CreateDTO,
  UpdateDTO>` genérica real (paginate/findOrFail/create/update/softDelete) com um hook
  `scopeToTenant(query, companyAlias)` para isolamento por `company_alias` — sobrescrever
  esse método é a ÚNICA coisa que um repositório por-empresa precisa de fazer (ver
  `cliente_repository.ts` ou `vendapagamento_repository.ts` como exemplos: coluna directa
  vs. cadeia de vários joins). 19 repositórios que eram cópia exacta do template
  (`papel`, `permissao`, `plano`, `papel_permissao`, `user_papel`, os 6 `project_*`,
  `empresa_conta_bancaria`, `empresa_token_activacao`, e os 5 com tenant-scoping —
  `cliente`, `pessoa`, `subscricao`, `cobranca`, `vendapagamento`) já foram migrados.
- **Nem todos os repositórios devem estender `BaseRepository`.** ~29 repositórios
  (`caixa`, `vendas`, `estoque`, `produtos`, `metodopagamento`, `userpos`, `marca`,
  `pos`, `categorias_produtos`, os `produto_*`, `cupom`, `factura`, `promotor*`,
  `metricas`, `produtos_reembolso`, `venda_itens`, `verification_token_hash`,
  `auth_repository`, etc.) têm `paginate()`/lógica de negócio genuinamente
  específicas (filtros ricos por DTO, transações, geração de código único, numeração
  sequencial) que não cabem na assinatura genérica sem perder comportamento. Forçar
  esses casos para `BaseRepository` é o tipo de "reutilização" que o projecto NÃO quer —
  ver a experiência registada na secção 7. Só consolidar se: (a) o método a mover é
  1:1 idêntico a outro já migrado, e (b) existe teste a cobrir o repositório antes de
  mexer.
- Dentro de um único repositório, deduplicar é sempre mais seguro do que entre
  repositórios — ex.: `caixa_repository.ts` tinha ~150 linhas de filtros repetidas entre
  `paginate()` e `listByUser()`, extraídas para `applyFilters()` privado (mesmo ficheiro,
  mesmo teste, zero risco cruzado).
- Reaproveitar `app/helpers/Utils.ts` (`userHasPermission`, `giveRoleToUser`,
  `IsUserAnAdmin`, etc.) em vez de reimplementar checks de papel/permissão.

## 3. Repetitivo → comando ace existente, não script à parte

Já existem comandos dedicados para tudo o que é repetitivo neste projecto. **Usar/
estender estes antes de criar scripts novos ou editar recursos à mão:**

| Comando | Ficheiro | Para quê |
|---|---|---|
| `make:enterprise:resource <Nome...>` | `commands/make_enterprise_resource.ts` | Gera model, migration, DTO, validator, repository (extends `BaseRepository`), service, controller, rota autenticada e policy para um recurso novo |
| `resource:sync Modelo:campo:tipo,...` | `commands/resource_sync.ts` | Cria o recurso (se não existir) e sincroniza campos no model/DTO/validator + gera migration |
| `resource:remove-field Modelo:campo,...` | `commands/resource_remove_field.ts` | Remove campos de um recurso já criado (model, DTO, validator + migration de remoção) |
| `remove:enterprise:resource <Nome...>` | `commands/remove_enterprise_resource.ts` | Remove por completo um recurso gerado |
| `db:fresh:seed` | `commands/fresh_and_seed.ts` | `migration:fresh` + todos os seeders |
| `seed:qa-tenant` | `commands/seed_qa_tenant.ts` | Empresa+user Admin idempotentes para testes de UI/Playwright |
| `empresa:clean:expired` | `commands/empresa_clean_expired.ts` | Remove empresas não activadas cujo token expirou (corrigido, ver secção 7) |
| `estoque:check-alertas` | `commands/estoque_check_alertas.ts` | Emite `LoteValidadeProxima` para lotes perto da validade (correr via cron externo, diariamente) |
| `permissao:conceder <alvo> <papeis...>` | `commands/permissao_conceder.ts` | Atribui permissões a papéis sem duplicar. `<alvo>` é um nome exacto (`domain_x.store`, cria-o se não existir) ou um recurso (`domain_x`) com `--leitura` (.index .show), `--escrita` (.store .update .destroy) ou `--tudo`. Aceita vários recursos por vírgula e `--simular` |
| `permissao:revogar <alvo> <papeis...>` | `commands/permissao_revogar.ts` | O simétrico: retira permissões a papéis (mesmos modos). `--simular` para ver antes; `--forcar` obrigatório em `Admin`/`Platform_Admin`. Nunca apaga a permissão do catálogo nem toca noutros papéis |

Se aparecer uma nova tarefa repetitiva, a resposta correcta é estender um destes
comandos ou criar um novo `BaseCommand` em `commands/`, não repetir a operação
manualmente várias vezes.

### 3.1 O gerador ainda não faz isolamento por tenant automaticamente

`make:enterprise:resource` gera repositórios que estendem `BaseRepository`, mas
**`scopeToTenant` fica comentado por omissão** — o template deixa um exemplo pronto a
descomentar, mas exige uma decisão humana: este recurso pertence a uma empresa
(`empresa_id`/`company_alias`) ou é de plataforma? Antes de expor um recurso novo por
`companydomainroutes.ts`, confirmar que `scopeToTenant` foi implementado e que existe
teste tipo `tests/functional/tenant_isolation.spec.ts` a prová-lo. A rota gerada em
`start/routes.ts` já exige autenticação (`middleware.auth`) por omissão, mas isso não
substitui o isolamento por tenant nem RBAC — ver checklist da secção 4.

## 4. Checklist de segurança obrigatório por endpoint/repositório tocado

Ao mexer em qualquer rota ou repositório, verificar explicitamente (não assumir que o
middleware genérico já cobre):

1. **Autenticação** — rota usa `middleware.auth({ guards: ['api'] })` quando não é
   pública (guard configurado é `tokensGuard` em `config/auth.ts`).
2. **Isolamento multi-tenant** — o repositório filtra por `company_alias` (via
   `scopeToTenant` em `BaseRepository`, ou à mão como em `vendas_repository.ts`)?
   Recursos por-empresa nunca podem ser lidos/alterados por outro tenant só por
   adivinhar o `id`.
3. **Autorização** — RBAC por rota via `permission_middleware.ts` e/ou Bouncer policy
   (`app/policies/`, registadas em `app/policies/main.ts`) para regras por-registo.
   Policies geradas por `make:enterprise:resource` nascem **vazias** (`extends
   BasePolicy {}`, sem métodos) — chamar `bouncer.authorize()` contra uma policy vazia
   rebenta em vez de bloquear; preencher os métodos (`store`/`update`/`delete`/...)
   antes de usar Bouncer nesse controller.
4. **Validação de entrada** — payload passa por `request.validateUsing(<validator>)`
   (VineJS), nunca por `request.all()`/`request.body()` direto para o repositório.
5. **Mass assignment / parâmetro `deleted`/`all`** — os `index` gerados aceitam
   `?deleted=all|deleted` sem restrição; confirmar que isto não expõe registos
   apagados/de outra empresa em rotas não administrativas.
6. **Fuga de erro** — não devolver stack traces nem mensagens internas ao cliente; sem
   `console.log`/`console.error` de debug em código a caminho de produção.
7. **Mascarar erros reais** — nunca envolver uma query inteira num try/catch genérico
   que transforma qualquer excepção (incluindo falhas de infra/BD) na mesma resposta de
   "não encontrado" — isso escondia bugs reais em `validate_company_alias_middleware.ts`
   (corrigido). Deixar erros inesperados propagar para o exception handler global.
8. **Segredos** — nunca commitar `.env`; `bdE.sql` e os dumps na raiz
   (`dump-auth_system-*.sql`, `stock_gest_db.sql`) parecem exports de BD com dados reais
   — não usar como fixture de teste nem assumir que podem ser publicados/commitados sem
   verificar o conteúdo primeiro.

## 5. Fluxo obrigatório para "testar e corrigir uma área"

1. Levantar todos os ficheiros relacionados (`model` → `repository` → `service` →
   `controller` → `validator` → `policy` → rota em `start/routes.ts` ou
   `companydomainroutes.ts`).
2. Escrever/actualizar teste funcional em `tests/functional/` que reproduza o
   comportamento esperado (e o bug, se for correcção), usando os fixtures de
   `tests/helpers/fixtures.ts` (`createTenant`, `createEmpresa`, etc.) em vez de duplicar
   setup de BD. Lógica pura (sem BD) vai para `tests/unit/`.
3. Corrigir a causa raiz — preferir consolidar em `BaseRepository`/`Utils.ts`/no
   gerador (secções 2 e 3) em vez de aplicar o mesmo patch em N ficheiros, MAS só
   consolidar entre repositórios quando o comportamento é genuinamente idêntico (ver o
   limite explicado na secção 2 — não forçar repositórios com lógica de negócio própria
   a caber num molde genérico).
4. Correr a suite completa (`node ace test`) e `npm run typecheck` — não só o teste
   novo — para apanhar regressões cruzadas.
5. Se o mesmo padrão de correcção se repetir em 3+ recursos, extrair para comando ace
   ou para `BaseRepository`/helper partilhado.
6. No resumo da tarefa, dizer exactamente o que foi testado e o que ficou por testar —
   nunca reportar uma área como corrigida só por leitura de código.

## 6. Convenções a manter

- Aliases de import (`#controllers/*`, `#repositories/*`, `#dtos/*`, etc., definidos em
  `package.json` → `imports`) em vez de caminhos relativos longos.
- **Cuidado com os subdirectórios de `app/models/`** — nem todos os models vivem direto
  em `app/models/`: RBAC (`papel`, `permissao`, `papel_permissao`, `user_papel`) vive em
  `app/models/auth/`; `project*` vive em `app/models/authplatform/`; os modelos de
  faturação "reais" (produtos, vendas, venda_itens, estoque, lote, pos, etc.) vivem em
  `app/models/faturacao/`. Ao escrever um import `#models/X` ou um import relativo entre
  models, confirmar o caminho E A CASING reais primeiro — o Windows tolera casing
  errado (case-insensitive), o Linux/CI não. `tests/unit/modules_load.spec.ts` apanha
  isto se errar (ver secção 7).
  **`resource:sync` (secção 3) não sabe disto** — só verifica `fs.existsSync('app/models/
  <nome>.ts')`; para um recurso em `faturacao/` (produtos, vendas, etc.) isso é sempre
  falso, e o comando tentaria recriá-lo do zero via `make:enterprise:resource`. Para
  adicionar um campo a um recurso em `faturacao/`, editar manualmente model/DTO/
  validator/migration seguindo o padrão de um campo já existente — não usar
  `resource:sync` (apanhado ao adicionar `produtos.disponivel`, ver secção 7.5).
- **`@belongsTo`/`@hasMany` sem `foreignKey` explícito quase sempre está errado neste
  projecto.** Os models declaram as colunas em snake_case tal como estão na BD
  (`produto_id`, não `produtoId`) — a inferência automática do Lucid (que assume
  camelCase) falha sistematicamente aqui. **Especificar sempre `foreignKey` explicitamente
  em toda relação nova.** `tests/functional/model_relations_integrity.spec.ts` testa isto
  chamando `.preload()` em cada relação conhecida sem tanto default — acrescentar aqui
  qualquer relação nova sem `foreignKey` explícito antes de confiar nela.
- Nome de ficheiro em minúsculas por recurso: `<entidade>_repository.ts`,
  `<entidade>_service.ts`, `<entidade>_dto.ts` (interfaces `Create<Entidade>DTO` /
  `Update<Entidade>DTO`), `<entidade>_validator.ts` (`create<Entidade>Validator` /
  `update<Entidade>Validator` via `vine.compile`). `*QueryValidator` deve espalhar
  `...commonQueryFields` de `app/validators/common_query_fields.ts` (paginação,
  intervalo de datas de auditoria, `empresa_id`/`company_alias`) em vez de repetir esses
  ~8 campos à mão — ver `caixa_validator.ts`/`estoque_validator.ts` como exemplos.
- Policies registadas em `app/policies/main.ts`, só a entrada dynamic-import dentro de
  `export const policies = {...}` (alias `#policies/...`) — não um `import` estático no
  topo do ficheiro, isso não é usado em lado nenhum e parte o build ESM (faltava-lhe a
  extensão `.js`).
- **Rotas em notação de tuplo, não string mágica**: `router.get(path, [controllers.X,
  'method'])` em vez de `router.get(path, '#controllers/x_controller.method')`. O barrel
  `app/generated/controllers.ts` (alias `#generated/controllers`) importa TODOS os
  controllers (import eager, não lazy — trade-off aceite: perde-se lazy-loading por
  ganhar verificação de nome de método em tempo de compilação) e reexporta cada um sob
  uma chave `PascalCase` limpa (`controllers.Vendas`, `controllers.ProdutoMedia`, etc.),
  contornando nomes de classe gerados de forma inconsistente (`caixasController`,
  `produtossController`). Ao adicionar um controller novo: (1) acrescentar o import +
  entrada no barrel, (2) usar `controllers.NomeNovo` na rota. Este barrel é **mantido à
  mão**, não gerado automaticamente — mantê-lo sincronizado com `app/controllers/` é
  responsabilidade de quem adiciona/remove um controller. Rotas por-empresa (que exigem
  `company_alias` + auth) vivem em `companydomainroutes.ts`, nunca em `routes.ts`
  directamente (ver comentário em `start/routes.ts`). Esta convenção substituiu a
  notação de string anterior nesta sessão (ver secção 7.4) — migrar tudo de uma vez
  apanhou 2 rotas duplicadas em `routes.ts` que nunca tinham funcionado (método
  inexistente/nome errado), só detectável porque a notação de tuplo verifica o nome do
  método em tempo de compilação.
- **Erros/excepções**: nunca envolver uma acção de controller em try/catch só para
  reclassificar `error.messages`/`error.code`/`E_ROW_NOT_FOUND` — `app/exceptions/
  handler.ts` já trata isso de forma genérica e consistente (`{data,message,status,code}`)
  para qualquer excepção que estenda `Exception` de `@adonisjs/core/exceptions` (todas as
  ~19 excepções de domínio em `app/exceptions/` + o `E_ROW_NOT_FOUND` do Lucid). Só
  apanhar um erro explicitamente no controller se for preciso fazer algo a mais (ex.:
  reverter algo). Nova excepção de domínio: `static status`/`code`/`message`, sem
  `handle()` próprio salvo razão muito específica (um `handle()` a compensar um `static
  status` errado é exactamente o bug que já aconteceu aqui, ver secção 7).
- **Eventos**: `app/events/*.ts` são classes simples (`export default class X {
  constructor(...) {} }`), ligadas com `emitter.on(Classe, listener)` — não precisam de
  registo em `EventsList` (isso só é preciso para eventos por nome de string, que este
  projecto não usa). Registar sempre em `start/events.ts` **e confirmar que
  `start/events.ts` está em `preloads` no `adonisrc.ts`** — já esteve ausente dali uma
  vez (ver secção 7) e nada avisa se isso voltar a acontecer, o ficheiro simplesmente
  nunca corre.
- **Emails**: usar uma Mailable (`app/mails/*.ts`, `extends BaseMail`, implementa
  `prepare()`) em vez de `mail.send((message) => {...})` inline sempre que o email for
  reutilizado por mais do que um sítio — ver `AlertaOperacionalMail` para o padrão.
  Templates edge em `resources/views/emails/`. **Um email novo escreve-se só com
  componentes** (`resources/views/emails/components/`, ver 7.11): `carta` (envelope
  completo — doctype, cabeçalho, rodapé; props `preheader` e `year`), `titulo`, `texto`,
  `nota`, `botao` (CTA + o mesmo URL em texto), `aviso` (caixa âmbar, slot de texto
  simples) e `painel` (caixa cinzenta, slot de blocos). Nenhum template volta a repetir
  `<!DOCTYPE>`/tabelas de fundo/`@include` de partials — o molde mais curto é
  `account_activation.edge` (27 linhas). Regras do Edge 6 a não esquecer: **não existe
  `@layout`/`@section`/`@set`** (é `@let(x = ...)` e componentes com slots); um
  componente **não vê o estado de quem o usa**, só as props (daí `year` ir sempre
  explícito); e `@if`/`@each` têm de estar em linha própria — no meio de uma frase usa-se
  interpolação (`{{ nota ?? '' }}`). Qualquer template novo é automaticamente coberto por
  `tests/functional/emails_render.spec.ts` assim que a Mailable for lá acrescentada —
  acrescentá-la é obrigatório, é o único sítio que prova que a view renderiza.

## 7. Estado actual (auditoria acumulada) — o que foi corrigido e o que fica

### 7.1 Primeira sessão — reutilização + bugs de import

- `commands/empresa_clean_expired.ts` apontava para colunas inexistentes (nunca corria
  sem erro) — lógica movida para `EmpresaRepository.deleteExpiredUnverified()`, com
  4 testes em `tests/functional/empresa_clean_expired.spec.ts`.
- `app/middleware/permission_middleware.ts` tinha um `console.log(routeName)` de debug.
- `app/middleware/validate_company_alias_middleware.ts` escondia erros reais de infra
  atrás de um 404 genérico — try/catch removido, 3 testes novos.
- **9 repositórios + 5 policies** importavam o modelo com o caminho errado
  (`#models/papel` em vez de `#models/auth/papel`, etc.) — o módulo rebentava em
  qualquer pedido real. Zero testes funcionais cobriam estas áreas; agora coberto por
  `tests/unit/modules_load.spec.ts`.
- `empresa_conta_bancaria_repository.ts` e (extinto, ver 7.2) `empresa_token_activacao_
  repository.ts` tinham um copy-paste que fazia `paginate()` consultar o model
  `produtos` (errado) em vez do seu próprio model.
- `produto_fabricante_controller.ts` importava serviço/validator no singular quando os
  ficheiros reais são no plural (`produto_fabricantes_service`/`_validator`).
- Bugs de sintaxe que impediam `npm run typecheck` de sequer completar (`?` mal
  colocado em DTOs gerados por `resource_sync.ts`; resíduo `@relations.Empresa` colado
  a um nome de campo) — corrigidos na origem, no gerador.
- 18 serviços usavam `DeletedValue` sem o importar — corrigido na origem.
- `BaseRepository` real (`app/repositories/base_repository.ts`) + migração de 19
  repositórios que eram cópia exacta do template + dedup interno de
  `caixa_repository.ts` (ver secções 2/3.1).
- `tests/unit/` criado (smoke de carregamento de repositories/policies/services/
  controllers/validators).

### 7.2 Segunda sessão — eventos de domínio, excepções, código morto

- **`start/events.ts` nunca corria** — não estava em `preloads` no `adonisrc.ts`.
  Corrigido, e o único listener que lá existia (`empresa:activated`) tinha o
  `emitter.on(...)` comentado — o email de boas-vindas na activação de empresa nunca
  tinha sido enviado. Ligado (evento class-based `EmpresaActivated`, emitido em
  `verification_token_hash_repository.verify()`).
- **Novos eventos de alerta operacional** (`app/events/`, listeners em
  `app/listeners/estoque_alertas.ts`, email via `AlertaOperacionalMail` +
  `resources/views/emails/alerta_operacional.edge`, destinatário configurável por
  `ALERT_EMAIL`):
  - `EstoqueCritico` — emitido em `estoque_repository.create()` quando uma saída deixa
    um lote com quantidade ≤ `ESTOQUE_LIMIAR_CRITICO` (omissão 5).
  - `LoteValidadeProxima` — emitido por `LoteRepository.avisarLotesProximosValidade()`,
    chamado pelo novo comando `node ace estoque:check-alertas` (correr via cron externo,
    como `empresa:clean:expired`); janela configurável por `LOTE_VALIDADE_ALERTA_DIAS`
    (omissão 30).
  - `VendaCanceladaAltoValor` — emitido em `vendas_repository.cancel()` quando o total
    dos itens de uma venda cancelada excede `VENDA_CANCELADA_LIMIAR` (omissão 50000).
  - `EstoqueRevertido` — emitido em `produtos_reembolso_repository.ts`
    (`reembolsar_total`/`reembolsar_parcial`), só depois da transacção confirmar.
  - Todos testados com `emitter.fake()` em
    `tests/functional/estoque_alertas_eventos.spec.ts`.
- **17 relações `@belongsTo` partidas** (nunca detectadas porque nada chamava
  `.preload()` nelas) — Lucid infere a FK a partir do NOME DA CLASSE relacionada
  (`camelCase + 'Id'`), mas os models deste projecto usam colunas snake_case reais
  (`produto_id`, não `produtoId`); sem `foreignKey` explícito a inferência falha sempre.
  Corrigidas em `lote.ts`, `estoque.ts` (faturacao/), `pos.ts`, `empresa_token_
  activacao.ts` (antes de ser removido), `papel_permissao.ts`, `user_papel.ts`,
  `authplatform/project*.ts` (6 ficheiros). Mais 2 FKs **erradas** (não em falta) em
  `produtos.ts`: `fornecedor` apontava para o model `produto_formatos` (copy-paste de
  `formato`) em vez de `produto_fornecedores`; `empresa` usava `foreignKey:
  'produto_id'` em vez de `'empresa_id'`. E em `vendapagamento.ts`: importava um model
  `Vendas`/`MetodoPagamento` com casing errado (só funcionava por acidente no Windows,
  case-insensitive; rebentava em runtime real). Todas cobertas por
  `tests/functional/model_relations_integrity.spec.ts` (chama `.preload()` em cada uma,
  sem precisar de dados — o erro acontece no "boot" da relação).
- **`caixa_repository.open()` devolvia `status: undefined`** — a coluna tem um default
  a nível de BD (`'Aberto'`, capitalizado, inconsistente com o `'aberto'` minúsculo
  usado em todo o resto do código), mas o MySQL não devolve defaults calculados pela BD
  depois de um INSERT; o objecto em memória ficava sem `status` até à próxima leitura.
  Corrigido a definir `status: 'aberto'` explicitamente. Encontrado ao escrever
  `tests/functional/fluxo_ponta_a_ponta.spec.ts` (caixa → venda → item → fecho →
  factura → reembolso parcial → fecho de caixa, ponta-a-ponta através dos
  repositórios reais).
- **Handler global de excepções** (`app/exceptions/handler.ts`) reescrito: antes só
  tratava especificamente `CaixaAlreadyClosedException`; agora qualquer `instanceof
  Exception` (as ~19 excepções de domínio + `E_ROW_NOT_FOUND` do Lucid, que partilham
  a mesma base do `@adonisjs/core`) é traduzida para o mesmo envelope
  `{data,message,status,code}`. `CaixaIsAlreadyOpenException` e
  `UnAuthorizedCaixaException` tinham `static status = 500` (errado) escondido por um
  `handle()` próprio que forçava 400/401 — nunca reparado porque os controllers
  intercetavam a excepção primeiro, tornando esse `handle()` morto na prática; corrigido
  o `static status`, removidos os `handle()` redundantes em 5 excepções. Testado em
  `tests/functional/http_exception_handler.spec.ts`. `caixa_controller.ts` e o template
  do gerador (`make_enterprise_resource.ts`) simplificados para já não repetirem `if
  (error.code === 'X')` em cada acção — os outros ~54 controllers ainda usam o padrão
  antigo (try/catch duplicado), é seguro migrar incrementalmente com o mesmo padrão.
- **Reutilização em validators**: `app/validators/common_query_fields.ts` — campos
  partilhados por quase todos os `*QueryValidator` (paginação, datas de auditoria,
  `empresa_id`/`company_alias`). Aplicado em `caixa_validator.ts` e
  `estoque_validator.ts` (que também tinha um bug — `vine.enum([, 'entrada', ...])` com
  uma vírgula a mais criava um elemento `undefined` no array). Os restantes
  `*QueryValidator` (userpos, marca, pos, categorias_produtos, metodopagamento,
  produtos, vendas, cupom, factura, promotor, produtos_reembolso, venda_itens, lote)
  seguem o mesmo padrão duplicado — mesma receita para migrar.
- **Código morto removido** (confirmado com múltiplas passagens de grep — zero
  referências fora do próprio cluster, e os pontos de entrada nunca estavam ligados a
  nenhuma rota):
  - Recurso `empresa_token_activacao` completo (model/dto/validator/repository/
    service/controller) — nunca teve migration, nunca teve rota, nunca teve policy.
    Removido com `node ace remove:enterprise:resource empresa_token_activacao`.
  - **Um cluster inteiro de models "legado"**, capitalizados, com uma implementação
    paralela e mais antiga (IDs inteiros, não UUID) do domínio de produtos/vendas —
    nunca ligado a nenhuma rota nem usado por nenhum repositório real: `AdonisSchema.ts`,
    `AdonisSchemaVersions.ts`, `Estoque.ts`, `Produtos.ts`, `Users.ts`, `Vendas.ts`,
    `VendaItens.ts`, `ProdutoContraindicacoes.ts`, `ProdutoDescricao.ts`,
    `ProdutoImagens.ts`, `ProdutoRecomendacoes.ts`, `ProdutoValidade.ts` + os models
    auxiliares só usados por eles (`produto_fabricante.ts`, `produto_formato.ts`,
    singular) + os validators/controllers correspondentes (`UsersController` chegava a
    ter rotas registadas em `start/auth.ts` — mas esse ficheiro nunca era importado por
    nada, portanto as rotas nunca existiam de facto) + `start/auth.ts` em si. Removidos
    ~28 ficheiros no total.
  - 7 `database/factories/produto_*.ts` que apontavam para os models já mortos, e
    `database/seeders/main.ts`, um seeder vazio (tudo comentado, referências a
    factories nem importadas) — `database_seeder.ts` é o seeder real e continua intacto.
- `tests/unit/` e `tests/functional/` cresceram para 342 testes no total (o número
  desce ligeiramente sempre que código morto é removido do smoke test de carregamento
  — isso é esperado, não uma regressão).

### 7.3 Terceira sessão — "adicionais" de produto, filtros, mais reutilização

- **`registrar_produto_and_detalhes` (registo de produto + "adicionais": descrições,
  categorias, contra-indicações, recomendações) estava completamente desligado** — a
  acção do controller e a rota estavam comentadas; o repository/service já existiam e
  funcionavam. Ligado (`POST produtos/registrar-com-detalhes`). No processo,
  encontrados e corrigidos:
  - `registrarProdutoAndDetalhes` chamava `produtos.create(data.produto, ...)`
    directamente, sem resolver `company_alias` -> `empresa_id` (a tabela não tem
    `company_alias`) — ia criar o produto sem tenant. Corrigido a resolver a empresa
    primeiro, tal como o `create()` normal já fazia.
  - `detalhes` era opcional no validator mas obrigatório no DTO
    (`registrarProdutoAndDetalhes` rebentava com `TypeError` se viesse `undefined`).
  - `descricao` era obrigatório em `createprodutosValidator` mas opcional em
    `CreateProdutoWithDetailsValidator` para o mesmo campo — as duas formas de criar um
    produto exigiam coisas diferentes; alinhado (obrigatório nas duas).
  - `CreateProdutoDetalhesDTO.detalhes.descricoes` exigia `produto_id`, campo que é
    preenchido pelo Lucid via `produto.related('descricoes').createMany(...)` e nunca é
    fornecido pelo chamador — `Omit<..., 'produto_id'>`.
  - `CreateProdutoDetalhesDTO.detalhes` tinha campos nunca implementados nem validados
    (`imagens`, `fornecedor`, `marca`) — removidos.
- **Mais 5 bugs de casing** (mesma classe do `vendapagamento.ts` da sessão 2, só
  funcionavam por acidente no Windows): `cobranca.ts` importava `./Subscricao.js`,
  `subscricao.ts` importava `./Plano.js` e `./Empresa.js`. O erro `TS1149` que na
  sessão 2 tinha sido registado como "parece ruído do compilador" **era este bug** — o
  `tsc` reporta-o como colisão de casing em vez de "módulo não encontrado" por o
  ficheiro (com a casing certa) já estar incluído no programa por outro caminho.
  **Sempre que aparecer `TS1149`, procurar e corrigir o import — não é ruído.**
- **`produto_fornecedores.ts` tinha `foreignKey: 'produto_fornecedor_id'`** (coluna
  inexistente) na relação para `empresa` — devia ser `'empresa_id'`. Também estava
  desalinhado na organização: era o único `produto_*` fora de `app/models/faturacao/`
  (os irmãos `produto_fabricantes`/`produto_formatos`/`produto_media` já lá estavam) —
  movido para `faturacao/` e corrigido o FK.
- **`throw new Error(...)` ad-hoc substituído por Exceptions nomeadas**
  (`EstoqueInsuficienteException`, `TipoMovimentacaoInvalidoException`,
  `ProdutoComMovimentacoesException`) em `estoque_repository.ts`/`produtos_repository.
  ts` — sem isto, estes erros de negócio caíam no fallback 500 genérico do handler
  global em vez de um 400/409 apropriado.
- **Testes de filtros** (`paginate()`), zero cobertura antes desta sessão:
  - `produtos_repository.paginate()`: bloco de filtro por `marca_id` estava duplicado
    (copiado duas vezes); `is_service` comparava a coluna booleana com `LIKE '%true%/
    %false%'` — o MySQL guarda 0/1, nunca combinava, o filtro nunca funcionou. Ambos
    corrigidos (`marca_id`/`formato_id`/`fabricante_id`/`fornecedor_id` passaram a
    igualdade exacta em vez de `LIKE`; `is_service` para igualdade booleana).
  - `ProdutoFabricanteQueryValidator`/`ProdutoFornecedorQueryValidator`: o campo
    `endereco` estava escrito `endereço` (com cedilha) no validator de query — um
    pedido real com `?endereco=...` era sempre ignorado pelo VineJS. Corrigido.
  - `caixa_repository.paginate()`/`listByUser()`: sem bugs encontrados, mas também sem
    nenhum teste antes — só existia teste de autorização
    (`caixa_repository_authorization.spec.ts`).
- **Mais reutilização**: `caixa_controller.ts` e `produtos_controller.ts` (sessão 2)
  mais `marca_controller.ts`, `produto_fabricantes_controller.ts`,
  `produto_formatos_controller.ts`, `produto_fornecedores_controller.ts`,
  `produto_categorias_controller.ts` simplificados para o padrão sem try/catch
  duplicado. `commonQueryFields` aplicado a mais 5 validators (marca, produto_
  fabricantes, produto_formatos, produto_fornecedores, produto_categorias) — 7 no
  total entre as duas sessões.
- Removidos mais alguns imports/linhas mortas pontuais (validators nunca usados em
  `categorias_produtos_controller.ts`, `produto_media_controller.ts`,
  `venda_itens_controller.ts`; `verification_token_hash_controller.ts` tinha 4 imports
  totalmente não usados — `VerificationTokenHash`, `DateTime`, `hash`,
  `createVerificationTokenValidator`).
- Novo `tests/functional/fluxo_produto_completo.spec.ts`: adicionais (marca,
  fabricante, formato, fornecedor, categoria) → produto+detalhes → stock (entrada) →
  caixa → venda → item → **cancelamento** (não fecho/reembolso — esse é o
  `fluxo_ponta_a_ponta.spec.ts` da sessão 2). Confirma que `cancel()` nunca toca no
  stock, ao contrário de `close()`.

### 7.4 Quarta sessão — rotas em tuplo, regra de pagamento no fecho, log em BD

- **Rotas migradas de string mágica (`'#controllers/x.method'`) para notação de tuplo**
  (`[controllers.X, 'method']`), via o novo barrel `app/generated/controllers.ts`
  (`#generated/controllers`, ver secção 6) — cobre `routes.ts`,
  `public_platform_routes.ts` e `companydomainroutes.ts` por inteiro. A verificação de
  nome de método em tempo de compilação apanhou **2 rotas em `routes.ts` que nunca
  tinham funcionado**: `auth/reset-password/:token` → `password_recovery` (método nunca
  existiu em `AuthController`) e `auth/forgot-password` → `forgotPassword` (devia ser
  `forgot_password`, e faltava-lhe `:company_alias` no path) — removidas como
  duplicados quebrados; a funcionalidade real e testada já existia nas versões
  tenant-scoped em `companydomainroutes.ts`.
- **Nova regra de negócio: uma venda não pode fechar sem pagamento indicado.**
  `vendas_repository.close()` agora exige pelo menos um `vendapagamento` associado
  (`VendaSemPagamentoException`, `VENDA_SEM_PAGAMENTO`, 400) e que a soma dos valores
  pagos bata certo com `total - desconto` (tolerância de 0.01, por arredondamento) —
  senão `VendaPagamentoIncompletoException` (`VENDA_PAGAMENTO_INCOMPLETO`, 400,
  mensagem distingue falta vs. excesso). Isto obrigou a acrescentar
  `pagarVenda(venda, valor)` a **todos** os testes existentes que chamavam `close()`
  sem nunca ter registado pagamento (6 ficheiros: `vendas_close_transaction`,
  `fluxo_ponta_a_ponta`, `vendas_cupom`, `metricas_repository`,
  `produtos_reembolso_repository`, `promotor_painel`) — o valor esperado tem de ser
  calculado por teste (subtotal dos itens menos desconto do cupão, se houver).
  - **Bug real encontrado ao verificar isto via API**: `vendas_controller.close()`
    ainda usava o padrão antigo de try/catch com uma lista fixa de `error.code`
    reconhecidos — qualquer excepção fora dessa lista (incluindo as duas novas) caía
    no fallback 500 genérico, escondendo o 400 correcto. Removido o try/catch (só
    nesta acção), deixando o handler global tratar tudo — mesmo padrão já aplicado a
    `caixa_controller.ts`/`produtos_controller.ts`/etc. Prova de que este padrão
    antigo (ainda presente em ~53 controllers) esconde silenciosamente qualquer
    excepção de domínio nova até alguém testar o endpoint a sério.
- **Log de segurança agora também persiste em BD**, não só pino/stdout:
  `logSecurityEvent()` (`app/helpers/security_logger.ts`) continua a logar via pino
  (inalterado) e adicionalmente grava em `security_logs` (migration
  `1784662475773_create_security_logs_table`, model `SecurityLog`) — `event`, `ip`,
  `details` (JSON serializado num `text`/`longtext`, não coluna `json` nativa — mais
  portátil, sem depender de auto-parse do driver), `created_at`. A escrita em BD é
  fire-and-forget (`.catch()` só loga o erro via pino, nunca propaga) — nunca deve
  atrasar nem partir o pedido que originou o evento. Como isto passou a tocar BD, o
  teste `tests/unit/security_logger.spec.ts` foi movido para
  `tests/functional/security_logger.spec.ts` (com `withGlobalTransaction()`) e ganhou
  2 testes novos a confirmar a persistência. **Lembrete**: uma tabela nova destas
  precisa de migration corrida nos DOIS bancos (`auth_system` e `auth_system_test`,
  ver `.env`/`.env.test`) — só correr `node ace migration:run` sem mais trata do dev;
  o de teste ficou a dar "table doesn't exist" até se correr também com
  `NODE_ENV=test`.
- Suite completa verificada em 383 testes (era 381 antes desta sessão: +3 desta
  feature, -1 do unit test movido para functional = +2 líquido), zero erros novos de
  `tsc --noEmit` (os já existentes, listados na secção do backlog, não têm relação com
  nada tocado aqui).
- **Serviços (`is_service = true`) devem aparecer em TODOS os POS da empresa**, não só
  nos que por acaso têm uma movimentação de `estoque` registada — um serviço nunca tem
  estoque físico (`produtos_repository`/`lote_repository`, ao criar um serviço, criam
  um lote com quantidade zero e sem `pos_id`; a linha de `estoque` correspondente fica
  com `pos_id`/`produto_id` a `NULL`), por isso nunca batia certo com nenhum filtro por
  POS. Corrigido em `app/helpers/catalogo_produtos_query.ts`:
  - `buscarPostosPorProduto()` passou a receber `{id, is_service, empresa_id}` em vez de
    só o `id` — para um serviço, devolve a lista COMPLETA de POS da empresa (nova query
    a `pos` por `empresa_id`) em vez da lista (sempre vazia) derivada de `estoque`.
  - O filtro `pos_id`/`pos_nome` mudou de inner `join` para `leftJoin` com
    `OR produtos.is_service` na condição — sem isto, filtrar o catálogo por um POS
    específico excluía sempre todos os serviços (nunca haveria uma linha de `estoque` a
    bater com esse `pos_id`).
  - Testado em `tests/functional/catalogo_produtos.spec.ts` (2 testes novos): um
    serviço aparece nos `postos` de AMBOS os POS de uma empresa com 2 POS, e continua a
    aparecer ao filtrar por um POS onde nunca teve nenhuma movimentação, enquanto um
    produto físico sem movimentação nesse POS é excluído correctamente.
- **`cliente` não tinha NENHUMA pesquisa/filtro** — `index()` só paginava (`page`/
  `limit`/`deleted`), tornando impossível encontrar um cliente pelos seus próprios
  detalhes numa base com muitos registos. `clienteRepository` estendia `BaseRepository`
  (só dá paginação genérica, sem filtros — ver secção 2/3), por isso deixou de estender
  e passou a repositório próprio (mesmo padrão de `caixa_repository.ts`/`pos_repository.ts`),
  com `paginate(page, limit, filter?: ClienteQueryDTO)` reusando `applyCommonFilters`/
  `FieldSpec`. Suporta os dois estilos pedidos: pesquisa livre `q` (OR-LIKE em nome/
  nome_fantasia/razao_social/email/telefone/telefone_secundario/nif, para uma caixa de
  pesquisa única) e filtros por campo individuais (nome/email/telefone/nif/cidade/
  provincia/pais em LIKE; tipo/ativo/cliente_pai_id exactos) — ambos sempre dentro do
  isolamento por tenant (`scopeToTenant` inline, igual ao que já existia).
  - **Bug real encontrado ao testar**: o model `cliente.ts` declara a coluna
    `nome_fantasia` (usada por `UpdateclienteDTO`/`updateclienteValidator`), mas
    NENHUMA migration a chegou a criar na BD — só ninguém tinha reparado porque nada
    a lia/escrevia a sério antes da pesquisa `q` a incluir. Corrigido com a migration
    `1784662475780_alter_cliente_add_nome_fantasia` (correr nos dois bancos, como
    sempre — ver aviso na sessão do log de segurança acima).
  - Assinatura de `clienteRepository.paginate()` mudou de `(page, limit, deleted,
    companyAlias)` para `(page, limit, filter?)` — `filter.deleted`/`filter.company_alias`
    substituem os antigos parâmetros posicionais. Actualizado o único sítio que ainda
    chamava a forma antiga (`tests/functional/tenant_isolation.spec.ts`).
  - Testado em `tests/functional/cliente_repository.spec.ts` (4 testes novos): `q` por
    nome/email/telefone/nif, filtros por campo (nome/email/telefone/nif/cidade em LIKE,
    tipo/ativo exactos), e que nem `q` nem os filtros por campo atravessam o isolamento
    por tenant (dois clientes com o mesmo nome/nif em empresas diferentes).

### 7.5 Quinta sessão — fluxo de abertura/fecho/reabertura de caixa

- **`caixa_repository.open()` voltou a devolver `status: undefined`** — a explicitação de
  `status: 'Aberto'` no `caixa.create(...)` descrita na sessão 2 (ver secção 7.2)
  tinha-se perdido (provavelmente num refactor posterior, ex.: o dedup de
  `applyFilters()`). Confirmado com um teste ad-hoc: `open()` devolvia um objecto com
  `status: undefined` mesmo com a BD a gravar correctamente `'Aberto'` (o MySQL não
  devolve defaults calculados pelo INSERT). Reposto `status: 'Aberto'` explícito.
  `tests/functional/fluxo_ponta_a_ponta.spec.ts` já falhava por causa disto — não era
  um teste novo, era regressão não apanhada porque a asserção lia `caixa.status`
  logo a seguir ao `open()`, sem round-trip à BD.
- **A reabertura automática da caixa fechada no próprio dia nunca disparava.**
  `open()` faz duas queries com `join('user', ...).join('empresa', ...)` mas sem
  `.select('caixa.*')` antes do `.first()` — como `empresa` também tem colunas
  próprias `id`/`status`/`created_at`, o `SELECT *` implícito da query devolvia essas
  colunas (não as de `caixa`) na hidratação do objecto resultante. A verificação
  `caixaHoje?.status === 'Fechado'` comparava então o `status` **booleano** da
  empresa com a string `'Fechado'` — sempre falso — pelo que o ramo de reabertura
  nunca era alcançado e criava-se sempre uma caixa nova em vez de reabrir a de hoje.
  Se o ramo alguma vez fosse alcançado, `caixaHoje.id` teria o mesmo problema (id da
  empresa/user em vez do id da caixa). Corrigido com `.select('caixa.*')` nas duas
  queries de `open()` (mesmo padrão já usado em `paginate()`/`findOrFail()`) — mesma
  classe de bug já resolvida para `destroy()`, aplicada aqui por prevenção mesmo sem
  sintoma observável (essa query só verifica truthiness, não lê campos).
- **`reopen()` definia `data_fecho: DateTime.now()` ao reabrir** — invertido: uma
  caixa reaberta (status volta a `'Aberto'`) deve ficar com `data_fecho: null`, tal
  como `destroy()` já fazia correctamente na mesma situação. Alcançável a partir do
  endpoint público `POST caixas` (via o ramo de reabertura automática acima).
  Corrigido para `data_fecho: null`.
- **Dois testes pré-existentes estavam a falhar** (`caixa_repository_authorization.spec.ts`,
  asserções `assert.equal(closed.status, 'fechado')`) por comparar contra a string em
  minúsculas, mas a coluna só aceita `'Aberto'`/`'Fechado'` capitalizado (enum da BD +
  tipo do model) — `close()`/`reopen()` já escrevem sempre capitalizado, correctamente.
  Alinhadas para `assert.equal(closed.status.toLocaleLowerCase(), 'fechado')`, seguindo
  a mesma convenção que o próprio repositório já usa para leitura case-insensitive.
- Note-se que `close()`/`reopen()` (os métodos do repositório) não têm rota própria —
  `caixa_service.ts` tem-nos comentados; o único fluxo público de fecho/reabertura é
  `destroy()` (`DELETE caixas/:id`, toggle conforme o estado actual), que **não tinha
  nenhum teste** antes desta sessão. Adicionado `tests/functional/caixa_reabertura.spec.ts`
  com testes cobrindo `open()` (status preenchido, reabertura automática do mesmo
  dia) e `destroy()` (fechar, reabrir, e bloqueio quando já existe outra caixa aberta).
- **Nova regra de negócio: uma caixa não pode ser fechada com uma venda em aberto
  associada.** Nem `close()` nem `destroy()` verificavam isto — fechavam a caixa
  normalmente e deixavam a venda (`vendas.status = 'aberta'`, `vendas.caixa_id` a
  apontar para a caixa entretanto fechada) "órfã". Adicionado
  `CaixaHasOpenVendaException` (`CAIXA_HAS_OPEN_VENDA`, 400,
  `app/exceptions/caixa_has_open_venda_exception.ts`) e um helper privado
  `assertNoVendaAberta(caixaId)` em `caixa_repository.ts`, chamado em `close()` (antes
  do merge) e em `destroy()` (só no ramo em que `isOpen` é verdadeiro, i.e. quando a
  operação é mesmo um fecho — não se aplica ao reabrir). Não usa o
  `UserHasAnOpenVendaException` já existente em `vendas_repository.ts` porque é uma
  regra diferente (aquele impede abrir uma segunda venda; este impede fechar a caixa
  com a venda já aberta) e teria uma mensagem enganadora neste contexto.
- **`caixa.total_vendas`/`total_caixa` nunca eram actualizados** — ficavam sempre no
  default `0` do model, para sempre, independentemente de quantas vendas fossem
  fechadas/reembolsadas/canceladas nessa caixa (confirmado por grep: só apareciam em
  `dtos`/`model`/`validators`/filtros de `paginate()`, nunca escritos por nenhuma
  lógica de negócio). Adicionado `caixaRepository.recalcularTotais(caixaId, trx?)` —
  soma `vendas.total` (`whereIn('status', ['fechada', 'reembolsada'])`) da caixa e
  grava `total_vendas` + `total_caixa = valor_inicial + total_vendas`. Chamado dentro
  da mesma transação em 4 pontos: `vendas_repository.close()` (venda efectivada),
  `vendas_repository.cancel()` (agora também transaccional — antes não usava
  transação nenhuma; cancelar não altera o total porque uma venda `'aberta'` nunca
  teve `total` preenchido, mas o recalculo corre à mesma para nunca assumir isso sem
  verificar) e `produtos_reembolso_repository.reembolsar_total()`/
  `reembolsar_parcial()` (o reembolso já recalculava `venda.total`; faltava propagar
  para a caixa). Não subtrai reembolsos à parte — `vendas.total` já vem reduzido pelo
  próprio reembolso, por isso somar só os estados `fechada`/`reembolsada` já dá o
  valor correcto. Testado em `tests/functional/caixa_totais.spec.ts` (fecho simples,
  duas vendas na mesma caixa, cancelamento, reembolso total, reembolso parcial).
- **Era literalmente impossível fechar (vender) qualquer serviço.** `produtos.is_service`
  já existia, mas um serviço não tem stock — o seu `lote` é sempre criado com
  `quantidade_em_estoque: 0` (`produtos_repository.create()`). O critério de "stock
  suficiente" (`EstoqueDisponivelCheck`, validator de `venda_itens`, E
  `estoque_repository.create()`, chamado por `vendas_repository.close()` para cada
  item da venda) tratava sempre `saida` da mesma forma, comparando a quantidade
  pedida contra o disponível — que para um serviço é sempre `0`. Resultado: adicionar
  ou fechar uma venda com qualquer serviço falhava sempre com "stock insuficiente".
  Corrigido com uma nova flag `produtos.disponivel` (boolean, default `true`, migration
  `1784662475774_alter_produtos_add_disponivel.ts`, model/DTO/validators actualizados
  à mão — **não usar `resource:sync` aqui**: o comando só procura o model em
  `app/models/<nome>.ts`, não em `app/models/faturacao/`, e tentaria recriar `produtos`
  do zero via `make:enterprise:resource`, ver secção 6). Para serviços, `estoque_
  repository.create()`/`EstoqueDisponivelCheck` deixam de olhar para
  `quantidade_em_estoque` e passam a checar `produtos.disponivel` (nova
  `ServicoIndisponivelException`, `SERVICO_INDISPONIVEL`, 400); o movimento de stock
  continua a ser registado (auditoria), mas `quantidade_em_estoque` do lote do serviço
  deixa de ser tocado (evita ficar negativo a cada venda). Cuidado ao comparar esta
  flag: o driver mysql2 devolve boolean como `0`/`1`, não `true`/`false` — uma
  comparação estrita (`=== false`) nunca combina com `0` (apanhado por teste a falhar;
  corrigido para falsy, mesmo padrão que `if (produto.is_service)` já usa nos
  repositórios). Produtos normais (`is_service: false`) continuam exactamente como
  antes (critério de stock inalterado).
- **`venda_itens_repository.create()` confiava inteiramente no validator HTTP
  (`createvenda_itensValidator`) para garantir que `venda_id` pertence ao tenant certo
  e está `'aberta'`** — chamado directamente (outro repositório, um teste), essa
  protecção não existia. Adicionado no início de `create()`: resolve a venda via
  `vendasRepository.findOrFail({id, company_alias})` (escopado por tenant através de
  caixa→pos→empresa) e rejeita com `VendaIsAlreadyOpenOrCloseException` se não estiver
  `'aberta'` — cobre ao mesmo tempo "pertence a outra empresa" (404, `E_ROW_NOT_FOUND`,
  pela própria falha do `firstOrFail`) e "a caixa/POS já não está aberto" (dado o
  invariante desta sessão de que uma caixa não fecha com venda aberta, ver acima —
  `venda.status === 'aberta'` já implica caixa aberta).
- Testado em `tests/functional/servico_disponibilidade.spec.ts`: fecho de venda com
  serviço disponível (sucesso, stock do lote fica em 0), serviço indisponível
  (`ServicoIndisponivelException`, venda não fecha), produto normal sem stock
  continua a bloquear (comportamento inalterado), e os 3 casos de
  `venda_itens_repository.create()` (venda de outro tenant, venda já fechada, venda
  aberta do próprio tenant).
- Suite completa: 403 testes (era 383 antes desta sessão), zero erros novos de
  `tsc --noEmit` (38 pré-existentes, ver secção 7.6 — o `pessoa_dto` mismatch mais um
  em `tests/helpers/fixtures.ts` sobre o mesmo `status` de `caixa` que já lá estava,
  não introduzido aqui).

### 7.6 Sexta sessão — metodopagamento tenant, RBAC de Gerente/Supervisor

- **`metodopagamento` passou de recurso de plataforma (partilhado por todas as
  empresas, sem `empresa_id`) a recurso de domínio, isolado por tenant**, a pedido
  explícito do utilizador. Migration `1784662475775_alter_metodopagamento_add_empresa.ts`
  acrescenta `empresa_id` (nullable — dados antigos sem tenant não são migrados, não
  havia nenhum a sério além de fixtures de teste) e troca o `unique('nome')` global por
  `unique(['empresa_id', 'nome'])` (duas empresas podem ambas ter um método
  "Numerário"). Model, DTOs, validators (`commonQueryFields`), repositório (deixou de
  duplicar filtros de data/deleted à mão — passou a usar `applyCommonFilters`, mesmo
  padrão de `produtos_repository.ts`) e controller/service actualizados para escopar
  por `company_alias`, seguindo o molde de `produtos_controller.ts`/`cliente_controller.ts`.
  A rota moveu-se de `start/routes.ts` (`api/metodo-pagamento`, `adminOnly()`) para
  `start/companydomainroutes.ts` (`api/:company_alias/metodo-pagamento`,
  `permission_middleware`, nome `domain_metodo_pagamento.*`).
- **`MetodoPagamentoPolicy` (Bouncer) removida** — recursos de domínio autorizam via
  `permission_middleware` + permissões seedadas, não por policy; a policy verificava
  `IsUserAnAdmin` (papel de tenant `"Admin"` literal), enquanto a rota antiga
  verificava `adminOnly()` (qualquer papel `Platform_%`) — dois catálogos de papel
  diferentes aplicados ao mesmo endpoint, exigindo os dois em simultâneo para lá
  chegar. Não existe mais esse problema: só `domain_metodo_pagamento.*` decide agora.
- **Gerente e Supervisor tinham 0 permissões seedadas** — existiam na tabela `papel`
  mas `database_seeder.ts` nunca chamava `givePermissionsToRole` para eles; um
  utilizador só com um destes papéis era bloqueado com 403 em *todas* as rotas de
  domínio por `permission_middleware`, apesar de `caixa_repository.close/reopen/
  destroy` já os tratar como papéis de gestão (podem agir sobre a caixa doutro
  utilizador). Passaram a receber o mesmo conjunto do `Vendedor` (produtos leitura,
  caixas, vendas, venda_itens, reembolsos, facturas) mais leitura de métricas de
  desempenho da loja (`domain_metricas.resumo/postos/vendedores/por_dia` — não as de
  promotores/marketing) — decisão confirmada com o utilizador antes de implementar,
  dado tratar-se de fronteiras de acesso reais, não uma escolha só técnica. `Vendedor`
  e `Estoquista` ganharam `domain_metodo_pagamento.index/show`; só `Admin` tem
  `store/update/destroy`.
- **Bug sistémico encontrado (e só parcialmente corrigido) ao escrever o teste de
  isolamento de `vendapagamento`**: `vendapagamento_validator.ts` verificava
  `venda_id`/`metodo_pagamento_id` só por existência global (sem tenant) — ao corrigir
  para escopar por `company_alias`, os testes de rejeição não rejeitavam nada. Causa:
  `db.from(...).first()` devolve `null` (não `undefined`) quando não há linha, e o
  padrão `return exists !== undefined` usado neste `.exists()` (e em dezenas de outros
  validators gerados) é **sempre verdadeiro** mesmo sem correspondência — `null !==
  undefined` é `true` em JS. Corrigido aqui e na origem, no gerador
  (`commands/resource_sync.ts`, método `vineRule` para campos de relação), para
  `!!exists`. **Não corrigido em mais lado nenhum** — este padrão (`exists !==
  undefined`) está espalhado por muitos validators gerados anteriormente (`produtos_
  validator.ts`, `venda_itens_validator.ts` nos validators não usados, etc.); o
  impacto real varia por caso: onde há FK a nível de BD, uma referência inexistente
  ainda rebenta com erro de SQL (500 em vez de 400 amigável); onde o `.exists()` filtra
  por algo além do id (ex.: tenant, `is_service`), esse filtro extra fica **sem
  qualquer efeito**, sempre a aceitar. Vale a pena uma auditoria dedicada
  (`grep -rn "!== undefined" app/validators`) numa sessão futura.
- **`produto_media_validator.ts`: `media` exigia sempre um array** (`vine.array(vine.file(...))
  .minLength(1)`) — rejeitava um upload de uma única imagem quando o cliente não envolve o
  campo em `[]`, apesar de `produto_media_repository.create()` já normalizar com
  `Array.isArray(data.media) ? data.media : [data.media]` (a validação bloqueava antes de lá
  chegar). Corrigido com `vine.union([vine.union.if(Array.isArray, vine.array(vine.file(...))
  .minLength(1).maxLength(10)), vine.union.else(vine.file(...))])`. **Não usar
  `vine.unionOfTypes` para isto** — falha em runtime ("schema type is not compatible")
  porque `VineMultipartFile` não é suportado por esse discriminador; só o `vine.union` com
  `if`/`else` explícito funciona para ficheiros. `Createproduto_mediaDTO.media` passou a
  `MultipartFile | MultipartFile[]`. Testado em `tests/functional/produto_media_validator.spec.ts`,
  usando `MultipartFileFactory` de `@adonisjs/bodyparser/factories` (fábrica oficial para
  criar `MultipartFile` falsos em testes, sem precisar de um pedido HTTP real) — primeiro
  precedente neste projecto de testar um validator com campos `vine.file()` directamente.
- Suite completa: 417 testes (era 383 no início desta sessão), zero erros novos de
  `tsc --noEmit` (36 — 2 a menos que os 38 anteriores: removidos `randomUUID`/
  `UniqueValidator` não usados de `vendapagamento_validator.ts` ao reescrevê-lo).
  Seeder corrido de novo (`NODE_ENV=test node ace db:fresh:seed`) para aplicar as
  novas permissões/papéis na BD de teste — necessário sempre que o seeder ganha
  permissões novas ou atribuições a papéis, já que `database_seeder.ts` não é
  idempotente (`Users.createMany` falha em emails duplicados numa segunda corrida).
- **Novo catálogo de produtos em stock, público (cross-tenant) e de domínio**, a pedido
  explícito: pesquisável por `q` (nome, descrição, e as descrições detalhadas em
  `produto_descricao`) e filtrável por marca/formato/fabricante/fornecedor/categoria/
  is_service/disponivel/pos (produtos com pelo menos uma movimentação de `estoque`
  nesse POS — não existe relação directa produto↔pos no schema)/intervalo de preço de
  compra/intervalo de preço de venda. Devolve TODAS as características (descrições,
  contraindicações, recomendações, categorias, marca, fabricante, formato, fornecedor,
  medias, lotes) via `.preload()`.
  - Lógica de query partilhada em `app/helpers/catalogo_produtos_query.ts`
    (`paginateCatalogoProdutos(page, limit, filter, companyAlias?)`) — `companyAlias`
    omitido é o único diferencial entre o catálogo público (`catalogo_publico_
    repository.ts`, cross-tenant, já existia antes desta sessão só com busca por nome)
    e o de domínio (novo método `produtos_repository.catalogo()`, rota `GET
    produtos/catalogo` — registada **antes** de `.resource('produtos', ...)` em
    `companydomainroutes.ts`, mesmo motivo que `caixas/meu`: a rota genérica
    `GET produtos/:id` intercepta-a caso contrário).
  - Um produto só aparece se tiver pelo menos um lote não-apagado (mesmo critério que
    o catálogo público já usava) — inclui serviços, que têm sempre lote com
    `quantidade_em_estoque = 0`.
  - Novas relações `produtos.lotes` (hasMany `lote`) e `produtos.medias` (hasMany
    `produto_media`) — não existiam no model; `lote.ts`↔`produtos.ts` ficam com import
    circular (thunk `() => lote` nos decorators lazy-resolve, tal como
    `vendas.ts`↔`venda_itens.ts` já fazia antes, ver secção 6).
  - **Cada `.preload()` só traz os campos de negócio da relação** (nunca `enabled`/
    `created_at`/`updated_at`/`deleted_at`, a pedido explícito do utilizador —
    "preloads trazem dados desnecessários como dados de auditoria"): marca (nome,
    descricao), fabricante/fornecedor (nome, email, telefone, endereco), formato
    (nome, descricao), categorias (nome, descricao), descrições/contraindicações/
    recomendações (só o texto), medias (só a url), lotes (dados do lote, sem
    timestamps). A query principal de `produtos` também só selecciona colunas de
    negócio + as FKs (`marca_id`/`formato_id`/`fabricante_id`/`fornecedor_id`/
    `empresa_id`) que os `.preload()` precisam para resolver as relações belongsTo.
  - **`$extras` (os agregados `quantidade_em_estoque`, `preco_venda_min/max`,
    `preco_compra_min/max` de `.sum()/.min()/.max()`) não aparecem no JSON por
    omissão** — Lucid só serializa `$extras` quando `serializeExtras` está definido na
    instância (`true` → aninha em `meta`; função → o que a função devolver, espalhado
    no topo). Sem isto, os agregados desapareciam silenciosamente da resposta (nunca
    dava erro, só faltavam os campos — apanhado ao escrever o teste, que só falhava a
    asserção, não a chamada). `paginateCatalogoProdutos()` define
    `produto.serializeExtras = () => produto.$extras` em cada linha da página antes de
    devolver o paginador.
  - Nova permissão `domain_produtos.catalogo`, atribuída aos mesmos papéis que já têm
    `domain_produtos.index/show` (Admin, Estoquista, EstoquistaVisualizador, Vendedor,
    VendedorVisualizador, AdminVisualizador, Gerente, Supervisor).
  - Testado em `tests/functional/catalogo_produtos.spec.ts` (características completas
    sem campos de auditoria, filtros por marca/is_service+disponivel/preco_compra/pos,
    isolamento por tenant do lado de domínio, permissão `domain_produtos.catalogo` por
    papel) e `tests/functional/catalogo_publico.spec.ts` (reescrito — a assinatura de
    `paginateProdutos()` passou de `(page, limit, search?: string)` para `(page,
    limit, filter?: CatalogoProdutosFilterDTO)`, e a forma da resposta mudou de colunas
    aliased à mão (`produto_id`, `produto_nome`, `preco_a_partir_de`) para o produto
    Lucid inteiro com as características preloaded).
  - **Adição posterior, a pedido**: cada produto passou a incluir `postos` — a lista de
    POS (`id`/`nome`/`localizacao`, sem dados de auditoria) onde há pelo menos uma
    movimentação de `estoque` registada, calculada numa query à parte (`buscarPostos
    PorProduto()`, agrupada em memória por `produto_id`) DEPOIS da paginação — não dá
    para vir de `.preload()` porque não há relação directa produto↔pos no schema, só
    via `estoque`. Estes dados entram no mesmo `serializeExtras` que já achata os
    agregados de preço/stock (ver acima). Também aceita pesquisar por `pos_nome`
    (parcial, `LIKE`) além do `pos_id` exacto já existente — junta `pos` a `estoque`
    só quando `pos_nome` vem preenchido, para não sobrecarregar a query nos casos em
    que só `pos_id` é usado.
  - Suite completa após esta funcionalidade: 427 testes, zero erros novos de
    `tsc --noEmit` (36, sem alteração). Seeder corrido de novo em BD de teste (`NODE_ENV=
    test node ace db:fresh:seed`) para aplicar `domain_produtos.catalogo`.

### 7.7 Sétima sessão — módulo de Relatórios (dashboard, ~20 relatórios, plataforma)

- **Pedido original tinha 3 lacunas reais de dados**, confirmadas com o utilizador antes
  de implementar (evitou construir relatórios com números fabricados):
  1. **Despesas** — não existia nenhuma tabela. Decisão: criar um recurso novo completo
     (não só omitir).
  2. **IVA liquidado** — só existia `empresa.regime_iva` (boolean), sem taxa nem valor
     gravado por venda. Decisão: **tabela de taxas** (não uma taxa fixa por env) —
     `taxa_iva` (recurso de plataforma, como `plano`: `nome`, `percentual`, `ativo`) +
     `empresa.taxa_iva_id` (FK nullable). IVA liquidado é sempre uma **estimativa**
     extraída do total já com imposto incluído (`iva = total * percentual / (100 +
     percentual)`), nunca um valor fiscal gravado por venda — documentado assim no
     código para não ser confundido com um valor oficial.
  3. **Contas a Receber** — este projecto não tem venda a crédito ao cliente final
     (fecho de venda exige pagamento total imediato, ver secção 7.4). A tabela real de
     "por receber" é `cobranca` (cobrança de subscrição SaaS às empresas clientes,
     ligada a `subscricao`/`plano`) — sempre um relatório da PLATAFORMA, nunca de uma
     empresa-tenant. "Valor a receber" no dashboard executivo de cada empresa fica
     sempre `0`, com comentário a explicar porquê (não é uma omissão silenciosa).

- **`despesas` (novo recurso de domínio)** — `app/models/faturacao/despesas.ts`,
  migration `1784662475776_despesas.ts` (`empresa_id`, `pos_id` opcional, `categoria`,
  `descricao`, `valor`, `data_despesa`, `registrado_por`). Repositório próprio (filtros
  ricos via `applyCommonFilters`/`FieldSpec`, mesmo padrão de `metodopagamento_
  repository.ts` pós-tenant), sem Bouncer (`permission_middleware`, rota em
  `companydomainroutes.ts`, `domain_despesas.*`). Sem `update`/`destroy` para
  Gerente/Supervisor pensados como "ninguém apaga despesas já registadas, só o Admin"
  — na prática o seeder dá-lhes `store`/`update` mas não `destroy`.

- **`taxa_iva` (novo recurso de plataforma)** — `app/models/taxa_iva.ts`, migration
  `1784662475777_taxa_iva.ts`. Mesmo molde exacto de `plano` (`BaseRepository` +
  Bouncer com `IsUserAnAdmin`, rota em `start/routes.ts` dentro do grupo `adminOnly()`,
  `platform_taxa_iva.*`) — deliberadamente **sem** aplicar a correcção de arquitectura
  já feita a `metodopagamento` nesta sessão (secção 7.6): o pedido era para seguir a
  arquitectura actual, não para a mudar; `taxa_iva` é mesmo um recurso de plataforma
  (taxas de IVA são definidas por lei, não por tenant), ao contrário de
  `metodopagamento`. `empresa.taxa_iva_id` acrescentado via migration
  `1784662475778_alter_empresa_add_taxa_iva.ts` + campo opcional em
  `updateempresaValidator`/`UpdateempresaDTO` (aditivo, não altera nada do fluxo actual
  de update de empresa).

- **`relatorios` (novo módulo de domínio)** — `app/repositories/relatorios_repository.ts`
  + service/controller/DTO/validator, seguindo o padrão de `metricas_repository.ts`
  (o precedente mais próximo: queries `db` em bruto, sem Lucid ORM, DTO com
  `company_alias` + filtros, `*QueryValidator` simples, controller com try/catch por
  acção). `RelatoriosFilterDTO` é um único filtro partilhado por todos os métodos
  (datas, pos/loja, caixa, cliente, vendedor/utilizador, produto, categoria,
  fornecedor, estado, método de pagamento, granularidade, limit) — cada método só usa
  o subconjunto relevante, mesma ideia de `MetricasPeriodoDTO` alargada. Rotas GET-only
  em `companydomainroutes.ts` (`domain_relatorios.*`, 23 acções) — nenhuma cria/edita/
  apaga nada.
  - `dashboardExecutivo()`/`kpisGerais()` (alias, mesmas queries): faturação
    hoje/semana/mês/ano, ticket médio, nº facturas/clientes, valor recebido, lucro
    bruto + margem (via custo dos produtos vendidos, `venda_itens.quantidade *
    lote_produto.preco_compra` — nunca inclui despesas operacionais nesse cálculo,
    só COGS), IVA liquidado, despesas do mês, saldo de caixa (soma de
    `caixa.total_caixa` das caixas abertas), vendas por tipo (presencial/online/
    online_loja — mapeamento directo do enum `vendas.venda_tipo` já existente).
  - `evolucaoVendas()`/`relatorioLucro()`: granularidade dia/semana/mês/ano via
    `DATE_FORMAT` (semana usa `'%x-%v'`, ISO-8601 ano-semana).
  - `topProdutos/topCategorias/topClientes/topVendedores`: leaderboards limit-N.
  - `relatorioVendas/relatorioClientes/relatorioMetodoPagamento/relatorioProdutos/
    relatorioStock/relatorioCompras/relatorioImpostos/relatorioUtilizadores/
    relatorioDescontos/relatorioRentabilidade/comparativo/fluxoCaixa`: um método por
    relatório pedido.
  - `relatorioDocumentosAnulados`/`relatorioNotasCredito` **reutilizam campos que já
    existiam em `factura`** (`status: 'anulada'`, `tipo: 'Nota de Crédito'`) — zero
    schema novo, só filtros sobre dados já geridos por `factura_repository.emitir()`/
    `anular()` (secção 7.4).
  - `fluxoCaixa()` é o único método que faz duas queries agregadas (vendapagamento por
    dia, despesas por dia) e junta os dois em memória por data — não dá para um único
    JOIN sem duplicar valores (fontes diferentes); o volume por dia é sempre pequeno,
    nunca linhas em bruto.
  - **Cuidado ao agregar uma expressão calculada com knex**: `.sum(db.raw('(a * b) as
    alias'))` gera SQL inválido (`SUM((a * b) as alias)` — o alias fica dentro dos
    parêntesis da função). A forma correcta é `.select(db.raw('SUM(a * b) as alias'))`
    fora de `.sum()`. Apanhado ao testar `relatorioProdutos`/`relatorioStock`/
    `relatorioCompras`/`relatorioLucro`/`relatorioRentabilidade` e o `empresasResumo()`
    da plataforma — todos tinham este erro antes dos testes correrem.

- **`relatorios_plataforma` (novo módulo, proprietário da plataforma)** —
  deliberadamente cross-tenant, mesma excepção documentada para `catalogo_publico_
  repository.ts`: nunca escopado por `company_alias`. Rotas em `start/routes.ts`
  (grupo `adminOnly()`), `platform_relatorios.*` — como o nome não começa por
  `domain_`, `Platform_Admin` recebe-as automaticamente via o mecanismo já existente
  (`whereNot('nome', 'like', 'domain_%')`), sem precisar de as listar à mão.
  - `contasReceber()`: cobranças (`cobranca`) por pagar (`pago = false`), com nome da
    empresa e do plano.
  - `receitaPlataforma()`: cobranças pagas no período + nº de subscrições activas.
  - `empresasResumo()`: total/activas/inadimplentes/por tamanho, cross-tenant.
  - `usoPlataforma()`: vendas fechadas, produtos e utilizadores totais, cross-tenant.
  - `auditoria()`: lista `security_logs` (evento, ip, `details`, data), filtrável por
    `event` — reutiliza a tabela já criada para `logSecurityEvent()` (secção 7.4), zero
    schema novo.
  - Controller usa Bouncer com `authorize('nomeLiteralDaAcção')` explícito por acção
    (nunca uma string dinâmica) — só assim se mantém o mesmo padrão 1:1 de
    `plano_controller.ts`/`taxa_iva_controller.ts`, sem introduzir um mecanismo de
    autorização novo e não testado.
  - **Achado (não corrigido, fora do âmbito desta tarefa): `cobranca.data_emissao`
    é outra "coluna fantasma"** — o model declara-a, `cobranca_validator.ts`/
    `cobranca_dto.ts` também, mas a migration tem essa linha comentada
    (`// table.datetime('data_emissao');`). Isto significa que `POST cobranca` (o CRUD
    já existente, não tocado nesta sessão) rebenta hoje com "Unknown column" sempre
    que alguém tenta criar uma cobrança pelo endpoint normal. `receitaPlataforma()`
    usa `cobranca.created_at` em vez disso; `contasReceber()` não selecciona
    `data_emissao`. Mesma classe de bug já documentada para `produtos.enabled`
    (secção 6) — vale a pena um `grep -rn "// table\." database/migrations` numa
    sessão futura para mapear quantas mais existem.

- **RBAC**: `domain_despesas.*`/`domain_relatorios.*` seguem o mesmo critério já usado
  para `domain_metricas.*` (secção 7.6) — Admin, Gerente, Supervisor e
  AdminVisualizador têm acesso; Vendedor/Estoquista não (relatórios/despesas não são
  operação do dia-a-dia deles). Gerente/Supervisor têm `despesas.store/update` mas não
  `destroy` (só o Admin apaga despesas já registadas). `platform_taxa_iva.*`/
  `platform_relatorios.*` só chegam a `Platform_Admin`, via o mecanismo automático já
  existente.

- Testado em `tests/functional/despesas_repository.spec.ts`, `taxa_iva_repository.
  spec.ts`, `relatorios_repository.spec.ts` (dashboard executivo com faturação/ticket
  médio/nº clientes/vendas por tipo, IVA liquidado com e sem regime, despesas no
  dashboard, isolamento por tenant, `kpisGerais`, `comparativo` hoje/ontem,
  documentos anulados/notas de crédito via `factura` real, fluxo de caixa, topProdutos/
  relatorioProdutos com custo, `relatorioVendas` filtrado por pos/cliente),
  `relatorios_plataforma_repository.spec.ts` (contas a receber cross-tenant, resumo de
  empresas, auditoria) e `rbac_despesas_relatorios.spec.ts`. **Nem todos os ~23
  métodos de `relatorios_repository.ts` têm teste dedicado** — a amostra testada
  cobre os pontos de maior risco (agregação com JOINs múltiplos, cálculo de IVA,
  isolamento por tenant, a correcção do bug `.sum(db.raw(...))`); os métodos mais
  simples (`relatorioClientes`, `relatorioUtilizadores`, `relatorioDescontos`,
  `topCategorias`, `topVendedores`, `evolucaoVendas`) seguem o mesmo padrão já
  validado nos métodos irmãos, mas não foram exercitados individualmente — dizer isto
  explicitamente em vez de reportar o módulo inteiro como "testado" sem mais.
  **(Lacuna preenchida na sessão seguinte — ver secção 7.8.)**
- Suite completa: 471 testes (era 427 no fim da sessão anterior), zero erros novos de
  `tsc --noEmit` (36, sem alteração). Migrations + seeder corridos em dev e teste.

### 7.8 Oitava sessão — rota "pos/meu" + testes em falta do módulo de Relatórios

- **`GET pos/meu`** — nova rota que devolve todos os pos associados ao user
  autenticado, mesmo padrão de `caixas/meu` (secção 7.5): `pos_repository.
  listByUser()` (novo), `pos_service.listByUser()`, `pos_controller.meusPos()`.
  Registada em `companydomainroutes.ts` **antes** de `.resource('pos', ...)`, mesma
  razão já documentada para `caixas/meu`/`produtos/catalogo` (a rota genérica `GET
  pos/:id` do resource intercepta `pos/meu`). Nova permissão `domain_pos.meu`,
  atribuída exactamente aos mesmos papéis que já tinham `domain_caixa.my` (Admin,
  Vendedor, Gerente, Supervisor) — nenhum papel novo, só replicado o critério já
  usado para "recursos do utilizador logado".
  - **Achado e corrigido**: `userpos` (a tabela de associação user↔pos) tinha
    `user_id` e `pos_id` cada um com a sua própria constraint `unique()` (migration
    `1779132357685_alter_userpos.ts`) — apesar do nome sugerir uma tabela de junção
    N:N, o schema só permitia **uma** associação por utilizador (e uma por pos),
    para sempre — não "uma activa de cada vez", era ao nível da BD, mesmo com soft
    delete (recriar a linha para o mesmo `user_id` violava a constraint).
    Corrigido em `1784662475779_alter_userpos_permitir_multiplos.ts` (mesmo
    tratamento já dado a `pos.nome` em `1779500000001_alter_pos_nome_unique_per_
    empresa.ts`): substituídas as duas uniques simples por uma unique composta
    (`user_id` + `pos_id`), que só impede duplicar exactamente a mesma associação,
    nunca um utilizador com vários pos (ou um pos com vários utilizadores). Migration
    em dois passos — o MySQL/InnoDB recusa apagar um índice que ainda sirva de
    suporte a uma foreign key, por isso a unique composta (cobre `user_id`) e um
    índice simples para `pos_id` são criados **antes** de apagar os dois índices
    antigos. Corrida em dev e teste; `listByUser()` já estava escrito de forma
    genérica (devolve sempre um array), não precisou de nenhuma alteração — só o
    schema estava a mais restringir do que o código já esperava. `pos_repository_
    meu.spec.ts` ganhou 2 testes a confirmar o cenário N:N (vários pos por
    utilizador, o mesmo pos partilhado por vários utilizadores).
  - `PosQueryDTO` não declarava `page`/`limit` (só `PosQueryValidator` os validava) —
    o `paginate()` já existente contornava isto recebendo-os como parâmetros
    próprios, não do filtro; `listByUser()`, ao reutilizar o mesmo filtro para
    paginar (mesma assinatura de `caixa_repository.listByUser()`), expôs a lacuna
    (erro novo de `tsc --noEmit`). Corrigido a acrescentar os dois campos ao DTO
    (aditivo, mesmo padrão de `CaixaQueryDTO`).
- **Testes em falta do módulo de Relatórios (secção 7.7) preenchidos** — a sessão
  anterior deixou ~14 dos ~23 métodos de `relatorios_repository.ts` e 2 de
  `relatorios_plataforma_repository.ts` sem teste dedicado (só "seguem o mesmo
  padrão já validado"). Adicionados:
  - `tests/functional/relatorios_repository_detalhados.spec.ts` (13 testes):
    `faturacaoPorPeriodo`, `evolucaoVendas`, `topCategorias`, `topClientes` +
    `relatorioClientes`, `topVendedores` + `relatorioUtilizadores`,
    `relatorioMetodoPagamento`, `relatorioStock`, `relatorioCompras`,
    `relatorioLucro`, `relatorioImpostos` (com e sem regime de IVA),
    `relatorioDescontos`, `relatorioRentabilidade`.
  - `relatorios_plataforma_repository.spec.ts` +2 testes: `receitaPlataforma`,
    `usoPlataforma` (asserções por delta, não por valor absoluto — a BD de teste já
    tem utilizadores seedados fora da transacção de cada teste).
  - `tests/functional/pos_repository_meu.spec.ts` (7 testes): `listByUser` (filtra
    por user via `userpos`, ignora associação com soft delete, filtra por nome,
    devolve vários pos do mesmo utilizador, o mesmo pos partilhado por vários
    utilizadores) + RBAC de `domain_pos.meu`.
  - **Achado e corrigido (mesma classe de bug já documentada para `is_service`,
    secção 7.7)**: `relatorioImpostos()` devolvia `regime_iva: empresa.regime_iva`
    sem cast no ramo "sem regime" — mysql2 devolve isto como `0`/`1` (TINYINT), não
    `false`/`true`. O ramo "com regime" já devolvia um `true` literal (não vem do
    model), por isso só o outro ramo tinha o problema. Corrigido com
    `Boolean(empresa.regime_iva)` nesse ramo (repositório, não só o teste); teste
    actualizado para a asserção estrita (`isFalse`, já não precisa do `isNotOk` de
    contorno).
- Suite completa: 493 testes (era 471 no fim da sessão anterior), zero erros novos de
  `tsc --noEmit` (36, sem alteração). Seeder corrido em teste (permissão
  `domain_pos.meu` nova); migrations corridas em dev e teste (`domain_pos.meu` +
  `userpos` unique composta).

### 7.9 Nona sessão — unicidade de utilizador por domínio (auth_validator)

- **`POST api/:company_alias/auth/register` estava partido desde sempre.** As regras
  `.unique()` de `username`/`email` em `UsersCreateValidator` faziam
  `!(await db.from('user')...first()).where('empresa.company_alias', ...)` — o `.where()`
  do filtro por empresa era chamado **sobre a linha já devolvida** (ou sobre `null`), não
  sobre o query builder. Ou seja: (a) rebentava sempre com `TypeError`, devolvido como 500
  genérico pelo `catch` do controller (que só trata `error.messages`), e (b) o filtro por
  empresa nunca chegava a fazer parte do SQL — a unicidade era global. Ninguém tinha
  reparado porque nenhum teste exercitava este validator.
- **A unicidade passou a ser por domínio, alinhada com a BD**: `create_users_table`
  declara `unique(['email','empresa_id'])` e `unique(['username','empresa_id'])` (o
  `unique()` global do email está comentado nessa migration) — duas empresas podem ter um
  funcionário com o mesmo email/username, a mesma empresa não. `DomainUserUpdateValidator`
  verificava globalmente (estava documentado como intencional; era o inverso do que a BD
  impõe) e passou também a escopar por `company_alias`, mantendo o `whereNot('user.id', ...)`
  do próprio registo.
- **Dois helpers no topo de `app/validators/auth_validator.ts`** em vez do mesmo bloco
  copiado 5 vezes: `uniqueNoDominio(coluna, metaIdKey?)` e `existeNoDominio` (usado pelos
  fluxos de recuperação de password, que já filtravam por empresa mas repetiam
  `.where('user.email', value)` duas vezes). Ambos lêem o alias de
  `field.data.params?.company_alias` — não `field.parent.params.company_alias`: é o padrão
  já usado em `vendapagamento_validator.ts`, e o optional chaining é o que permite chamar
  o validator directamente num teste sem `params`.
- **A unicidade NÃO exclui utilizadores com soft delete.** A constraint da BD também não
  os exclui, por isso aceitar o email de um funcionário desactivado só trocaria um 400
  legível por um 500 de chave duplicada no INSERT — há teste a fixar isto.
- `UsersUpdateValidator` (continua sem rota nenhuma a usá-lo, ver 7.4) foi escopado da
  mesma forma por consistência, mantendo a sua chave de meta própria (`_id`).
- **Consequência directa, corrigida na mesma passagem**: com unicidade por domínio, o
  mesmo email passa a poder existir em dois tenants — e `authRepository.forgot_password()`
  procurava o utilizador com `User.findBy('email', ...)`, **global**, podendo enviar o link
  de redefinição ao utilizador da empresa errada. Passou a resolver a empresa primeiro e a
  procurar por `email` + `empresa_id`, com `firstOrFail()` em vez do `user?.id!` anterior
  (sem correspondência, o que se enviava era um email para `undefined` com um link
  `.../undefined`). O validator do endpoint já filtrava por empresa; o repositório, chamado
  directamente, não. `authRepository.findByEmail()` continua global — não é usado por nada
  (candidato a remover numa auditoria de código morto).
- Testado em `tests/functional/auth_validator_dominio.spec.ts` (8 testes): registo rejeita
  username/email repetidos na mesma empresa, aceita-os noutra empresa, aceita um par novo;
  update rejeita o email de um colega, aceita gravar mantendo o próprio, aceita o email de
  alguém de outra empresa, e continua a rejeitar o de um colega desactivado. Mais 2 em
  `auth_repository_forgot_password.spec.ts` (mesmo email em duas empresas — pedido nos dois
  sentidos, porque com UUID como PK a query global antiga podia devolver qualquer um dos
  dois; e email inexistente na empresa não envia nada).
- Suite completa: 592 testes (eram 582), 35 erros de `tsc --noEmit` (todos pré-existentes,
  nenhum nos ficheiros tocados).

### 7.10 Backlog conhecido, não tocado (propositadamente — ver secção 2)

- `pessoa_dto.ts` declara `tipo: string`, mas o model `pessoa.ts` tipa `tipo` como
  `'Cliente' | 'Funcionario' | 'Promotor'` — mismatch de tipos pré-existente (não
  quebra em runtime, só falha `tsc --noEmit`).
- ~29 repositórios com `paginate()`/lógica própria (caixa, vendas, estoque, produtos,
  cupom, factura, promotor*, os `produto_*`, etc.) continuam por consolidar em
  `BaseRepository` — e é intencional (ver secção 2).
- ~48 controllers ainda com o padrão antigo de try/catch duplicado (8 já migrados) —
  migrar incrementalmente para o padrão do handler global, um de cada vez, com teste a
  confirmar antes/depois.
- ~11 `*QueryValidator` ainda não usam `commonQueryFields` (userpos, pos, categorias_
  produtos, cupom, factura, vendas, produtos_reembolso, venda_itens, lote, promotor,
  produtos [`ProdutoQueryValidator`, tem campos a mais que não se encaixam 1:1]) —
  `metodopagamento` migrado nesta sessão; mesma receita a aplicar aos restantes, ver
  secção 6.
- Testes de integração HTTP real (via o `client` do `@japa/plugin-adonisjs`, com token
  de acesso real e permissões seedadas) ainda não existem neste projecto — todos os
  testes actuais chamam repositórios/services/middleware/controllers directamente. É
  uma capacidade de teste válida a construir, mas o setup de auth+RBAC necessário é não
  trivial; não construído por falta de precedente a seguir com confiança.
- `database/factories/`, `database/seeders/` (além do `database_seeder.ts` real): dado
  que 7 factories mortas já foram removidas na sessão 2, vale a pena confirmar
  periodicamente que nenhuma nova factory/seeder morta se acumula sem ser notada — não
  há nenhum smoke test automático para esta pasta (ao contrário de `app/repositories`
  etc., cobertos por `tests/unit/modules_load.spec.ts`).
- **Auditoria do padrão `exists !== undefined`** (ver secção 7.6) — `grep -rn "!==
  undefined" app/validators` para mapear todos os validators afectados e decidir,
  caso a caso, se a referência devia mesmo ser rejeitada quando não existe/não passa
  no filtro extra.

### 7.11 Décima sessão — alterar o email de um funcionário obriga a reactivar a conta

- **`auth_repository.update()` gravava o email novo e mais nada.** A conta continuava a
  entrar com um endereço que ninguém tinha provado existir, e o dono do endereço anterior
  nunca sabia que a conta lhe tinha sido tirada. Passou a, **só quando o email muda**
  (`data.email !== undefined && data.email !== user.email` — gravar o mesmo email não
  conta, senão bastava carregar em "Gravar" no formulário para bloquear o funcionário):
  1. invalidar as verificações anteriores (`verified: false` + `deleted_at`) — `login()`
     exige um `verification_token_hash` verificado, portanto a conta fica sem entrada; o
     soft delete é o que impede o link ANTIGO (que está na caixa de correio antiga) de
     ainda servir para `verify()` ou `resetPassword()`;
  2. criar um token novo (`purpose: 'account_activation'`, via
     `VerificationTokenHashService.createToken`) e enviar o link para o endereço NOVO
     (`EmailAlteradoActivacaoMail`);
  3. avisar o endereço ANTIGO (`EmailAlteradoAvisoMail`, sem nenhum link accionável);
  4. revogar as sessões activas (`delete from auth_access_tokens where tokenable_id`),
     senão o bloqueio era de fachada — quem já tivesse bearer token continuava a
     trabalhar. Feito pela tabela em vez de `User.accessTokens.delete()` porque o
     `DbAccessTokensProvider` não aceita a transação desta operação.
  As duas decisões de fronteira de acesso (bloquear até reactivar; avisar o endereço
  antigo) foram confirmadas com o utilizador antes de implementar, como em 7.6.
- **Tudo numa transação, com os emails enviados ANTES do commit**: se o envio falhar, nada
  fica alterado. Bloquear a conta e não conseguir entregar o link deixaria o funcionário
  fechado de fora sem forma de voltar (há teste a fixar isto).
- `update()` passou a devolver `{ user, emailAlterado }` (antes devolvia só o `user`) —
  `auth_controller.update` mantém `data: user`, mas troca a mensagem quando o email mudou,
  para quem editou saber que a conta ficou sem acesso até à confirmação. **Atenção**: um
  admin que altere o SEU PRÓPRIO email fica igualmente bloqueado e sem sessão.
- **Duplicação removida**: `frontendUrl()`/`buildVerifyUrl()` eram funções privadas de
  `empresa_controller.ts`; passaram para `helpers/Utils.ts` (`frontendBaseUrl()`,
  `buildActivationUrl()`), ao lado de `buildPasswordDefinitionUrl`. Os dois fluxos têm de
  gerar exactamente o mesmo formato de link (`<FRONTEND_URL>/verify/<token>`).
- **Cuidado com `DateTime.now().toSQL()` num `update()` de coluna datetime** — inclui o
  offset (`'2026-08-16 19:45:22.188 +00:00'`) e o MySQL rejeita com "Incorrect datetime
  value" (apanhado pelo teste, não por leitura). Usar `new Date()`, como
  `Utils.removeRoleFromUser` já fazia. `verification_token_hash_service.cleanExpired()`
  usa `toSQL()` numa comparação (`<`) — não foi tocado nesta sessão, mas vale a pena
  verificar se sofre do mesmo problema.
- Testado em `tests/functional/auth_update_email.spec.ts` (7 testes): os dois emails com
  destinatário/template/dados certos e o link a apontar para o token realmente gravado;
  conta sem acesso depois da alteração (pelo endereço novo E pelo antigo) e reposta depois
  de `verify()`; token antigo inutilizado para `verify()` e para `resetPassword()`; sessões
  revogadas; editar só o username (ou gravar o mesmo email) não envia nada nem bloqueia;
  falha de envio desfaz tudo; isolamento por tenant. `auth_funcionario_crud.spec.ts` ganhou
  `mail.fake()` no grupo — o teste "update altera username e email" passou a enviar email
  real pela Resend sem isso. Nota de API do fake mailer: `nodeMailerMessage.to` é um array
  de **strings**, não de `{address}`.
- Suite completa: 612 testes (eram 605), `tsc --noEmit` sem erros. Sem migrations nem
  permissões novas — nada a correr em BD.

#### 7.11.1 Todos os templates de email reescritos em componentes

Pedido a seguir, na mesma sessão: "os emails podem ter menos caracteres? podem ser mais
simples?" → revisão dos **8** templates, não só dos dois novos.

- **O problema**: cada template repetia ~40 linhas de envelope (doctype, `<head>`, tabela
  de fundo, cartão, `@include` do cabeçalho/rodapé) e ~95 caracteres de `font-family` em
  cada elemento. Uma correcção de compatibilidade tinha de ser repetida 8 vezes; ninguém
  encontrava a mensagem no meio do HTML.
- **7 componentes novos** em `resources/views/emails/components/` (ver a regra na secção
  6). O HTML gerado continua com **todo o CSS inline** — o que encurta é a fonte, não o
  output; o princípio documentado em `taesic_styles.edge` ("o `<style>` é reforço, não
  fonte única") mantém-se intacto. Estrutura do HTML final verificada tag a tag.
- **Resultado**: os 6 templates que já existiam passaram de 666 para 170 linhas; os 8
  emails somam agora 230 linhas + 102 de componentes reutilizados (era ~926). Copy também
  encurtado: fora `eyebrow`, caixas de aviso redundantes, réguas e parágrafos repetidos —
  cada email fica com título, uma ideia, a acção e uma nota de segurança.
- **`tests/functional/emails_render.spec.ts` (8 testes, novos)** — não existia NADA a
  cobrir templates de email: um erro de sintaxe do Edge, uma variável mal escrita ou um
  `@include` inexistente só rebentavam no envio real, e como todos os envios estão dentro
  de try/catch (para não partir o pedido), falhavam **em silêncio**. Envia cada Mailable
  com `mail.fake()` e confirma doctype/cabeçalho/rodapé/ano, os dados interpolados, e que
  não sobra `undefined`, `{{` ou `@component` no HTML. Cobre também dois casos de
  comportamento: `company_activated` sem `password_definition_url` não mostra botão, e
  `promotor_otp`/`email_alterado_aviso` não têm nenhum link (`href="http`) — um OTP ou um
  aviso de segurança com botão é superfície de phishing gratuita.
- Foi este teste que apanhou o `@if(nota){{ nota }} @end` inline no componente do botão
  (o Edge exige tags de bloco em linha própria) — 5 dos 8 emails ficariam **impossíveis
  de enviar**, incluindo activação de conta e recuperação de palavra-passe.
- A regra da secção 6 apontava para partials `alaragest_header`/`alaragest_styles` que já
  não existem (chamam-se `taesic_*`) — corrigido na mesma passagem.
- Suite completa: 620 testes, `tsc --noEmit` sem erros.

### 7.12 Décima primeira sessão — nenhum Vendedor conseguia fechar uma venda (RBAC)

- **Sintoma reportado**: "um vendedor não consegue efectuar uma venda... diz ser falta de
  permissão". **Causa**: `domain_vendapagamento.*` só estava atribuída ao **Admin**.
  Desde que `vendas_repository.close()` passou a exigir pelo menos um `vendapagamento`
  cuja soma bate certo com o total (secção 7.4), registar o pagamento passou a ser um
  passo OBRIGATÓRIO do fluxo — mas o catálogo de permissões (lista à mão no
  `database_seeder.ts`) nunca foi actualizado. `POST venda-pagamento` devolvia 403
  ("Unauthorized Operation") e, sem pagamento, `POST vendas/fechar/:id` rebentava a
  seguir com `VendaSemPagamentoException`. **Vendedor, Gerente e Supervisor — os três
  papéis que existem para vender — não conseguiam fechar uma única venda; só o Admin.**
- **Classe de bug a vigiar**: uma regra de negócio nova que acrescenta um PASSO ao fluxo
  (não só um ecrã novo) exige rever quem tem permissão para esse passo. É a terceira vez
  que o catálogo mantido à mão fica para trás (ver 7.6: Gerente/Supervisor com zero
  permissões; 7.8: `domain_pos.meu`).
- **Corrigido**: `domain_vendapagamento.index/show/store` acrescentadas aos três papéis no
  seeder (e `update`/`destroy` logo a seguir, ver 7.12.1 — o beco do "valor a mais" que
  este parágrafo descrevia como backlog foi resolvido na mesma sessão).
- **Aplicado às bases já existentes** com o comando idempotente que já existia,
  `node ace permissao:conceder <permissao> <papeis...>` (secção 3) — corrido em dev e
  teste. **Numa base de produção é este o caminho, nunca `db:fresh:seed`.**
- **Testado** em `tests/functional/rbac_fluxo_venda.spec.ts` (5 testes): percorre os 12
  nomes de rota do fluxo completo (pos/meu → caixa → catálogo → venda → itens → métodos de
  pagamento → **pagamento** → fechar venda → factura → fechar caixa) para Vendedor,
  Gerente, Supervisor e Admin, e falha com a lista exacta do que falta a cada papel; mais
  um teste de negócio (sem pagamento não fecha; com pagamento fecha). É a rede que faltava:
  `rbac_despesas_relatorios.spec.ts` cobria só um recurso, nunca um FLUXO ponta-a-ponta.
- **Achado ao escrever o teste (não é bug, mas é o segundo "não consigo vender")**:
  `caixa_repository.open()` exige que o utilizador esteja associado ao POS (`userpos`) —
  só o Admin passa sem isso. Um vendedor sem essa associação falha com
  `UserIsNotAPosWorkerException`, não com 403; se o sintoma for esse, o que falta é a
  associação user↔pos (`POST user-pos`), não uma permissão.
- Suite completa: 625 testes, `tsc --noEmit` sem erros.

#### 7.12.1 Corrigir um pagamento — só enquanto a venda está aberta

Sequência directa do ponto anterior: dar só `store` ao Vendedor deixava-o preso quando
registasse um valor **a mais** (`close()` rejeita por excesso e ele não tinha como
desfazer — a menos é recuperável, basta registar outro pagamento pela diferença). Dar-lhe
`update`/`destroy` sem mais nada abria um problema pior: mexer num pagamento de uma venda
**já fechada**, cujo valor a caixa já contabilizou. A saída não era escolher entre os dois
riscos — era pôr a regra no sítio certo.

- **`PagamentoVendaNaoAbertaException`** (`PAGAMENTO_VENDA_NAO_ABERTA`, 400) +
  `vendapagamento_repository` a sobrescrever `update()`/`softDelete()` da `BaseRepository`
  para exigir `vendas.status === 'aberta'`. Vale para **qualquer** papel (Admin incluído)
  e para quem chame o repositório directamente — não é uma regra de permissão.
  - O `softDelete` do projecto é um **toggle**: repor um pagamento apagado também altera a
    soma que `close()` validou, por isso os dois sentidos exigem venda aberta.
  - `update` com `venda_id` diferente (mover o pagamento para outra venda) verifica as
    DUAS vendas — senão bastava reatribuir um pagamento a uma venda fechada para lhe
    alterar o valor pago por fora.
  - Numa venda já fechada a correcção faz-se por reembolso/anulação, nunca editando o
    histórico. `close()` já ignora pagamentos com soft delete (`whereNull('deleted_at')`),
    por isso desfazer com a venda aberta funciona como esperado.
- **`vendapagamento_controller.update/destroy` perderam o try/catch** (padrão antigo, ver
  7.4): apanhavam tudo e devolviam 500, portanto a excepção nova chegaria ao vendedor como
  "Erro interno do servidor" em vez de "a venda já está fechada". Mais 2 dos ~48
  controllers migrados para o handler global.
- `domain_vendapagamento.update/destroy` atribuídas a Vendedor/Gerente/Supervisor (seeder
  + `permissao:conceder` em dev e teste).
- Testado em `tests/functional/vendapagamento_correccao.spec.ts` (7 testes): o vendedor
  desfaz um pagamento a mais e fecha a venda sozinho; corrigir pelo `update` também serve;
  com a venda fechada nem apagar nem editar; não se ressuscita um pagamento apagado depois
  do fecho; não se move um pagamento para uma venda fechada; a correcção não atravessa
  tenants; e os três papéis têm mesmo as permissões.
- **Nota de teste**: `assert.rejects(fn, X)` compara `X` com a **mensagem** quando `X` é
  string — passar `Exception.name` nunca falha por engano nenhum, passa a comparar texto.
  Passar a própria classe (`assert.rejects(fn, MinhaExcepcao)`) é o que verifica o tipo.
- Suite completa: 632 testes, `tsc --noEmit` sem erros.

#### 7.12.2 `permissao:conceder` / `permissao:revogar` — por recurso, não por acção

A pedido: gerir RBAC pela linha de comandos sem escrever uma linha por acção, e poder dar
"só leitura" ou "só escrita". `permissao:conceder` passou a aceitar **duas formas de alvo**
e ganhou um par simétrico, `permissao:revogar` (ver a tabela da secção 3 para a sintaxe).

- **Motor partilhado em `app/helpers/rbac_permissoes.ts`** (não dentro dos `BaseCommand`):
  os dois comandos precisam da mesma resolução de nomes, e assim testa-se sem simular uma
  execução de ace — `tests/functional/rbac_permissoes_helper.spec.ts` (10 testes).
- **`--leitura`/`--escrita` cobrem só os sufixos canónicos** (`index/show`,
  `store/update/destroy`). As acções próprias de cada recurso (`.anular`, `.catalogo`,
  `.meu`, `.validar`, ...) ficam deliberadamente de fora: nada no nome diz com segurança se
  lêem ou escrevem, e adivinhar isso numa fronteira de acesso é como se criam buracos. São
  **assinaladas** em cada corrida ("acções próprias fora de --leitura: ...") e concedem-se
  pelo nome exacto ou com `--tudo`.
- **`revogar` apaga mesmo a linha `papel_permissao`**, não faz soft delete: com
  `unique(papel_id, permissao_id)`, uma linha apagada bloquearia qualquer reatribuição
  futura. Em contrapartida, `conceder` sabe **repor** uma associação que esteja com soft
  delete (estado que a API consegue produzir), em vez de responder "já tinha" a quem não tem.
- **Bug de segurança encontrado e corrigido pelo caminho**: `userHasPermission` não filtrava
  `papel_permissao.deleted_at`. Como o recurso `papel_permissao` faz soft delete (é o
  `destroy` da `BaseRepository`), **retirar uma permissão a um papel pela API não revogava
  nada** — a pessoa continuava a passar no `permission_middleware`, sem nada a assinalar.
  Corrigido em `app/helpers/Utils.ts` com teste próprio. Não havia nenhuma linha nesse estado
  (dev: 851 associações, 0 apagadas), por isso a correcção não alterou o acesso de ninguém.
- **`Admin`/`Platform_Admin` exigem `--forcar` para revogar** (`PAPEIS_CRITICOS`): são os
  papéis que atribuem permissões aos outros. `--simular` existe nos dois comandos e é o
  primeiro passo recomendado antes de qualquer revogação.
- Suite completa: 642 testes, `tsc --noEmit` sem erros.
- **Achado do ambiente (não é do código, mas afecta scripts/CI)**: com **Node v24.18.0**
  neste Windows, QUALQUER comando ace que arranque a aplicação termina em *segmentation
  fault* no teardown — o comando faz o trabalho todo e imprime tudo, mas devolve **exit 139**
  em vez de 0 (`node ace list:routes`, `seed:qa-tenant`, etc.; só `ace --help`, que não
  arranca a app, sai a 0). Consequência prática: não encadear comandos ace com `&&` nem
  confiar no código de saída em CI enquanto isto não for resolvido — o caminho provável é
  correr Node 22 LTS.

### 7.13 Décima segunda sessão — papéis passam a pertencer a uma EMPRESA

Pedido: "a gestão dos papéis deve ser por inquilino... e toda a gestão deve ser feita pela
empresa". As **permissões ficaram deliberadamente fora** — decisão discutida e aceite antes
de implementar: uma permissão aqui é um nome de rota (`domain_produtos.store`), ou seja, o
que o *software* sabe fazer. Um inquilino não pode inventar uma; por empresa seriam 296
linhas duplicadas por cada uma, e cada rota nova exigiria um backfill em todas — falhar uma
tiraria a funcionalidade a essa empresa em silêncio. O que a empresa escolhe é QUAIS das
permissões existentes cada um dos SEUS papéis tem.

#### Os três âmbitos (`papel.escopo`)

| escopo | `empresa_id` | o que é |
|---|---|---|
| `plataforma` | NULL | os 5 `Platform_*`, do dono da plataforma |
| `modelo` | NULL | os 10 padrões, clonados no registo de cada empresa. **Nunca atribuíveis** |
| `empresa` | preenchido | os papéis próprios de uma empresa — os únicos que um utilizador de inquilino recebe |

- `escopo` existe porque a alternativa era decidir pelo NOME, e **era aí que estava a
  armadilha desta mudança**: `AdminOnlyMiddleware` reconhecia o dono da plataforma por
  `nome LIKE 'Platform_%'`. Com a unicidade a passar a ser por empresa, bastava a uma
  empresa criar um papel chamado `Platform_Admin` e atribuí-lo a si própria para **escalar
  de inquilino a administrador da plataforma**, com acesso cross-tenant a tudo. O
  middleware, o seeder e a atribuição de papéis passaram todos a decidir por `escopo`. O
  prefixo `Platform_` continua proibido a inquilinos (`nomeDePapelReservado`), mas já não
  decide autorização nenhuma — é só para o nome não induzir em erro quem lê um ecrã de
  gestão ou uma linha de auditoria. Testes em `papel_por_empresa.spec.ts` e
  `admin_only_middleware.spec.ts`.
- **Unicidade**: `unique(empresa_id, nome)` NÃO servia — no MySQL os NULL contam como
  distintos num índice único, portanto dois `Platform_Admin` passariam ambos. Resolvido com
  a coluna gerada `chave_escopo = COALESCE(empresa_id, escopo)` + `unique(chave_escopo,
  nome)`, que cobre os três casos de uma vez. `deleted_at` NÃO entra no índice (mesmo
  problema dos NULL: duas linhas activas com o mesmo nome passariam ambas); um papel
  apagado é **revivido** ao ser recriado com o mesmo nome, como já se faz em
  `domain_user_papel.assign()`.
- **A coluna gerada tem de ser `VIRTUAL`, não `STORED`.** `STORED` obriga o InnoDB a
  reconstruir a tabela, e isso falha com `ER_CANNOT_ADD_FOREIGN` numa tabela envolvida em
  chaves estrangeiras (`papel.empresa_id`, mais `user_papel`/`papel_permissao` a apontar
  para cá). Apanhado a correr a migração: como o MySQL não faz DDL transaccional, a versão
  `STORED` deixou as colunas criadas e a migração por registar, e a corrida seguinte falhou
  com "Duplicate column name". **Se voltar a acontecer noutra tabela, é este o motivo.**
- `CHECK papel_escopo_empresa_chk` garante o invariante na BD: `escopo='empresa'` se e só se
  `empresa_id NOT NULL`. Nenhum caminho de código consegue gravar a combinação errada.

#### Migração e backfill

`1784662475791_alter_papel_por_empresa` (esquema) + `1784662475792_backfill_papel_por_empresa`
(dados). O backfill **não apaga nada** (os padrões ficam como `modelo`) e **aborta** se
sobrar uma única atribuição a apontar para um `modelo` — uma migração de acessos que falha
em silêncio descobre-se quando alguém não consegue trabalhar, ou pior, quando alguém
consegue o que não devia. É idempotente. Verificado contra os dados reais de dev: 2
empresas, 20 papéis clonados, 1504 ligações, as 20 atribuições activas preservadas, 0
órfãs.

#### O que mudou no código

- **`clonarPapeisPadrao(empresaId, trx)`** (`app/helpers/papeis_da_empresa.ts`) — chamado em
  `empresa_repository` DENTRO da transacção de registo e ANTES de `giveRoleToUser(user,
  'Admin')`: sem os clones não existe "Admin" no âmbito da empresa e o registo rebenta (de
  propósito). Faz **5 idas à BD** independentemente do número de papéis — a primeira versão
  fazia uma consulta por papel e tornava a suite impraticável (~350 empresas por corrida).
  Os ids são gerados em Node (`randomUUID`, v4) e não com o `UUID()` do MySQL, que produz
  v1: há validadores e parâmetros de rota que exigem o formato v4.
- **`giveRoleToUser`** resolve o papel no âmbito DO UTILIZADOR (a sua empresa, ou plataforma
  se não tiver). O `?.id || ''` anterior produzia um erro de chave estrangeira sem relação
  visível com a causa; agora **lança**. Dar plataforma a alguém que também tem empresa exige
  `{ escopo: 'plataforma' }` explícito — não é fallback automático, senão bastaria conseguir
  passar "Platform_Admin" como nome de papel para escalar.
- **`apenasPapeisUtilizaveis`** (segunda tranca, em `userHasPermission`/`getUserPermissions`/
  `getUserRoles`): um papel de outra empresa não concede nada, um `modelo` nunca conta, e
  **`papel.deleted_at` passou a filtrar** — um papel apagado continuava a conceder as suas
  permissões, o que não fazia diferença enquanto ninguém podia apagar papéis.
- **`domain_user_papel.assign`** verificava `nome.startsWith('Platform_')`; passou a
  `papel.pertenceA(empresa.id)`, que recusa de uma vez os de plataforma, os `modelo` **e os
  de outra empresa** — este último passava sem nada a assinalar, porque tem nome de
  inquilino e o `papel_id` vem do corpo do pedido. `listAssignableRoles` passou a exigir o
  `company_alias` (devolvia todos os papéis de inquilino da plataforma).
- **`papel_repository` (plataforma)** restringe `baseQuery()` a `empresa_id IS NULL`. Além
  de a listagem não ficar enterrada em cópias de inquilinos, fecha um buraco: `update` e
  `softDelete` dessa rota não têm — nem faz sentido terem — noção de empresa, portanto um
  `PUT api/papel/<id>` com o id de um papel de um inquilino renomeava-o. `papel_validator`
  passou a verificar unicidade só no espaço de nomes da plataforma (antes procurava em toda
  a tabela, o que impediria criar um modelo só porque alguma empresa já usara o nome).
- **`auth_validator`**: o `papel` do registo de funcionário era uma `vine.enum` com sete
  nomes fixos — bloquearia qualquer papel criado pela empresa. Passou a `.exists()` contra
  a BD, restrito a `escopo='empresa'` e a esta empresa: mais flexível E mais apertado. Nota:
  a lista fixa excluía "Admin"/"Gerente"/"Supervisor", mas **não era uma fronteira de
  segurança** — quem tem `domain_auth.register` também tem `domain_user_papel.store` e
  sempre pôde fazê-lo em dois passos.

#### Recurso novo: `api/:company_alias/papeis` (`domain_papel.*`)

CRUD dos papéis da própria empresa + `GET papeis/permissoes-disponiveis` (catálogo, só
leitura, **só `domain_*`** — mostrar permissões de plataforma a um inquilino seria oferecer
nomes que ele nunca deve poder conceder). Registada ANTES do resource, mesmo motivo de
`caixas/meu`. Controller sem try/catch (padrão do handler global). Permissões novas
atribuídas a Admin (tudo) e a AdminVisualizador/AdminUserManager/AdminUserVisualizador
(leitura) — **estes três já referenciavam `domain_papel.index/show` no seeder como nomes
órfãos**, silenciosamente ignorados por a permissão não existir no catálogo.

- **`assertNaoFicaSemGestao`**: a empresa nunca pode ficar sem ninguém com
  `domain_papel.update`. É o footgun óbvio de delegar esta gestão — o Admin tira a si
  próprio a permissão (ou apaga o papel) e a empresa fica trancada fora da sua própria
  gestão de acessos, só destrancável por intervenção manual do dono da plataforma. Corre
  DEPOIS da alteração, dentro da transacção: pergunta "como fica isto?" em vez de tentar
  prever todos os caminhos que lá chegam. A regra é "não ficar sem gestão", não "o Admin é
  intocável" — uma empresa que organize os papéis de outra maneira não fica presa.
- Substituir permissões **apaga** as ligações em vez de soft delete (`unique(papel_id,
  permissao_id)` bloquearia a reatribuição futura), e um nome de permissão desconhecido é
  **recusado**, não ignorado — um ecrã de permissões que mente é pior do que um erro.

#### ATENÇÃO — consequência operacional que não pode ser esquecida

Conceder uma permissão ao papel `modelo` só afecta empresas criadas **a partir de então**.
As que já existem têm as suas cópias e não mudam. Por isso `permissao:conceder` e
`permissao:revogar` ganharam âmbito:

```
node ace permissao:conceder <perm> <papel>                    # modelos + plataforma
node ace permissao:conceder <perm> <papel> --todas-empresas   # a cópia em TODAS as empresas
node ace permissao:conceder <perm> <papel> --empresa <alias>  # só nessa empresa
```

Sem `--todas-empresas`, cada regra de negócio nova que exija uma permissão nova volta a
passar ao lado dos inquilinos já registados, e o sintoma aparece como um 403 que ninguém
relaciona com a causa. **Já aconteceu três vezes** neste projecto com o catálogo mantido à
mão (secções 7.6, 7.8 e 7.12 — esta última deixou os vendedores sem conseguir fechar uma
única venda).

#### Fixtures

`createEmpresa()` passou a clonar os padrões, como uma empresa real. Não é conveniência:
uma empresa sem papéis é uma empresa que não pode existir em produção, e uma fixture que
produzisse esse estado deixaria testes a passar sobre uma realidade que o registo nunca
cria. `createEmpresa({ comPapeis: false })` para quem quiser mesmo uma empresa nua.
**`Papel.findByOrFail('nome', X)` deixou de identificar um papel** — nos testes, resolver
sempre pela empresa (ver o helper `papelDaEmpresa` em `domain_user_papel.spec.ts` e em
`rbac_permissoes_helper.spec.ts`).

- Suite completa: **674 testes** (eram 642), `tsc --noEmit` sem erros. Migrations corridas
  em dev e em teste; permissões novas aplicadas em dev com `permissao:conceder` (nos
  modelos e com `--todas-empresas`) e em teste via `db:fresh:seed`.

### 7.14 Décima terceira sessão — as duas auditorias do backlog (7.10), fechadas

Ambas estavam listadas em 7.10 como "vale a pena numa sessão futura". Cada uma escondia
bugs vivos, não só arrumação.

#### Colunas fantasma — 26 encontradas, 3 endpoints partidos

Um `@column()` declarado num model para uma coluna que a tabela não tem. É inerte enquanto
ninguém a escreve (o Lucid só insere atributos atribuídos, e `SELECT *` simplesmente não a
traz) e um 500 "Unknown column" no dia em que um validador a aceitar. A origem é sempre a
mesma: a linha existe na migração, **comentada** — havia 38 dessas linhas.

A auditoria NÃO foi feita por grep aos comentários, mas comparando o que cada model declara
com `information_schema` — encontra todos os casos, incluindo os que nunca tiveram uma linha
comentada. Resultado:

| coluna | alcançável? | resolução |
|---|---|---|
| `cobranca.data_emissao` | **sim, e obrigatória no validador** | coluna criada |
| `pessoa.ativo` | **sim** (aceite em create e update) | coluna criada |
| `enabled` em 24 models | não (nenhum validador a aceitava, salvo `vendas`, que a descartava) | **retirada dos models** |
| `app/models/example.ts` | ficheiro de 0 bytes, tabela inexistente | apagado |

- **`POST api/:company_alias/cobranca` estava completamente inutilizável**: `data_emissao` é
  obrigatória em `cobranca_validator`, portanto todos os pedidos a enviavam e todos
  rebentavam. `relatorios_plataforma_repository` já contornava isto a usar `created_at`.
- `enabled` foi **retirada** e não criada, ao contrário das outras duas: duplicaria
  `deleted_at`, que é o que este projecto usa em todo o lado para activar/desactivar (o
  `softDelete` da BaseRepository é um toggle). Criar 24 colunas que ninguém lê seria trocar
  um problema por outro maior. Retirada de 24 models, 25 DTOs e das 2 regras em
  `vendas_validator` que ainda a aceitavam do cliente.
- **A rede que impede o regresso**: `tests/functional/colunas_fantasma.spec.ts` compara
  TODOS os models com o esquema real. Falha no momento em que alguém acrescenta um
  `@column()` sem a migração — quando custa um minuto, em vez de um 500 em produção.
- Migration `1784662475793_alter_colunas_fantasma`. `data_emissao` é nullable e as cobranças
  existentes ficam com `created_at` (a melhor aproximação verdadeira; inventar uma data
  seria pior do que a ausência dela).

#### `exists !== undefined` — 33 regras que nunca rejeitavam nada

`db.from(...).first()` devolve `null` quando não há linha, e `null !== undefined` é `true`.
Todas estas regras `.exists()` devolviam sempre `true`. Corrigidas para `!!exists` em 14
validadores. Verificado caso a caso: **nenhuma tinha um filtro extra (tenant, etc.) a ser
silenciosamente ignorado** — eram todas verificações simples de existência por id, portanto
o efeito era um 500 de chave estrangeira em vez de um 400 legível. Continua a valer a pena
rever se algum destes `.exists()` DEVIA ter filtro por empresa (ex.:
`produto_media_validator` aceita qualquer `produtos.id`, sem verificar de quem é) — isso é
uma questão diferente e fica em aberto.

#### `POST api/papel-permissao` rejeitava sempre — três defeitos sobrepostos

Encontrado ao rever o `exists`. No mesmo validador:

1. o `.unique()` consultava **`user_papel`**, a tabela errada — perguntava se o utilizador X
   tem o papel Y para decidir se o papel Y já tem a permissão Z;
2. `!(await db.from(...).where(...))` **sem `.first()`**: esperar por um query builder
   devolve um ARRAY, e um array vazio é truthy em JS, portanto o `!` dava sempre `false`
   ("não é único") e a validação rejeitava **qualquer** par, incluindo um inteiramente novo;
3. o `.exists()` ao lado aceitava tudo (o bug acima).

Os defeitos 2 e 3 cancelavam-se na aparência — um rejeitava tudo, o outro aceitava tudo — o
que é provavelmente a razão de nenhum ter sido notado. Reescrito num helper `parNaoExiste`
que consulta `papel_permissao` com `.first()`. Não filtra `deleted_at`, tal como a constraint
`unique(papel_id, permissao_id)` da BD não filtra. 5 testes em
`papel_permissao_validator.spec.ts`.

**Lição a reter**: `!(await queryBuilder)` sem `.first()`/`.count()` é sempre um bug — vale
um grep periódico por `!(await db`.

- Suite completa: **682 testes** (eram 674), `tsc --noEmit` sem erros. Migration corrida em
  dev e em teste.

#### Continua em aberto (identificado, não corrigido) — **resolvido em 7.15**

**Não há forma de suspender uma empresa.** `ValidateCompanyAliasMiddleware` verifica o
alias, o dono e o `verified` — nunca `empresa.status`, `inadiplente` ou `deleted_at`. Um
botão "suspender" no backoffice seria decorativo, e hoje não há como cortar o acesso a um
inquilino comprometido ou em dívida. Não corrigido de propósito: `status` é um boolean sem
semântica documentada (activa? aprovada?), e inventar o significado de uma coluna numa
fronteira de acesso é como se partem sistemas em produção. Precisa de decisão explícita
sobre o que cada flag significa, e da acção correspondente no backoffice — incluindo revogar
os tokens vivos, senão a suspensão só vale para quem voltar a autenticar-se.

### 7.15 Décima quarta sessão — suspender uma empresa deixa de ser impossível

Fecha o item que 7.14 deixou explicitamente em aberto ("não há forma de suspender uma
empresa"). Era o bloqueador do backoffice: sem ponto de aplicação, qualquer botão
"suspender" seria decorativo.

#### Colunas novas, e não `status`/`inadiplente`

A decisão que 7.14 recusou tomar sozinha. `status` e `inadiplente` já existem, e é
precisamente esse o problema: são booleans sem semântica escrita em lado nenhum
(`status` significa "activa"? "aprovada"? "a pagar"?), com valores já gravados sob a
interpretação de quem os escreveu na altura. Dar-lhes agora significado numa **fronteira
de acesso** seria decidir retroactivamente quem fica de fora, a partir de dados que nunca
quiseram dizer isso.

`suspensa_em` (+ `suspensa_motivo`, `suspensa_por`) não tem esse passado: NULL é "não
suspensa" para toda a gente, incluindo para as linhas que já existiam, e nenhum
comportamento actual muda de sentido por baixo de código que depende das outras duas.
Migração `1784662475794_alter_empresa_suspensao`.

- `CHECK empresa_suspensao_chk` garante que `suspensa_em` e `suspensa_motivo` andam
  sempre juntos. Uma suspensão sem motivo é uma que ninguém consegue explicar nem
  reverter com confiança três meses depois. `suspensa_por` fica de fora do invariante de
  propósito: uma suspensão feita por comando ace ou por rotina de cobrança não tem
  utilizador para apontar, e recusá-la por isso seria pior.
- `suspensa_por` é FK para `user` com `ON DELETE SET NULL` — apagar o administrador que
  suspendeu não pode reactivar a empresa que ele suspendeu.
- Ao contrário da coluna gerada de 7.13, acrescentar colunas normais + CHECK a uma tabela
  com chaves estrangeiras não reconstrói a tabela e correu à primeira nas duas bases.

#### Os quatro pontos onde a suspensão morde

1. **`ValidateCompanyAliasMiddleware`** — o portão por onde passam TODAS as rotas de
   inquilino. Uma verificação cobre o produto inteiro; a alternativa era repeti-la por
   repositório e bastaria esquecer um. **403, não 404**: quem bate à porta é o próprio
   inquilino, e fingir que a empresa não existe transforma um corte deliberado num "a
   aplicação avariou" — que acaba num pedido de suporte em vez de num telefonema a tratar
   da causa. O motivo gravado não vai na resposta.
   O `select` passou a ser explícito: a consulta trazia `*` das três tabelas achatadas num
   objecto, e `suspensa_em` só não colidia com nada por sorte.
2. **`auth_repository.login()`** — sem isto, o login continuava a entregar um bearer token
   válido a quem está cortado, e o frontend deixava a pessoa entrar para depois bater em
   403 a cada clique. A verificação é pelo `empresa_id` do **utilizador**, não pelo
   `company_alias` do pedido: esse é opcional nesta rota, e bastaria omiti-lo para
   contornar uma verificação feita sobre ele.
3. **Revogação das sessões vivas**, na mesma transacção da suspensão. É o ponto que 7.14
   já tinha antecipado: sem ele a suspensão só valeria para quem voltasse a autenticar-se.
   Mesmo caminho de `auth_repository.update()` — `User.accessTokens` não aceita a
   transacção, portanto apaga-se por `auth_access_tokens` directamente.
4. **Catálogo público** (`catalogo_produtos_query.ts`) — a única superfície onde os
   produtos de um inquilino continuavam visíveis depois do corte. Deixar lá a montra de
   uma empresa suspensa por fraude é continuar a fazer-lhe publicidade.

#### Decisões que valem a pena reter

- **`suspender` é idempotente e não reescreve a suspensão original.** Um segundo clique
  não muda a data nem o motivo (quem quiser corrigir reactiva e volta a suspender, e fica
  tudo em `security_logs`), mas **revoga as sessões na mesma**: o invariante que interessa
  é "empresa suspensa não tem sessões vivas", e um segundo clique é a coisa mais natural
  do mundo para quem desconfie que o primeiro não pegou.
- **`reactivar` não devolve sessões a ninguém.** Quem tinha um token perdeu-o e volta a
  autenticar-se — uma reactivação não pode ressuscitar a sessão do portátil roubado que
  motivou a suspensão.
- **`SuspenderPropriaEmpresaException`** (409): um administrador de plataforma que também
  pertença a uma empresa não a pode suspender — revogaria a sua própria sessão e fecharia
  a porta com a chave lá dentro. A verificação vive no repositório, não no controller,
  porque um comando ace chega por outro caminho e o footgun é o mesmo. Mesmo espírito de
  `assertNaoFicaSemGestao` (7.13).
- Rotas: `POST api/empresas/:id/suspender` e `.../reactivar`, no grupo `adminOnly`. POST e
  não PATCH: não é a edição de um campo, é uma acção com efeitos colaterais e motivo
  obrigatório. `actor_id` vem sempre de `auth.user`, nunca do corpo do pedido.
- **O que a suspensão NÃO corta**, deliberadamente: o painel do promotor. Um promotor não
  é utilizador da empresa e o que ele vê é o histórico das suas próprias comissões —
  suspender um cliente não apaga vendas que aconteceram.

- Suite completa: **693 testes** (eram 682), `tsc --noEmit` sem erros. Migração corrida em
  dev e em teste. Testes em `tests/functional/empresa_suspensao.spec.ts`.

### 7.16 Auditoria do KYC — qualquer pessoa regista o NIF de qualquer empresa

Revisão pedida na mesma sessão. **A camada 1 foi corrigida em 7.17** (pontos 3, 4 e 5
abaixo); o resto continua em aberto e precisa de decisão de produto. O resumo: **o NIF não
é verificado em lado nenhum no registo**. Nada prova que quem regista
tem alguma relação com a empresa cujo NIF escreve.

#### O que o registo faz hoje

`CreateCompanyWithUserAndStartACompanyDetalhes` valida `empresa_nif` com uma única regra:
não existir já na tabela. Não há formato, não há comprimento, não há consulta ao portal.

- **O verificador existe e não é chamado.** `helpers/Utils.ts` tem `companyExists(nif)`,
  que consulta um portal externo, e dois validadores que o usam
  (`createempresaValidator`, `CreateCompanyWithUserAndStartACompany`) — **nenhum dos dois
  está ligado a rota nenhuma**. É código morto. Pior: chama
  `http://consulta.edgarsingui.ao` em **HTTP simples**, um terceiro fixo no código, e
  devolve `false` em qualquer erro (portal em baixo = "empresa não existe").
- **O serviço bom também não é chamado.** `NifRepository`/`api/nif/:nif` fala com o portal
  do Minfin, tem cache, timeout e distingue "não existe" de "não conseguimos consultar" —
  e devolve o **nome oficial**, o estado e o regime de IVA. O registo nunca lhe toca.
- **No frontend é enfeite, e está escrito no código**: "Conveniência, NUNCA um requisito".
  O formulário mostra o nome oficial ao lado do campo; o backend aceita o que lhe
  mandarem, venha do formulário ou de um `curl`.

#### Consequências, por ordem de gravidade

1. **Facturação com o NIF de outra empresa.** `empresa.nif` e `empresa.nome` saem nas
   facturas, que são documentos fiscais. Hoje qualquer pessoa abre uma conta com o NIF de
   uma empresa real e emite facturas em nome dela.
2. **Ocupação de nome (squatting) sem forma de disputa.** `nome` e `company_alias` têm
   unicidade a sério na BD. Quem registar primeiro o NIF/nome de uma empresa real
   impede-a de se registar, para sempre — e como `empresa:clean:expired` só apaga contas
   **não activadas**, basta ao ocupante confirmar o seu próprio email para o lugar ficar
   dele. Não existe processo de reclamação.
3. **`nif` NÃO tem índice único na base de dados** (`nome` e `company_alias` têm).
   Verificado com `SHOW INDEX FROM empresa`. A unicidade é só do validador, o que a torna
   uma corrida: dois registos simultâneos com o mesmo NIF passam os dois.
4. **A unicidade do validador contorna-se com um espaço.** `empresa_nif` não tem `.trim()`.
   Verificado contra a coluna real: `nif = '5000000000'` devolve 1 linha, `' 5000000000'` e
   `'5000000000 '` devolvem 0 — ambas passam o `.unique()` e ficam gravadas como NIFs
   diferentes.
5. **Sem `maxLength`.** A coluna é `varchar(255)` e o `sql_mode` tem `STRICT_TRANS_TABLES`:
   um NIF com 300 caracteres é um erro 1406 do MySQL que o controller devolve como 500.
6. **`api/resend-company-activation-email` é um oráculo de enumeração.** O validador
   rejeita `nif_ou_company_alias` que não exista, portanto a resposta diz se um dado NIF
   está registado na plataforma. Tem `emailActionThrottle`, o que limita o ritmo mas não
   fecha o oráculo.
7. **`empresa_regime_iva` é auto-declarado** e decide o cálculo de IVA nos relatórios.

#### A resposta à pergunta "faz sentido registar por NIF?"

Faz — o NIF é a identidade fiscal certa e é o que tem de sair na factura. O que não faz
sentido é **tratá-lo como um campo de texto**. Um NIF é uma afirmação sobre uma entidade
real, e hoje é aceite sem prova nenhuma. As três camadas, por ordem de custo:

1. **Barato e sem decisão de produto** (defeitos puros): `.trim()`, `maxLength`, formato, e
   **índice único na BD**. Nada disto muda regras de negócio.
2. **O NIF tem de existir no portal**, com o `nome` a bater certo com o oficial (o
   `NifRepository` já devolve ambos). Exige decidir o que fazer quando o portal está em
   baixo: bloquear o registo, ou deixar entrar em estado "por verificar" com acesso
   limitado. **Recomendo o segundo** — o portal esteve 4-14s a responder nos testes e um
   registo que falha por causa dele é receita perdida.
3. **Prova de posse**, que é a única que fecha mesmo: documento de constituição carregado e
   aprovado no backoffice, ou email num domínio verificado da empresa. Isto é um fluxo de
   KYC com revisão humana — cabe no backoffice que está por construir, e é aí que se liga
   à suspensão de 7.15: enquanto não houver prova, a suspensão é o remédio para o caso que
   escapar.

Enquanto (2) e (3) não existirem, **7.15 é a única contenção**: dá para cortar uma empresa
registada de má fé, mas só depois de alguém reparar.

### 7.17 Camada 1 do KYC + o terreno para o backoffice

Fecha a camada 1 de 7.16 e prepara o backend para um segundo frontend.

#### `empresa.nif` — os defeitos puros, corrigidos

Só o que não exige decisão de produto. Continua a não haver verificação nenhuma de que
o NIF existe ou é de quem o escreve — 7.16 mantém-se em aberto nos pontos 1, 2, 6 e 7.

- **`.trim()` no validador de registo.** Era o buraco mais fácil de explorar: sem ele,
  `' 5000000000'` é outra string para o MySQL, passava o `.unique()` e ficava gravada
  como um NIF distinto. Verificado contra a coluna real antes e depois.
- **`minLength(5)`, `maxLength(20)` e `[A-Za-z0-9]+`.** O alfabeto é o mesmo que a rota
  de consulta já aceita. **Não** se fixou o formato exacto de propósito: um NIF de
  empresa tem 10 dígitos, mas o de um particular é o número do BI (dígitos + duas letras
  + dígitos), e recusar um NIF válido é pior do que aceitar um mal formado — que a
  consulta ao portal apanharia, se algum dia for ligada.
- **Índice único `empresa_nif_unique`** (`1784662475795_alter_empresa_nif_unico`).
  `nome` e `company_alias` sempre tiveram um; `nif` não. Sem ele a unicidade era só uma
  regra do validador — logo, uma corrida entre dois registos simultâneos, e nula para
  qualquer caminho que não passe por lá (comando ace, seeder, correcção à mão).
  A migração **normaliza com `TRIM()` primeiro e aborta com a lista de repetidos** se
  algum sobrar: escolher qual das empresas duplicadas fica com o NIF é decisão de
  negócio, não de migração.
- Maiúsculas não precisaram de normalização: a coluna é `utf8mb4_0900_ai_ci`, portanto o
  `.unique()` do validador e o índice concordam a ignorá-las. O que não podia acontecer
  era um discordar do outro.
- 6 testes em `tests/functional/empresa_registo_nif.spec.ts`.

#### As rotas de plataforma passam a poder não existir

Decisão tomada com o utilizador: o backoffice **não** ganha um backend próprio. O grupo
`adminOnly` já existe aqui, e copiá-lo significaria duas bases de código sobre **uma só
base de dados** — com a pergunta por responder de quem é dono de `database/migrations`, e
com models/DTOs/validadores a divergir em silêncio (a rede do `colunas_fantasma` só
protege a cópia onde corre).

O argumento de segurança para separar era sobre a **origem no browser**: um XSS no lado do
inquilino a correr na mesma origem que a sessão do administrador. Isso é uma propriedade
do frontend — uma API não tem fronteira de origem, tem autenticação e `adminOnly`.

`PLATFORM_ROUTES_ENABLED=false` faz com que o grupo inteiro **não chegue a ser
registado**: 404, como um caminho inventado. O mesmo build vai para duas instâncias — a
pública com isto desligado, a restrita (VPN/lista de IPs) com isto ligado. Verificado com
`list:routes`: 45 rotas `platform_*` passam a 0, e as 212 `domain_*` ficam intactas.

Ausente = ligado, para nenhum deploy actual mudar de comportamento ao actualizar. **Não é
uma fronteira de acesso por si** — registadas ou não, estas rotas continuam a exigir
autenticação e um papel de escopo `plataforma`. Reduz superfície; não substitui o portão.

#### `ApenasBffMiddleware` conhece dois segredos

Um segundo frontend seria recusado por um middleware que só conhecia um. Agora
`BFF_SHARED_SECRET` (app dos inquilinos) e `BFF_SHARED_SECRET_BACKOFFICE`.

- **Duas variáveis, não uma lista separada por vírgulas.** Um segredo é texto arbitrário
  e uma vírgula lá dentro partiria a lista em silêncio. Assim cada frontend também se
  roda sem tocar no outro.
- **Sem `find`/`some` no ciclo de comparação**, de propósito: esses param no primeiro que
  casa, e o número de comparações passaria a depender de qual dos segredos acertou. O
  ciclo compara sempre contra todos.
- Continua a falhar aberto quando nenhum está configurado — activar é deliberado.
- 7 testes em `tests/functional/apenas_bff_middleware.spec.ts`. O middleware nunca tivera
  nenhum; um frontend novo é exactamente o tipo de mudança que parte um portão em
  silêncio, nos dois sentidos.
- `CORS_ORIGINS` não precisou de código: já aceita várias origens por vírgula.

#### O projecto do backoffice

`taesic-backoffice` criado por cópia de `alaragest-webpage` (sem `.git`, sem
`node_modules`, sem `.env`), com `git init` próprio e **sem remote** — repositório não
partilhado, como pedido. Copiar em vez de começar do zero leva o design system, o BFF e a
canalização da sessão, que é a parte cara; a poda dos ecrãs de inquilino é o trabalho.

- Suite completa: **706 testes** (eram 693), `tsc --noEmit` sem erros. Migração corrida em
  dev e em teste.
