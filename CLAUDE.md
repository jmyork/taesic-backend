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

#### As rotas de plataforma passam a poder não existir — **revertido em 7.18**

> A decisão desta subsecção durou pouco: 7.18 tirou as rotas de plataforma deste backend
> por completo, e a flag `PLATFORM_ROUTES_ENABLED` deixou de existir. Fica aqui o
> raciocínio, que continua a valer para perceber porque é que a separação de rede não é a
> mesma coisa que a separação de código.

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

#### 7.17.1 Os relatórios de plataforma estavam inalcançáveis por um administrador de plataforma

Encontrado ao construir o primeiro ecrã do backoffice, que é precisamente o que estas
rotas servem. **Dois portões em série que não concordavam**, e cada um errado no sentido
oposto:

| portão | critério | quem passa |
|---|---|---|
| `adminOnly()` | `papel.escopo = 'plataforma'` | os `Platform_*` — correcto |
| `RelatoriosPlataformaPolicy` | `IsUserAnAdmin()`, papel chamado literalmente `admin` | o **Admin de inquilino** — exactamente o contrário |

Uma conta só de plataforma passava a primeira e falhava a segunda: as cinco rotas
`relatorios-plataforma/*` estavam mortas para quem existe para as usar. E o Admin de
qualquer empresa satisfazia a policy — não era um buraco aberto, porque `adminOnly()` o
barra antes, mas o único dos dois portões a decidir por si autorizava quem não devia.

**A causa é a de 7.13, com efeito retardado.** `IsUserAnAdmin` procura o nome `admin`, e
isso descrevia o mundo enquanto `papel.nome` era único globalmente. Desde que os papéis
passaram a pertencer a uma empresa, "Admin" é o papel MODELO de inquilino, clonado por
empresa — e nenhum `Platform_*` se chama assim. A migração de 7.13 tratou do middleware,
do seeder e da atribuição de papéis; **esta policy passou ao lado**, porque nada a
exercitava.

- Passa a usar `userHasPlatformRole()`, o MESMO critério do middleware. Os dois portões
  deixam de poder discordar, que era a raiz — não o nome errado em si.
- **`IsUserAnAdmin` continua a existir e continua a decidir por nome.** É usada por outras
  policies de plataforma (`plano`, `taxa_iva`, ...). Não foi tocada nesta passagem porque
  cada uma precisa de ser vista caso a caso — mas **é backlog real, e do mesmo género**:
  `grep -rn "IsUserAnAdmin" app/policies`.

#### O 500 que devia ser 403

O `catch` genérico do controller apanhava a excepção do Bouncer e respondia **500 "Erro
interno do servidor"** a quem simplesmente não tinha autorização. Com a policy partida,
era isto que um administrador de plataforma via: não um "não pode", mas um "a aplicação
avariou" — que manda investigar o sítio errado e transforma um problema de autorização
num pedido de suporte.

`relatorios_plataforma_controller` perdeu o try/catch nas 5 acções (mais 5 dos ~48 a
migrar para o handler global). O handler já traduz as duas coisas: `error.messages` do
VineJS → 400 com os erros, qualquer `Exception` → o seu próprio status, logo 403 para o
Bouncer. Fixado em `http_exception_handler.spec.ts`.

**Lição a reter**: um try/catch que devolve sempre 500 não protege nada — apaga a
distinção entre "não pode" e "rebentou", e foi isso que manteve este bug invisível.

- 3 testes em `tests/functional/relatorios_plataforma_policy.spec.ts` (o administrador de
  plataforma passa; o Admin de inquilino não; sem papel não), 1 em
  `http_exception_handler.spec.ts`. Suite: **710 testes**, `tsc --noEmit` sem erros.

### 7.18 A plataforma sai deste backend

Decisão do dono do produto, que **inverte a de 7.17**: os endpoints de plataforma deixam
de viver aqui e passam a viver num backend próprio, `taesic-backoffice-api`. A flag
`PLATFORM_ROUTES_ENABLED` que 7.17 introduziu ficou sem objecto e foi removida — não
sobrevive a esta secção nenhuma referência a ela.

#### A regra que passa a governar os dois projectos

**`taesic-backend` é o dono ÚNICO do esquema.** Os dois backends partilham a mesma base de
dados MySQL, e isso não tem contorno: é a mesma tabela `empresa`, os mesmos `papel` e
`permissao`, lidos pelos dois lados. `taesic-backoffice-api` **não tem `database/migrations`
e nunca corre `migration:run`** — uma coluna nova pede-se aqui.

O preço disto é a deriva silenciosa: o outro projecto tem models sobre tabelas que este
projecto altera. A rede que o apanha é o `colunas_fantasma.spec.ts`, que existe dos dois
lados e compara os models com o `information_schema` real.

#### O que saiu

Os sete conjuntos completos (controller + service + repository + validator + policy + DTO)
de `papel`, `permissao`, `papel_permissao`, `user_papel`, `plano`, `taxa_iva` e
`relatorios_plataforma` — 42 ficheiros. Verificado por grep ANTES de apagar: **nenhum deles
era importado por código de inquilino**; a única menção cruzada em todo o repositório era um
comentário em `relatorios_repository.ts`.

Saíram também as acções `empresas/:id/suspender|reactivar` e o que só elas usavam
(`SuspenderEmpresaValidator`, os DTOs, `SuspenderPropriaEmpresaException`, e os métodos
`suspender`/`reactivar`/`revogarSessoes` de `empresa_repository`).

#### O que FICA, e porquê — é aqui que está o cuidado

- **Os models de todos eles.** `papel`/`permissao`/`papel_permissao`/`user_papel` são o RBAC
  deste backend; `plano` é lido por `subscricao`/`cobranca`; `taxa_iva` por
  `relatorios_repository`. Tirar os models partiria o inquilino.
- **As migrações**, todas. Ver a regra acima.
- **A APLICAÇÃO da suspensão**, inteira: `ValidateCompanyAliasMiddleware`, a verificação no
  `login()` e o filtro do catálogo público. Só a ACÇÃO mudou de casa. É a divisão certa —
  quem corta o acesso é o backoffice, quem o nega é o backend onde o inquilino bate à porta,
  e os dois falam pela mesma coluna `empresa.suspensa_em`.
- **`AdminOnlyMiddleware` e `userHasPlatformRole()`**, mas só por causa do `cupom` (abaixo).
  Quando essa rota sair, saem com ela.
- `commands/permissao_conceder.ts` e `permissao_revogar.ts` — são ferramentas do dono do
  esquema e trabalham sobre os models, não sobre os repositórios que saíram.

#### `platform_cupom` — a excepção, e como acabou resolvida

Foi levantada a hipótese de que os cupões de plataforma fossem de quem promove a
**plataforma** e ganha sobre a venda de pacotes de assinatura. **Isso não existe no
esquema**, e confirmá-lo antes de mover evitou levar a coisa errada com o nome certo:

- `cupom_id` só aparece numa tabela: `vendas`.
- `subscricao` e `cobranca` não têm ligação nenhuma a cupões.
- `promotor_painel_repository` calcula ganhos por `vendas` → `cupom` → `empresa`, ou seja,
  sobre vendas feitas DENTRO de uma empresa.

Logo, `platform_cupom` era CRUD cross-tenant sobre os cupões de desconto dos INQUILINOS.
Ficou aqui, assinalado no próprio `routes.ts`, até haver decisão. **A decisão foi tomada:
desenhou-se a funcionalidade em falta**, e a rota saiu.

O dono do produto confirmou a premissa — promotores da PLATAFORMA que ganham sobre as
assinaturas que trazem. O que não existia era o sítio onde isso viver:

| o quê | onde | quem serve |
|---|---|---|
| `plataforma_cupom` | migração `1784662475797_create_plataforma_cupom`, **neste** projecto | `taesic-backoffice-api` |
| `plataforma_cupom_uso` | idem | idem |
| as rotas (`api/cupoes-plataforma`, resgates, promotores) | `taesic-backoffice-api` | o ecrã `/painel/cupoes` |

**As tabelas nascem aqui e as rotas nascem lá, e isso não é incoerência.** O dono do
esquema é este projecto, e os dois apontam para a mesma base de dados: dois projectos a
correr migrações contra ela partilhariam `adonis_schema`, os lotes intercalavam-se, e um
`migration:rollback` de um lado desfazia trabalho do outro sem aviso. O backoffice
continua sem `database/`.

O promotor de plataforma **já existia** (`promotor.empresa_id IS NULL`, com o getter
`isPlataforma` e auto-registo público em `api/promotores/registo`). Não se inventou
conceito nenhum — deu-se-lhe algo que ele pudesse promover.

Duas decisões de desenho que valem por si:

- **Os valores em dinheiro ficam congelados no resgate.** `valor_base`, `valor_desconto` e
  `valor_comissao` são gravados em `plataforma_cupom_uso`, e não recalculados a partir do
  preço do plano. Uma comissão ganha é uma dívida a uma pessoa; recalculá-la a cada leitura
  seria reescrever a história de quanto se deve quando o preço de um plano mudasse.
- **`subscricao_id` é único, e o índice ignora `deleted_at`.** É ele que garante que uma
  subscrição é ganha uma vez só — a verificação em código não chega, porque entre o SELECT
  e o INSERT cabe outro pedido. Consequência assumida: anular um resgate é um DELETE a
  sério, não um soft delete (senão a subscrição ficava inatribuível para sempre); o rasto
  fica em `security_logs`.

Os cupões dos inquilinos continuam intactos em `api/:company_alias/cupom` (`domain_cupom`).

**`AdminOnlyMiddleware` e `userHasPlatformRole()` FICARAM**, ao contrário do que a nota do
`routes.ts` previa. Não é esquecimento: a definição de "papel de plataforma" é
`papel.escopo = 'plataforma'` na tabela `papel`, partilhada pelos dois projectos, e é aqui
que vivem os testes que a guardam (`admin_only_middleware.spec.ts` e a verificação de
escalada de privilégios em `papel_por_empresa.spec.ts`). Apagar o helper obrigava a apagar
esses testes — trocar uma rota a menos por uma defesa a menos não é arrumação. O middleware
fica registado no kernel sem rota a usá-lo neste projecto.

#### Ajustes colaterais

- `relatorios_repository.spec.ts` e `relatorios_repository_detalhados.spec.ts` criavam a
  taxa de IVA pelo repositório que saiu; passaram a usar o **model** `TaxaIva` directamente
  (que fica). São testes de inquilino e continuam a exercitar o que interessa:
  `empresa.taxa_iva_id` no cálculo de IVA liquidado.
- `decimal_places_regression.spec.ts` perdeu o caso do `plano` (o validator foi-se) e
  manteve os três de inquilino.
- `empresa_suspensao.spec.ts` foi reescrito: só a aplicação, e passou a suspender por
  **escrita directa** à coluna, que é exactamente o que o outro backend faz. Testar a
  aplicação através de uma acção que já não vive aqui seria testar código ausente.

- Suite: **653 testes** (eram 710), `tsc --noEmit` sem erros. A diferença de 57 explica-se
  toda e sem resto: **35** do `modules_load.spec.ts` (7 conjuntos × 5 pastas que ele varre)
  e **22** dos testes que foram com o código. Verificado com `list:routes`: as rotas
  `platform_*` passaram de 45 a 6 (só `cupom`), e as 212 `domain_*` ficaram intactas.
  **Actualização:** com a saída de `platform_cupom` (acima), as `platform_*` são agora
  **zero** — não há uma única rota de plataforma neste backend (`list:routes`: 0
  `platform_*`, 191 `domain_*`, 210 no total). As de inquilino não foram tocadas, e
  isso é verificável e não uma afirmação: o único ficheiro de rotas alterado foi
  `start/routes.ts`; `companydomainroutes.ts` não tem uma linha mudada. A suite está em
  **662 testes**.

  (A contagem de 212 `domain_*` escrita acima, da sessão da separação, não é
  reproduzível hoje com este método de contagem — conta-se aqui por NOME de rota
  começado em `domain_`. Fica registada a divergência em vez de se ajustar um número
  para trás sem saber o que ele media.)

---

### 7.19 ⚠️ Migrações têm de poder correr duas vezes — incidente em `api-qua`

**Isto parou um deploy e deixou o sistema sem ninguém com acesso.** A regra que se segue
não é preferência de estilo.

#### O que aconteceu

`sudo deploy-app api-qua --force` morreu no passo das migrações:

```
❯ error database/migrations/1784662475791_alter_papel_por_empresa
[ error ] alter table `papel` add `empresa_id` char(36) null, add `escopo` enum(...)
          - Duplicate column name 'empresa_id'
```

A coluna já lá estava. Uma tentativa anterior tinha corrido a migração **em parte**:
o `ALTER TABLE` passou, um passo posterior rebentou, e a migração **não ficou registada
em `adonis_schema`**.

A causa é a mesma de sempre e vale a pena escrevê-la sem rodeios:

> **O MySQL não faz DDL transaccional.** Um `ALTER TABLE` que corra fica feito, mesmo que
> a migração falhe na instrução seguinte. O Adonis só escreve em `adonis_schema` quando a
> migração termina inteira. Logo, uma migração que falha a meio deixa **o esquema meio
> alterado e o registo a dizer que ela nunca correu**.

A partir daí o `migration:run` fica preso: bate sempre na mesma primeira instrução, e
**nenhuma das migrações seguintes corre**.

#### Porque é que o sistema ficou de facto em baixo

Porque a migração a seguir, `1784662475792_backfill_papel_por_empresa`, nunca chegou a
correr. Sem o backfill, todos os `papel` ficaram com o `escopo` no valor por omissão da
coluna nova, **`'modelo'`** — e um papel `modelo` não é atribuível a ninguém nem é de
plataforma (ver 7.13). Resultado: aplicação de pé, base de dados de pé, e nem
administradores de plataforma nem funcionários de inquilino com permissão para nada.

A lição operacional: **uma migração de esquema seguida de um backfill são uma unidade**.
Falhar a primeira não deixa o sistema como estava — deixa-o num estado que nunca foi
desenhado.

#### A regra

**Toda a migração que altere esquema pergunta antes de fazer.** `database/helpers/esquema.ts`
dá as três perguntas: `temColuna()`, `temIndice()`, `temRestricao()`. Padrão:

```ts
async up() {
  this.defer(async (db) => {
    if (!(await temColuna(db, 'papel', 'empresa_id'))) {
      await db.rawQuery('ALTER TABLE papel ADD COLUMN empresa_id CHAR(36) NULL')
    }
  })
}
```

Três consequências a aceitar de propósito:

1. **`this.defer()` em vez de `this.schema.alterTable()`.** O knex constrói a instrução
   antes de qualquer pergunta ao `information_schema` poder ser feita. O `defer` corre na
   ordem em que foi declarado, entre os outros passos — o que preserva a sequência.
2. **SQL directo, específico do MySQL.** Já era o caso das partes que o knex não expõe
   (colunas geradas, CHECK). Este projecto é MySQL e não tem intenção de deixar de ser.
3. **`migration:run --dry-run` deixa de mostrar estas instruções**, porque o Lucid salta
   os `defer` em dry-run. É uma perda real, e ainda assim o troco é bom: o dry-run nunca
   apanhou esta classe de falha, e a idempotência recupera-a sozinha.

Também o `down()`. Um `down` que rebente a meio deixa exactamente a mesma confusão.

Já convertidas e **verificadas**: `..._791_alter_papel_por_empresa`,
`..._793_alter_colunas_fantasma`, `..._794_alter_empresa_suspensao`,
`..._795_alter_empresa_nif_unico`. A `..._792_backfill_papel_por_empresa` já nascera
idempotente (é `defer` puro sobre dados, e reexecuta sem duplicar).

#### Como isto foi verificado — e como reverificar

Numa base descartável, nunca em dev nem em teste. `process.env` do shell ganha ao `.env`
(`@adonisjs/env` só preenche o que ainda não estiver definido), portanto:

```bash
# 1. base limpa; correr tudo de raiz
node -e "..."                                  # CREATE DATABASE auth_system_migtest
DB_DATABASE=auth_system_migtest node ace migration:run

# 2. simular a avaria: apagar objectos de uma migração (meia aplicada) e
#    apagar as linhas dela de adonis_schema (por registar)
# 3. correr outra vez — tem de passar
DB_DATABASE=auth_system_migtest node ace migration:run
```

Resultado obtido: as quatro voltaram a correr sobre o estado partido, reconstruíram o que
faltava (`chave_escopo`, `papel_escopo_nome_unique`, `papel_escopo_empresa_chk`), e o
`information_schema` ficou sem uma única restrição duplicada. `database/schema.ts`
regenerado ficou byte a byte igual ao que já estava versionado.

#### Antes de qualquer deploy

```bash
node ace migration:status     # o que está por correr, ANTES de correr
```

E ter presente que, **em produção, um `migration:run` que falhe não se resolve por
tentativa e erro.** Com as migrações idempotentes resolve-se por reexecução; sem elas,
resolve-se a olhar para o `information_schema` e a completar o que falta à mão — que é
onde nasce a próxima avaria.

#### 7.19.1 A segunda falha do mesmo deploy: o motor do servidor não é o de dev

Com as migrações já idempotentes, o deploy seguinte foi mais longe — e parou noutro
sítio:

```
[ error ] CREATE UNIQUE INDEX papel_escopo_nome_unique ON papel (chave_escopo, nome)
          - Function or expression 'coalesce(`empresa_id`,`escopo`)' cannot be used
            in the GENERATED ALWAYS AS clause of `chave_escopo`
```

Repare-se onde falha. A COLUNA gerada foi aceite (a guarda criou-a); o ÍNDICE sobre ela
é que não. O motor revalida a expressão com regras mais apertadas ao indexá-la.

**A mesma instrução passa no MySQL 8.4 local, nos testes, e falha no servidor.** É essa
a conclusão que importa, muito mais do que o erro: **o ambiente de desenvolvimento e o
servidor não correm o mesmo motor de base de dados.** Enquanto isso for verdade,
qualquer migração pode passar em dev, passar na suite, e parar o deploy — e nenhuma
quantidade de testes locais o apanha.

**Regra que daqui resulta: nada de funcionalidades específicas de um motor no caminho
crítico.** Colunas geradas indexadas são exactamente isso. Varrido o resto das 120
migrações à procura de mais: não há mais nenhuma coluna gerada, nenhum índice funcional,
e as *window functions* de `..._782` a `..._788` já correram no servidor sem problema
(estão em `completed`). As duas restrições `CHECK` também.

##### O que substituiu a coluna gerada

`..._796_alter_papel_chave_escopo_sem_coluna_gerada`: `chave_escopo` passa a
`VARCHAR(64) NOT NULL` normal, preenchida por dois gatilhos
(`papel_chave_escopo_bi`/`_bu`, BEFORE INSERT e BEFORE UPDATE) com
`COALESCE(empresa_id, escopo)`.

**Gatilho e não um `@beforeSave` do Lucid**, e a razão é estrutural: `papel` é escrita
por DOIS projectos (mesma base de dados), pelos seeders, pelo `multiInsert` da migração
792 e por SQL à mão. Um hook do model cobre um desses caminhos. O gatilho cobre-os
todos — a mesma garantia que a coluna gerada dava, com uma funcionalidade que qualquer
motor suporta.

O preço é a invisibilidade: quem lê o model não vê o gatilho. Compensado por
`tests/functional/papel_chave_escopo.spec.ts` (9 testes), que verifica os dois gatilhos,
o índice, a escrita em bruto sem passar pelo model, **e varre a tabela inteira** à
procura de linhas onde `chave_escopo <> COALESCE(empresa_id, escopo)`. Um desses testes
falha de propósito se alguém reintroduzir a coluna como gerada.

A 791 deixou de criar `chave_escopo` e o índice — passaram os dois para a 796. Assim as
três situações convergem no mesmo estado sem duplicar lógica nenhuma:

| ponto de partida | 791 | 796 |
|---|---|---|
| base nova | cria colunas, FK, CHECK | cria chave_escopo normal + gatilhos + índice |
| dev/teste (791 completa, coluna gerada) | já registada, não corre | converte: larga índice e coluna, recria normal |
| servidor (791 pendente, coluna gerada sem índice) | salta o que existe, regista-se | converte |

##### Verificado, e como reverificar

Numa base descartável, os dois cenários — instalação de raiz e o estado EXACTO do
servidor (coluna gerada presente, índice ausente, seis migrações por registar) —
acabaram idênticos: `chave_escopo varchar(64) NOT NULL` sem `GENERATED`, os dois
gatilhos, `papel_escopo_nome_unique` sobre `(chave_escopo, nome)`, zero linhas
dessincronizadas, e um `INSERT` em SQL puro a sair com a chave correcta.

Suites depois da conversão de dev e de teste: **662** no `taesic-backend` (eram 653),
**138** no `taesic-backoffice-api`, `tsc --noEmit` limpo nos dois.

##### Resolvido: é o MESMO motor — muda a VERSÃO

Esta secção afirmou durante algum tempo que o servidor corria MariaDB e o
desenvolvimento MySQL, e que era daí que vinha tudo. **Estava errado.** Correu-se
finalmente `SELECT VERSION(), @@version_comment;` nos dois lados:

| ambiente | versão |
|---|---|
| desenvolvimento | **MySQL 8.4.3** — Community Server |
| servidor | **MySQL 8.4.11** — Community Server |

O mesmo produto, a mesma linha LTS, oito versões de correcção de diferença. A conclusão
"MariaDB" tinha vindo do provisionamento (`apt install mariadb-server`) e da forma da
mensagem de erro — dois indícios, nenhuma prova. **Um `SELECT VERSION()` custava um
segundo e teria evitado a dedução inteira.**

##### E a coluna gerada? Verificado: 8.4.3 aceita, 8.4.11 recusa

A parte que parecia exigir motores diferentes foi reproduzida à letra em desenvolvimento —
tabela `papel` igual, `empresa_id CHAR(36) NULL`, `escopo ENUM(...)`, coluna
`VARCHAR(64) GENERATED ALWAYS AS (COALESCE(empresa_id, escopo)) VIRTUAL`:

```
DEV 8.4.3:  coluna gerada criada: OK
            CREATE UNIQUE INDEX sobre ela: OK       <- passa
SERVIDOR 8.4.11: ERROR: Function or expression 'coalesce(...)' cannot be used
                 in the GENERATED ALWAYS AS clause of 'chave_escopo'
```

Portanto **não era o motor: era a versão do motor.** Entre 8.4.3 e 8.4.11 a regra apertou,
e o dev está ATRÁS do servidor. Uma migração escrita e testada em 8.4.3 pode ser recusada
em 8.4.11 sem ninguém ter mudado uma linha.

##### O que isto muda, e o que não muda

A regra continua exactamente a mesma — **nada de funcionalidades específicas de um motor
(ou de uma versão) no caminho crítico.** Colunas geradas indexadas são disso. O que muda é
o remédio, e ficou mais barato do que se pensava: **alinhar as versões**, que agora é só
actualizar o MySQL de desenvolvimento para 8.4.11. Não é migrar de produto nenhum.

### 7.20 ⚠️ Um campo novo tem de ter valor por omissão ou ser opcional

**Regra dada pelo dono do produto, classificada como crítica.** Duas partes:

1. **Todo o campo novo tem de ter valor por omissão ou ser anulável.**
2. **Se um campo é obrigatório, a obrigatoriedade impõe-se no VALIDATOR, não na base de
   dados em primeira instância.** A restrição na BD é a última defesa, não a primeira.

O `NOT NULL` da BD recusa a escrita com um erro do motor (`ER_NO_DEFAULT_FOR_FIELD`,
`ER_BAD_NULL_ERROR`) que chega ao utilizador como 500 e não diz sequer que campo falta. O
validator recusa com 400 e uma mensagem por campo, antes de a transacção abrir.
Restrições que a aplicação não pode garantir sozinha — chaves estrangeiras, `CHECK` de
invariantes entre colunas, índices únicos — continuam a fazer sentido na BD;
obrigatoriedade de preenchimento, não.

#### O incidente que a originou

`api-qua`, criar empresa. No journal (`journalctl -u api-qua`):

```
ER_NO_DEFAULT_FOR_FIELD (1364)
Field 'chave_escopo' doesn't have a default value
insert into `papel` (`created_at`, `descricao`, `empresa_id`, `escopo`, `id`, `nome`, `updated_at`) values (...)
```

O `INSERT` é o de `app/helpers/papeis_da_empresa.ts`, que clona os 10 papéis padrão para
a empresa nova. Não menciona `chave_escopo` porque nunca precisou: quem a preenchia era o
gatilho `papel_chave_escopo_bi` (ver 7.19.1).

**Naquele servidor o gatilho não existe.** A migração 796 faz, por esta ordem:

```
4. ALTER TABLE papel MODIFY chave_escopo VARCHAR(64) NOT NULL
5. CREATE TRIGGER papel_chave_escopo_bi ...
```

O MySQL não faz DDL transaccional (7.19). O passo 5 falhar — `CREATE TRIGGER` exige o
privilégio `TRIGGER`, concedido à parte do resto — deixa o passo 4 feito. O que fica é uma
coluna obrigatória, sem valor por omissão, sem ninguém a preenchê-la. **A partir daí
nenhuma escrita em `papel` passa: não é o registo de empresas que fica degradado, é a
tabela inteira que fica só de leitura.**

O `NOT NULL` tinha sido posto com boa intenção — o comentário da 796 dizia "se algum dia
um caminho os contornar, o erro aparece na escrita em vez de uma linha silenciosamente
fora do índice". Escolheu falhar a escrita em vez de a deixar passar. O preço dessa
escolha foi uma paragem total; o da outra teria sido uma linha mal indexada.

#### A correcção — três defesas, nenhuma sozinha

`1784662475798_alter_papel_chave_escopo_anulavel`: a coluna passa a **anulável**.

**Anulável e não com valor por omissão**: não há default que sirva. A chave é
`COALESCE(empresa_id, escopo)` — depende da linha. Um `DEFAULT ''` fixo poria todas as
linhas por preencher na mesma entrada do índice único, e duas empresas com um papel
"Admin" cada passariam a colidir. Trocava-se um erro por outro.

A unicidade não se perde porque a coluna deixou de depender só do gatilho:

| quem preenche | cobre |
|---|---|
| `@beforeSave` em `app/models/auth/papel.ts` | `Papel.create`, `createMany`, seeders |
| valor à mão no `multiInsert` de `papeis_da_empresa.ts` | o clone de papéis do registo de empresa |
| `@beforeSave` no model do `taesic-backoffice-api` | tudo o que o outro backend escreve |
| os gatilhos | SQL à mão, restauros, o que ninguém previu |

Os três primeiros usam `chaveEscopoDe()`, exportada do model — uma só definição. O NULL
passa a ser o que devia sempre ter sido: o sinal de que algo escreveu por um caminho não
previsto, visível numa consulta, e não uma paragem.

#### Ordem dos passos numa migração

Ao contrário da 796, **o que pode falhar vem DEPOIS do que desbloqueia a escrita**.
Primeiro a coluna fica anulável; a partir daí a tabela é escrevível, aconteça o que
acontecer a seguir.

E a criação dos gatilhos na 798 **não pára a migração se falhar** — avisa no log e
continua. Antes a aplicação dependia deles e engoli-los seria esconder uma avaria; agora
são a terceira das três defesas, e uma migração que rebente ali bloqueia todas as
migrações seguintes em todos os deploys por causa de uma salvaguarda de que a aplicação
já não precisa.

#### A lacuna de teste que deixou isto chegar a produção

`papel_chave_escopo.spec.ts` corria **com os gatilhos no sítio** — portanto não
distinguia "a aplicação preenche a chave" de "o gatilho preenche a chave", e passava na
mesma se a aplicação não fizesse nada. Em dev os gatilhos existem sempre.

Ganhou um segundo grupo, **`papel — chave_escopo sem os gatilhos (o estado de api-qua)`**,
que os larga no `group.setup` e os repõe no teardown (DDL fora da transacção de cada
teste: um `CREATE`/`DROP TRIGGER` faz commit implícito). Verificado que tem dentes:
reposta a coluna a `NOT NULL` e revertido o preenchimento pela aplicação, **6 dos 15
testes falham com o erro exacto do journal de produção**, incluindo o `INSERT` do clone
de papéis.

> **Sempre que a correcção de um bug de produção depender de um objecto de BD que pode
> não existir (gatilho, índice, restrição), o teste tem de correr SEM esse objecto.** Um
> teste que corre no ambiente onde o objecto existe não prova nada sobre o ambiente onde
> ele falta — que é sempre o ambiente onde o bug aparece.

- Suite: **675 testes** no `taesic-backend` (eram 662, +13: 6 do grupo novo, 1 da coluna
  anulável, 6 dos testes do NIF que passaram a poder correr — ver abaixo), **181** no
  `taesic-backoffice-api`. `tsc --noEmit` limpo nos dois. Migração corrida em dev.

#### Na mesma passagem: os testes do NIF dependiam da máquina onde corriam

8 testes de `nif_consulta.spec.ts` falhavam numa base de desenvolvimento e passavam numa
base limpa, sem nada no código ter mudado. A transacção global desfaz o que os testes
escrevem, mas não o que já lá estava: uma consulta a sério feita em desenvolvimento deixa
a linha do NIF em `nif_consulta` **committada**, a cache vale 30 dias (`NIF_CACHE_DIAS`),
e `consultar()` servia dela — o `fetch` simulado nunca chegava a ser chamado
("expected +0 to equal 1").

Os grupos passaram a esvaziar a cache **dentro** da transacção global (helper `cacheVazia`),
portanto o `delete` é desfeito no fim e a cache real de quem está a desenvolver fica
intacta. Verificado: as 3 linhas reais sobreviveram à corrida.

#### 7.20.1 A correcção não era alcançável — a 796 tinha de ser corrigida também

Erro meu, apanhado quando o `migration:status` de `api-qua` foi visto de verdade:

```
1784662475795_alter_empresa_nif_unico                     completed  5
1784662475796_alter_papel_chave_escopo_sem_coluna_gerada  pending    NA
1784662475797_create_plataforma_cupom                     pending    NA
```

A **796 estava (e está) pendente naquele servidor**, e a 798 — a reparação — vem depois
dela na ordem de execução. `migration:run` corre por ordem de nome: a 796 rebentava no
`CREATE TRIGGER`, ficava por registar, e **a 797 e a 798 nunca chegavam a correr**. A
migração que repara o problema era inalcançável no único sítio onde era precisa.

**Regra geral que daqui sai:** uma migração de reparação escrita DEPOIS da que partiu o
sistema só serve se a que partiu conseguir completar. Quando a que partiu ainda está
pendente no ambiente afectado, é ela que tem de ser corrigida — não basta acrescentar
outra a seguir.

A 796 passou portanto a:

1. **não tornar a coluna `NOT NULL`** (o passo 4 é agora `MODIFY ... NULL`, que também
   solta a coluna numa base onde a versão antiga já ficou a meio);
2. **tolerar a falha do `CREATE TRIGGER`** — avisa no log e continua.

A 798 mantém-se: é ela que repara os ambientes onde a 796 **já completou** com o `NOT
NULL` aplicado (dev, e qualquer outro que tenha corrido a versão antiga).

##### A causa real da falha do gatilho, reproduzida

A hipótese era o privilégio `TRIGGER`. Ao reproduzir com um utilizador restrito, o motor
deu outra coisa:

```
You do not have the SUPER privilege and binary logging is enabled
(you *might* want to use the less safe log_bin_trust_function_creators variable)   -- 1419
```

São **duas** causas possíveis, e o texto do erro diz qual é. As duas estão no
`deploy-doc.md` §4 com o comando respectivo (`GRANT TRIGGER`, ou
`log_bin_trust_function_creators = 1`).

##### Verificado numa base descartável, nos dois pontos de partida

Como manda a 7.19, e com um utilizador **sem** poder criar gatilhos:

| ponto de partida | resultado |
|---|---|
| instalação de raiz | 796/797/798 completam; coluna anulável, índice único criado, 0 dessincronizados; `INSERT` passa |
| estado exacto de `api-qua` (796 meia aplicada: coluna `NOT NULL`, sem gatilhos, sem índice, três migrações por registar) | `INSERT` falhava com `ER_NO_DEFAULT_FOR_FIELD` antes; depois do `migration:run --force` as três completam (lote 2), a coluna fica anulável, o índice é criado, e o `INSERT` do registo de empresas volta a passar |

Nos dois casos o aviso dos gatilhos apareceu no log e **não** parou nada.

##### `--force` não é opcional fora de desenvolvimento

O `migration:status` do servidor terminou com:

```
❯ You are in production environment. Want to continue running migrations? (y/N) ‣ false
```

Sem `--force`, o Adonis pergunta e, num pipeline sem terminal interactivo, a resposta é
sempre não: a migração não corre e o comando parece ter passado. Todos os exemplos do
`deploy-doc.md` passaram a levá-lo.

#### 7.20.2 `ER_FK_INCOMPATIBLE_COLUMNS` — `DEFAULT CHARSET` sem `COLLATE`

Com a 796 desbloqueada, o deploy de `api-qua` avançou e parou na seguinte:

```
❯ error database/migrations/1784662475797_create_plataforma_cupom
ALTER TABLE plataforma_cupom
  ADD CONSTRAINT plataforma_cupom_promotor_id_foreign
  FOREIGN KEY (promotor_id) REFERENCES promotor (id)
- Referencing column 'promotor_id' and referenced column 'id' in foreign key
  constraint are incompatible.
```

**A causa, reproduzida:** uma chave estrangeira entre colunas de texto exige tipo,
charset **e collation** iguais dos dois lados. A 797 criava as tabelas com

```sql
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
```

— charset sim, **`COLLATE` não**. E `DEFAULT CHARSET=X` sem `COLLATE` **não herda a
collation da BASE DE DADOS**: a tabela fica com a collation por omissão *do charset*
(`utf8mb4_0900_ai_ci`). As tabelas criadas pelo knex (como `promotor`) não declaram
charset nenhum e herdam a da base — que no servidor foi criada com uma collation
explícita diferente dessa. Não é preciso mudar de motor: basta a base ter sido criada de
outra maneira.

Em desenvolvimento as duas omissões coincidem, e nunca deu problema. Num servidor onde a
base foi criada com uma collation explícita, deixam de coincidir — e as chaves não podem
ser criadas.

Reproduzido localmente numa base `CREATE DATABASE ... COLLATE utf8mb4_unicode_ci`:
`promotor.id` ficou `utf8mb4_unicode_ci`, `plataforma_cupom.promotor_id` ficou
`utf8mb4_0900_ai_ci`, e o `ADD CONSTRAINT` deu o mesmo `ER_FK_INCOMPATIBLE_COLUMNS` do
servidor.

##### A correcção

1. **O `DEFAULT CHARSET=utf8mb4` saiu** das duas tabelas. Sem ele herdam charset E
   collation da base, exactamente como todas as outras tabelas deste esquema.
2. **`alinharColunaComReferencia()`** (novo, em `database/helpers/esquema.ts`) põe a
   coluna com o tipo/charset/collation exactos da coluna que vai referenciar, e é chamada
   antes de cada uma das 5 chaves. É o que repara as bases onde as tabelas **já ficaram
   criadas** com a collation errada — o caso de `api-qua`, onde o `CREATE TABLE` passou e
   só a chave falhou. Não faz nada se já estiverem alinhadas.

> **Regra: nunca declarar `DEFAULT CHARSET` sem `COLLATE` num `CREATE TABLE`.** Ou se
> declaram os dois, ou nenhum. Declarar só o charset é a forma silenciosa de sair da
> convenção da base — e o sintoma aparece a um motor de distância.

##### Verificado nos dois cenários, numa base com collation divergente

Base descartável criada com `COLLATE utf8mb4_unicode_ci` e utilizador **sem** poder criar
gatilhos:

| ponto de partida | resultado |
|---|---|
| instalação de raiz | todas as migrações completam, 0 pendentes; só os avisos dos gatilhos |
| estado de `api-qua` (796 aplicada, tabelas da 797 criadas com collation errada, as 5 chaves por criar, 797 e 798 por registar) | `ADD CONSTRAINT` falhava com `ER_FK_INCOMPATIBLE_COLUMNS` antes; depois do `migration:run --force`, 797 e 798 completam, **as 5 chaves são criadas**, a collation fica alinhada e `papel.chave_escopo` fica anulável |

##### O padrão que estas três paragens têm em comum

`api-qua` parou três vezes seguidas, e é tentador arrumar as três sob uma causa só. Foi o
que se fez primeiro, e a causa escolhida — "o servidor é MariaDB, o dev é MySQL" — era
falsa (ver 7.19.1). **São os dois MySQL 8.4 Community.** As causas reais são três, e
distintas:

| # | o que parou | a diferença real, verificada |
|---|---|---|
| 7.19.1 | coluna gerada indexada | **versão**: 8.4.3 aceita, 8.4.11 recusa |
| 7.20 | gatilho não criado, deixando `chave_escopo NOT NULL` sem quem a preenchesse | **configuração do servidor**: binlog ligado e o utilizador da aplicação sem `SUPER` (erro 1419). Em dev corre-se como `root` |
| 7.20.2 | `DEFAULT CHARSET` sem `COLLATE` | **configuração da base**: a base do servidor foi criada com outra collation, e `DEFAULT CHARSET` sem `COLLATE` não a herda |

O que elas têm mesmo em comum não é o motor — é que **o dev não se parece com o servidor
em nada que conte para DDL**: versão diferente, privilégios diferentes, collation
diferente. Nenhuma se apanha com `node ace test`, porque nenhuma é um erro de lógica.

O passo que as apanha é **correr as migrações numa base descartável parecida com a do
servidor** — mesma collation, um utilizador restrito — antes de publicar. Foi assim que as
duas últimas correcções foram validadas, e as duas vezes o problema apareceu antes do
deploy em vez de durante.

E, agora que se sabe que é o mesmo produto, há um remédio barato que antes parecia caro:
**pôr o MySQL de desenvolvimento em 8.4.11**, a mesma versão do servidor.

### 7.21 Complemento de onboarding — a empresa nasce utilizável

Pedido do dono do produto: ao registar uma empresa, criar logo um posto de atendimento que
nunca possa ficar sem substituto; e, ao escolher o ramo de actuação no onboarding, semear
automaticamente categorias e produtos desse ramo.

#### O que estava partido antes de tudo isto

**O ecrã de onboarding nunca correu para ninguém.** Existia (`/[companyAlias]/onboarding`,
sete passos, com carrossel e tudo), e o `ProtectedRoute` do frontend decidia por
`user.onboarded === false` — valor que vinha de `first_time`/`is_new_user`/
`onboarding_completed`, **sinalizadores que nenhuma rota deste backend alguma vez
devolveu**. `undefined` não é `false`, portanto `needsOnboarding` era sempre falso e toda a
gente caía directamente no painel.

O ecrã também não configurava nada: escolher um "tipo de negócio" guardava uma string num
`useState` e o passo dos produtos era um formulário falso (nascia com "Produto 1" a €0.00 —
moeda errada para Angola — e perdia tudo ao sair).

#### 1. Toda a empresa nasce com um posto de atendimento

`app/helpers/posto_padrao.ts` (`semearPostoPadrao`), chamado em
`empresa_repository.CreateEmpresaUserDetalhes` **dentro da transacção do registo**, ao lado
de `clonarPapeisPadrao` e `semearMetodosPagamento` e pela mesma razão: ou a empresa nasce
completa, ou não nasce.

Sem um `pos` a empresa está de pé e não faz nada — `caixa` abre contra um posto, `vendas`
corre dentro de uma caixa, o `lote` é por posto. E um Vendedor era atirado para
`/dashboard/selecionar-pdv` (ver `ProtectedRoute`) para uma lista vazia, sem saída: criar
postos é `domain_pos.store`, permissão que ele não tem.

- Nome `Sede`, dados copiados da empresa, email o da conta que a registou (`empresa` não tem
  coluna de email — ver `empresaDoUtilizador` em auth_repository.ts).
- Idempotente, e **procura um nome livre** (`Sede`, `Sede 2`, ...): `pos` tem
  `unique(nome, empresa_id)` e um posto SOFT-APAGADO continua a ocupar o nome. Uma empresa
  que tivesse desactivado a sua "Sede" rebentava no meio do registo com erro de chave
  duplicada, sem nada a dizer que o problema era um nome.

#### 2. A empresa nunca fica sem nenhum

`pos_repository.softDelete()` recusa com `UltimoPostoException` (409, `ULTIMO_POSTO`) quando
é o último posto activo. No repositório e não no controller: `destroy` não é o único caminho
até lá, e uma regra de integridade que viva no controller é uma regra que o próximo caminho
não conhece.

**Só no sentido desactivar.** O `softDelete` deste projecto é um alternador; se a
verificação não distinguisse os dois sentidos, um posto apagado ficava impossível de
recuperar assim que fosse o único — que é precisamente quando alguém precisa dele de volta.

- **`pos_controller.destroy` perdeu o try/catch** (mais 1 dos ~48 por migrar). É a terceira
  vez que este padrão esconde uma excepção nova (7.4, 7.17): o `catch` genérico devolvia
  **500 "Erro interno do servidor"** à `UltimoPostoException`, portanto quem tentasse apagar
  o único posto via "a aplicação avariou" em vez da explicação. Verificado por HTTP: agora
  409 com a mensagem, e 404 para um id inexistente.

#### 3. O ramo de actuação semeia o catálogo

`app/helpers/ramos_de_actuacao.ts` — catálogo de 7 ramos (farmácia, supermercado,
restauração, vestuário, serviços, imóveis, personalizado) e `semearRamoDeActuacao()`,
idempotente por nome.

**Os produtos nascem SEM lote**, logo sem preço e sem stock: aparecem na lista de produtos
(`incluir_sem_lote`) e **não** no PDV. Decisão do dono do produto, entre três opções
apresentadas. A alternativa (lote a preço 0) punha produtos a 0 Kz prontos a passar pela
caixa — um produto por preencher deve ser invisível ao PDV, não vendável de graça.

**"Serviços" e "Imóveis" semeiam só categorias.** Um serviço não existe aqui sem lote
(`produtos_repository.create()` cria-lhe sempre um, porque é o lote que lhe guarda o preço),
e semeá-lo obrigaria a inventar esse preço. Semeá-lo como produto físico era pior: entrava
no controlo de stock e nos alertas de validade, e uma consultoria não tem nem uma coisa nem
outra.

> **Bug pré-existente encontrado e NÃO corrigido** (fora do âmbito, e a regra da secção 1
> exige o teste a reproduzir primeiro): `produtos_repository.update()`, no ramo
> `is_service`, faz `const lote = (await loteRepo.paginate(...))[0]` e escreve-lhe nos
> preços **sem verificar se existe**. Um serviço sem lote rebenta ali com `TypeError` → 500.
> É alcançável hoje convertendo um produto físico em serviço: `update` decide pelo valor
> GRAVADO de `is_service`, portanto a conversão passa pelo `else` e grava o produto como
> serviço sem lhe criar lote; a edição SEGUINTE rebenta.

#### 4. O onboarding passa a ter estado, e a ser obrigatório

Migração `1784662475799_alter_empresa_onboarding`: `ramo_actuacao` (VARCHAR, anulável — o
catálogo vive no código, e acrescentar um ramo não deve exigir migração) e
`onboarding_concluido_em` (TIMESTAMP, anulável). Ambas anuláveis conforme 7.20.

**O backfill é condicionado a "a empresa já tem produtos"**, e não a um simples
`WHERE IS NULL`. Sem backfill, todas as empresas existentes seriam atiradas para o
onboarding no login seguinte. Com a condição óbvia, uma **segunda execução** (7.19)
varreria também as empresas registadas entretanto e marcá-las-ia como concluídas sem nunca
terem visto o ecrã. "Já tem produtos" distingue as duas populações e continua a
distingui-las numa reexecução: uma empresa acabada de registar tem catálogo vazio (o
registo semeia posto, papéis e métodos de pagamento — nunca produtos).

Recurso novo `api/:company_alias/onboarding` (`domain_onboarding.*`): `estado`, `ramos`,
`ramo`, `concluir`. `onboardingRepository` não estende `BaseRepository` de propósito
(secção 2) — não é CRUD, são três operações de estado sobre a empresa.

- `aplicarRamo` grava o ramo e semeia **numa transacção**: uma empresa com "Farmácia"
  gravado e catálogo vazio mente ao dono, e o passo já teria sido dado.
- Trocar de ramo **acrescenta, nunca apaga** o catálogo anterior: o dono pode já ter editado
  preços ou vendido alguma coisa entre os dois passos, e apagar-lhe produtos por ter mudado
  de ideias num ecrã de configuração seria destruir trabalho dele. É também o que permite a
  esta rota servir de "repor o modelo do ramo" mais tarde, sem nenhum caminho novo.
- `concluir` semeia o posto em falta antes de fechar — as empresas anteriores a esta mudança
  podem não ter nenhum, e deixá-las sair do onboarding assim era mandá-las para um painel
  onde não se abre caixa nem se vende.

**RBAC:** Admin tem as quatro; Gerente só as duas de leitura. Concedidas em dev com
`permissao:conceder` **nos modelos E com `--todas-empresas`** (secção 7.13), e cobertas por
um grupo de testes próprio — é a quarta vez que o catálogo à mão fica para trás (7.6, 7.8,
7.12), e desta vez há rede.

#### 5. Frontend

- `login/page.tsx` passa a ler o `onboarding_completed` real, **e só encaminha o
  administrador**: `ProtectedRoute` prende qualquer utilizador com `onboarded === false`, e
  configurar a empresa é permissão de Admin — um vendedor de uma empresa por configurar
  ficaria preso num ecrã onde cada pedido lhe responde 403, sem forma de sair.
- `FinalizarSlide` chama `concluir()` **antes** de navegar e actualiza o `AuthContext`
  (`onboarded: true`). Sem essa segunda parte, o `router.push` era imediatamente desfeito
  pelo guarda — ciclo fechado no último clique do onboarding, com tudo já gravado do lado
  do servidor.
- `template-slide` deixou de ter a lista de ramos escrita à mão (e em inglês: `pharmacy`,
  `clothing`, ...) — lê o catálogo do backend. Duas listas divergiriam, e a escolha passaria
  a gravar um id que o backend não conhece. Só o ícone de cada ramo fica no frontend.
- `produtos-slide` mostra o catálogo real em vez do formulário falso, e diz porque é que
  aqueles produtos ainda não aparecem no ponto de venda.
- O contexto resolve o `company_alias` da rota antes do primeiro pedido: os efeitos dos
  filhos correm ANTES dos do pai, e o layout de `[companyAlias]` só o escreve no seu próprio
  efeito — numa navegação directa o pedido saía como `/api//onboarding`.

#### 6. Na mesma passagem: `enum` não tinha mensagem em português

`start/validator.ts` tem um `SimpleMessagesProvider` completo em português — e faltava-lhe a
entrada `enum`, que é a regra por trás de **todos** os campos de escolha fechada deste
projecto (tamanho da empresa, tipo de movimentação de stock, estado de uma venda).
Caíam na mensagem por omissão do VineJS, em inglês, dentro de uma resposta cujo envelope já
vinha em português. Acrescentada, mais o campo `ramo`.

#### 7. ⚠️ Achado do ambiente: a suite NÃO corre numa base isolada

Este ficheiro diz em vários sítios "a BD de teste isolada (`auth_system_test`)" e manda
correr migrações/seeders "nos DOIS bancos". **Isso já não é verdade.** `.env.test` define
apenas `LIMITER_STORE=memory` — não define `DB_DATABASE` — e `config/database.ts` lê
sempre `env.get('DB_DATABASE')`. Verificado: `node ace test` corre contra `auth_system`, a
base de **desenvolvimento**.

Na prática a suite é inofensiva (`withGlobalTransaction()` desfaz tudo), mas a instrução
que este ficheiro dá **não** é: `NODE_ENV=test node ace db:fresh:seed` faz
`migration:fresh` — larga todas as tabelas — na base de desenvolvimento. Antes de a
correr, definir `DB_DATABASE` explicitamente, ou repor um `.env.test` com a base própria.

- Suite: **707 testes** (eram 675). `tsc --noEmit` limpo. Migração corrida em dev.
  Verificado também por HTTP contra o servidor real: as 4 rotas do onboarding, a recusa do
  último posto (409), o 404 de um id inexistente, e as mensagens de validação em português.

### 7.22 Onboarding utilizável, e planos com diferenças a sério

Segunda passagem sobre o onboarding (a primeira é 7.21), a pedido do dono do produto:
produtos mais organizados e mais numerosos, vários ramos em vez de um, a página a deixar
de quebrar, pagar a deixar de ser obrigatório, e — o maior — **um sítio onde o
proprietário trata da subscrição, com planos cujas diferenças o sistema conhece**.

#### 1. A página quebrava por construção

O carrossel era `h-screen overflow-hidden` com cada passo em `absolute inset-0`, e o
cabeçalho e os botões TAMBÉM absolutos, por cima. Um passo mais alto do que o ecrã ficava
cortado **sem forma de chegar ao resto** — o `overflow-hidden` do pai impedia até o
scroll —, o cabeçalho tapava o título e os botões tapavam a última linha. Num portátil de
768 px, ou num telemóvel, quase todos os passos caíam nisto.

Agora é uma coluna flex: cabeçalho e navegação em fluxo (`shrink-0`), e o scroll vive
DENTRO de cada passo. Cada passo guarda a sua posição ao voltar atrás. Os passos inactivos
ganharam `invisible` além da opacidade — transparentes, continuavam a apanhar cliques e
tabulação por cima do que estava visível.

#### 2. Vários ramos de actuação

Uma farmácia vende também perfumaria; um supermercado tem padaria. Obrigar a escolher um
só dava um catálogo de arranque que não descreve o negócio.

Tabela nova `empresa_ramo` (migração `create_empresa_ramo`), com `unique(empresa_id, ramo)`
e **sem soft delete** — é um conjunto de escolhas, não um registo de negócio.
`empresa.ramo_actuacao` fica como o ramo PRINCIPAL (o primeiro), porque `auth/me` e o login
já o devolvem e há ecrãs com espaço para um nome só; é mantido em sintonia num sítio só
(`aplicarRamos`).

- **Não é uma lista dentro da coluna.** `"farmacia,perfumaria"` não tem unicidade, não se
  consulta sem `LIKE` (que casa `farmacia` com `farmacia-veterinaria`), e não tem onde
  guardar nada sobre a escolha.
- **O conjunto é substituído, não acrescentado**: desmarcar um cartão desmarca-o mesmo.
- **Desmarcar NÃO apaga o que o ramo semeou.** O dono pode já ter posto preço ou vendido;
  apagar-lhe catálogo por ter mexido num ecrã de configuração seria destruir trabalho dele.
- O backfill da 799 corre em duas passagens (ler, inserir) e não num `INSERT ... SELECT`,
  porque os ids têm de vir de `randomUUID()` — o `UUID()` do MySQL é v1 e este projecto
  tem validadores que exigem v4 (7.13).

O caminho `POST onboarding/ramo` ficou no singular apesar de o corpo ser uma lista: o nome
da rota é a chave da permissão no RBAC e renomeá-lo custaria um `permissao:conceder
--todas-empresas` em todos os ambientes por estética. O validador aceita `ramos` (lista) e
`ramo` (forma antiga), com `requiredIfMissing` nos dois.

#### 3. Mais produtos, e organizados

O catálogo passou de 6 para 13 ramos (juntaram-se padaria, perfumaria, papelaria,
ferragens, electrónica e agropecuária) e de ~6 para 15-25 produtos por ramo. `semearRamos
DeActuacao` semeia a **união** dos catálogos escolhidos, sem repetir o que é comum —
"Protector solar FPS 50" está em Farmácia e em Perfumaria, e `produtos` não tem unicidade
por nome, portanto sem a deduplicação ficavam duas linhas iguais.

No ecrã, o passo dos produtos passou a agrupar por categoria em secções dobráveis, com
contagem. Uma lista corrida de oitenta linhas — o que dois ou três ramos produzem — não se
lê, e era metade da razão por que o passo parecia partido.

Há um teste que semeia **cada ramo do catálogo** e verifica que nenhum produto fica sem
categoria: é a rede contra um erro de dados neste ficheiro, que de outra forma só aparece
quando um cliente escolhe esse ramo.

#### 4. Planos com limites impostos

Era o ponto mais forte do pedido: *"as diferenças entre planos não existem"*. E não
existiam mesmo — dois planos escritos à mão no frontend, **em euros**, com funcionalidades
inventadas ("Gestão de múltiplas farmácias"), a tabela `plano` **vazia**, e escolher um
plano a não mudar coisa nenhuma.

`alter_plano_limites` acrescenta `slug`, `limite_utilizadores`, `limite_postos`,
`limite_produtos`, `limite_faturacao_mensal`, `dias_gratuitos`, `funcionalidades` (JSON num
TEXT) e `ordem`. Todas anuláveis ou com default (7.20) — um `NOT NULL` aqui recusaria
escritas vindas do `taesic-backoffice-api`, que é outro projecto e não é actualizado ao
mesmo tempo.

`app/helpers/limites_do_plano.ts` impõe-nos em quatro sítios, nos repositórios e não nos
controllers (um limite no controller é um limite que o próximo caminho não conhece):

| limite | onde |
|---|---|
| utilizadores | `auth_repository.create()` |
| postos | `pos_repository.create()` |
| produtos | `produtos_repository.create()` e `registrarProdutoAndDetalhes()` |
| facturação mensal | `vendas_repository.close()` |

**Duas regras que atravessam tudo:**

1. **Sem plano, sem limite.** Uma empresa sem subscrição activa não é bloqueada. Um erro de
   configuração da plataforma não pode transformar-se numa loja que deixa de vender. Uma
   subscrição expirada também devolve "sem plano": cortar quem deixou de pagar é uma
   decisão de cobrança com aviso e prazo, tomada pelo backoffice ao suspender a empresa
   (7.15), não um efeito colateral de uma data passar.
2. **`null` é ilimitado, nunca zero.** E um limite de `0` gravado por engano no backoffice é
   tratado como ilimitado, para um plano mal preenchido não trancar uma empresa.

**`LimiteDoPlanoException` é 402 Payment Required**, não 403: quem faz o pedido tem
permissão, e o que falta é plano. É o único estado do HTTP desenhado para isto, e o
frontend distingue-o para mostrar o caminho para Subscrição em vez de "peça ao
administrador". A mensagem diz sempre o limite, o uso e o que fazer.

O **tecto de facturação** é o modelo de negócio pedido: o plano gratuito não é uma amostra
de 14 dias, é uma conta a sério, sem prazo, com um tecto mensal. É verificado ANTES da
transacção de `close()` — recusar a meio obrigaria a desfazer saídas de armazém, e recusar
depois de fechar deixaria o tecto sempre ultrapassado por uma venda.

⚠️ **Os NÚMEROS de `planos_padrao.ts` (7.500 Kz, 19.900 Kz, tecto de 500.000 Kz) são um
ponto de partida, não uma decisão fechada.** `plano` tem CRUD no backoffice; a lista só
garante que uma instalação nova não fica sem planos.

#### 5. O ecrã de Subscrição

`/[alias]/dashboard/subscricao` (`domain_assinatura.*`): plano actual, consumo real contra
os limites (as mesmas contagens que o backend usa para recusar, não uma estimativa),
cobranças, e mudar de plano. `assinatura_repository` responde à pergunta que
`domain_subscricao`/`domain_cobranca` — dois CRUD gerados sem ecrã — nunca responderam.

- **Mudar de plano cancela a anterior e abre uma nova**, em vez de reescrever: a subscrição
  antiga é o registo de que a empresa esteve naquele plano naquelas datas, e é a ela que as
  cobranças emitidas estão ligadas. Reescrevê-la faria uma factura passada dizer que era de
  outro plano.
- `emitirCobrancaPendente` é idempotente — carregar duas vezes em "pagar" não pode gerar
  duas dívidas.
- `cobranca.referencia` existia e nunca era preenchida; passa a ser
  (`SUB-<ALIAS>-<AAAAMM>-<4>`). É ela que torna a cobrança pagável por transferência
  enquanto o gateway não estiver ligado.

#### 6. Pagar deixou de ser obrigatório

O passo de pagamento **saiu do carrossel** e os ficheiros foram apagados. Era um formulário
de cartão que pedia número, validade e CVV, fazia `setTimeout(2000)` e marcava a conta como
paga — não enviava nada a lado nenhum. O passo do plano cria a subscrição (gratuita ou em
período livre) e não cobra; a cobrança vive em Subscrição.

O passo da equipa também deixou de ser falso: usava um `useState` e prometia "Enviaremos
convites por email". Agora chama `POST auth/register`, que já existia e que ninguém dali
chamava.

#### 7. ⚠️ BAI Paga: por ligar, e porquê

O gateway escolhido foi o **BAI Paga**. **Não está integrado, e não podia estar**: a
documentação técnica não é pública — o serviço exige conta domiciliada no BAI e BAI Directo,
e as credenciais de comerciante e o manual de integração vêm do gestor comercial.

Construir um cliente HTTP contra uma API adivinhada seria repetir exactamente o que este
trabalho veio remover: um formulário de pagamento que não paga. O botão no ecrã de
Subscrição está visível e **desactivado**, a dizer "por ligar", e a cobrança fica registada
com referência para ser liquidada por transferência.

Para ligar são precisos: credenciais de comerciante (merchant id / chave), o endpoint e o
formato do pedido, e o URL de callback para a confirmação do pagamento.

#### 8. Três try/catch que escondiam a nova excepção

Mesma classe de bug de 7.4/7.17/7.21, e desta vez apanhada **por HTTP, não por leitura**:

- `pos_controller.store` devolvia 500 "Erro interno do servidor" à `LimiteDoPlanoException`.
  Verificado a correr contra o servidor: antes 500, agora 402 com "O plano Grátis permite 1
  posto de atendimento, e a empresa já tem 1."
- `auth_controller.register` fazia o mesmo com o limite de utilizadores.
- `auth_repository.create` tinha um `catch (error)` que transformava **tudo** em
  `Exception('Erro ao criar conta')`. Passa a reenviar as excepções de domínio tal e qual e
  a reservar a mensagem genérica para o resto (falha de infra, erro de SQL).

Mais 2 dos ~48 controllers migrados para o handler global.

#### 9. Fixtures que não pareciam a realidade

`createCaixa`/`createVenda` não preenchiam `empresa_id` — os repositórios reais preenchem
(a partir do pos e da caixa). Nenhum teste dava por isso até o tecto de facturação, que
filtra por `vendas.empresa_id`, não ver nenhuma venda dos testes e passar por não encontrar
nada. Corrigido nas fixtures, com o porquê escrito lá.

> Vale como lembrete geral: uma fixture que produz um estado que a produção nunca cria faz
> testes passarem sobre uma realidade que não existe.

#### 10. Também nesta passagem

- **Não se desactiva o último PDV pelo ecrã.** A regra já existia no backend (7.21); o
  ecrã de Postos engolia o 409 e mostrava "Erro ao desabilitar posto.". Agora mostra a
  mensagem do servidor, e a opção desaparece quando é o único activo — oferecer uma acção
  que se sabe que vai ser recusada é pior do que não a oferecer.
- Moeda: `src/lib/moeda.ts`. O onboarding mostrava **euros** (`€49/mês`, `€0.00`) num
  produto angolano.
- Menu: "Subscrição" no painel do administrador.
- `mensagens-erro.ts` ganhou o 402.

- Suite: **745 testes** (eram 707). `tsc --noEmit` limpo nos dois projectos, `next build`
  a passar. Migrações 800 e 801 corridas em dev; `node ace planos:semear` corrido;
  permissões `domain_assinatura.*` concedidas nos modelos e com `--todas-empresas`.
  Verificado por HTTP: escolher plano, o 402 do limite de postos com a mensagem certa, e o
  catálogo de planos.

### 7.23 Onde os planos nascem, e documentos que diziam a empresa errada

Cinco relatos do dono do produto, na mesma passagem. Três deles são a mesma classe de
defeito: **um valor escrito à mão onde devia estar o valor de quem está autenticado.**

#### 1. O seeder deixava a tabela `plano` vazia

`database/seeders/database_seeder.ts` criava utilizadores, papéis e 331 permissões — e
zero planos. Uma instalação semeada de raiz ficava assim:

- o passo dos planos no onboarding aparecia sem nenhum plano para escolher;
- `garantirSubscricao()` (chamado no fim do onboarding) não encontrava plano de arranque
  e **devolve `null` em silêncio**, de propósito, para uma plataforma mal configurada não
  prender ninguém no onboarding;
- a empresa saía configurada e **sem subscrição** — logo, sem plano;
- e "sem plano, sem limite" (7.22) faz o resto: acesso ilimitado, sem nada a dizê-lo.

Passa a chamar `semearPlanosPadrao()`, e **em primeiro lugar**, antes dos utilizadores.
É idempotente por `slug` e nunca sobrepõe o que já existe — um preço afinado no backoffice
não é revertido por uma corrida do seeder. `node ace planos:semear` continua a ser o
caminho para uma base que já tem dados, porque este seeder não é idempotente
(`Users.createMany` rebenta com emails repetidos).

Verificado numa base descartável (`migration:run` + `db:seed` de raiz): os três planos
ficam gravados com os limites e com `funcionalidades` a ler de volta como lista.

> **Achado em dev, e é o sintoma inteiro numa linha:** a base de desenvolvimento tinha
> exactamente DOIS planos — "Plano Base" (15.000 Kz) e "Plano Pro Max" (25.000 Kz), ambos
> criados pelo backoffice, ambos **sem slug e sem um único limite**. Sem `slug='gratuito'`,
> `planoDeArranque()` cai no mais barato activo: toda a empresa que concluísse o onboarding
> ficava no "Plano Base" — a pagar 15.000 Kz no papel e sem limite nenhum na prática.

#### 2. O backoffice não tinha onde registar um plano a sério

O ecrã `/painel/planos` existia (CRUD completo). O que não existia eram os campos que
fazem um plano ser diferente de outro: os `limite_*` de 7.22 não estavam no model do
`taesic-backoffice-api`, nem no validador, nem no formulário. **Todos os planos criados
por ali nasciam com os limites a NULL, e NULL é ilimitado.**

O detalhe está documentado do lado onde vive (`taesic-backoffice-api/CLAUDE.md` §8.3). O
que interessa reter aqui, porque é uma regra deste projecto:

> **Uma coluna nova numa tabela partilhada não chega ao outro projecto sozinha.** O
> `colunas_fantasma.spec.ts` corre dos dois lados e apanha uma coluna *declarada e
> inexistente*. O caso simétrico — a coluna existe e o model do outro projecto ignora-a —
> é invisível para ele, e é este. Ao acrescentar colunas a uma tabela que o backoffice
> escreve (`plano`, `taxa_iva`, `empresa`, `papel`), a migração é aqui **e o model é nos
> dois sítios**.

#### 3. A proforma saía com os dados de OUTRA empresa

Relato: *"a factura proforma [sai errada] tão logo quando é feita a proforma"* — e a
palavra que resolve o caso é "tão logo". Há duas páginas de proforma:

| ecrã | quando | estado |
|---|---|---|
| `faturas-proforma/[id]` | aberta mais tarde, pela lista | correcta |
| `faturas-proforma/preview` | **logo a seguir a gerar** | errada |

A preview desenhava o emitente a partir de `EMPRESA_POR_OMISSAO` — "Taesic, Lda.", NIF
"(NIF por configurar)", "Luanda, Angola", "+244 900 000 000". Nunca chamava
`sincronizarEmpresaSessao()`, apesar de importar o helper. E o PDF descarregado no mesmo
ecrã saía **certo**, porque o gerador vai à sessão por conta própria: o que se via e o que
se guardava eram documentos com emitentes diferentes.

Mais três defeitos encontrados no mesmo sítio, e dois deles nas DUAS páginas:

- **`const EMPRESA_SESSAO = getEmpresaSessao()` ao nível do módulo.** Avaliado uma vez, na
  primeira importação. Se nessa altura o storage não tivesse a empresa, ficava `{}` para
  sempre — e é dele que saía o cálculo do IVA. A página `[id]` já tinha sido corrigida no
  cabeçalho e continuava a calcular o imposto sobre esta constante.
- **A linha de IVA aparecia sempre.** `liquidaIva()` era chamado (`MOSTRA_IVA`) e o
  resultado **nunca era usado** — nos dois ficheiros, e também no ecrã de pagamento do
  PDV. Uma empresa fora do regime via "IVA 0,00 Kz", que não é a mesma coisa que não
  liquidar imposto.
- **`"IVA (14%)"` escrito à mão no PDF da proforma**, com a taxa fixa, enquanto o ecrã já
  usava `rotuloIva()`. Papel e ecrã a discordar sobre imposto no mesmo documento.

Agora as duas páginas passam a empresa ao gerador (`empresaSessao`), e o gerador prefere-a
ao storage: **o ecrã e o ficheiro lêem a mesma coisa, por construção.**

#### 4. Os botões de imprimir do pós-venda não faziam nada

Relato: *"o botão para imprimir a factura não funciona no pós venda"*. **Duas causas
independentes**, e qualquer uma sozinha bastava:

1. **O carrinho era esvaziado antes do ecrã de sucesso existir.** A finalização fazia
   `clearSales()` e o efeito `[sales]` punha `product` a vazio; `printReceipt` começa por
   `if (safeProducts.length === 0) return` — um `return` mudo. Os dois botões do ecrã de
   sucesso ("Imprimir" e "Baixar") ficavam sem nada para desenhar e não diziam porquê.
   O carrinho passa a viver exactamente o tempo do ecrã de sucesso: limpo por "Nova
   venda", por "Ver histórico", e por um efeito de desmontagem que cobre o menu lateral,
   o botão de voltar e fechar o separador. Sem esse efeito, sair pelo menu depois de
   vender deixava os produtos **já vendidos** no carrinho, prontos a ser vendidos outra
   vez.
2. **`window.open` na factura A4.** Exactamente o bug que `imprimirPdf()` (iframe
   escondido) já resolvia no recibo térmico: entre o clique e o `window.open` corre um
   `await`, e nessa altura o browser deixa de tratar a abertura como resultado do clique —
   o bloqueador de pop-ups cancela-a **sem erro nenhum**. O gerador A4 vive noutro
   ficheiro e ficou para trás quando o térmico foi corrigido. `imprimirPdf` passou a ser
   exportada e é usada pelos dois; uma segunda cópia seria a forma segura de a próxima
   correcção ficar só num dos lados.

E o `return` mudo passou a mensagem: um botão que não faz nada e também não explica é
indistinguível de um botão avariado.

#### 5. Terminar uma venda descarregava a factura

`await printReceipt(vendaId)` na finalização, sem modo — e o modo por omissão é
`"download"`. **Toda a venda terminada deixava um PDF na pasta de transferências**, sem
ninguém o pedir. Retirado: o ecrã de sucesso já tem "Imprimir" e "Baixar", e agora
funcionam.

#### 6. As duas vias

`faturas-recibos/[id]` já imprimia ORIGINAL e DUPLICADO (em HTML, dois `.via`). O
pós-venda — que é o que se imprime todos os dias — saía com um exemplar só.

`generateProfessionalPDF` e `generateA4` ganharam um parâmetro `vias`, e o desenho de cada
exemplar passou a viver numa função (`desenharVia`) chamada uma vez por via, com
`doc.addPage()` entre elas. O rótulo vai no topo, junto ao título: quem separa a folha do
cliente da que fica no arquivo lê o topo, não o rodapé.

- **Imprimir leva as duas vias; descarregar leva uma, sem rótulo.** Quem guarda um ficheiro
  não quer a cópia de arquivo lá dentro, e é a mesma regra que o detalhe da factura já
  seguia ("segunda via, só no papel").
- No térmico, `pageHeight` cresce 6mm quando há rótulo — a altura da folha é calculada
  antes de se desenhar e a linha nova não cabia no cálculo antigo.

#### 7. Na mesma passagem

- **A morada do CLIENTE na factura A4 era `"Luanda, Angola"`, escrita à mão**, igual em
  todas as facturas de todas as empresas. Retirada e não corrigida: o carrinho não traz a
  morada do cliente, e inventar a morada de um destinatário numa factura é pior do que
  não a ter. Mesma decisão já tomada para o IBAN fixo que estava neste ficheiro.
- `dialogo-de-formulario.tsx` (backoffice) ganhou `CampoDeTextoLongo` — a lista de
  funcionalidades é uma entrada por linha e não cabe num `<input>`.

#### 8. ⚠️ A CSP da aplicação bloqueava a impressão — e falhava em silêncio

**Isto não estava no relato, e é provavelmente a causa mais funda de "imprimir não
funciona".** Apareceu numa mensagem de consola apanhada pelo teste de browser novo:

```
Framing 'blob:http://localhost:3000/…' violates the following Content Security
Policy directive: "default-src 'self'". The request has been blocked.
```

Imprimir um recibo é gerar o PDF com jsPDF e abri-lo num **iframe escondido** para chamar
`print()` sobre ele (`imprimirPdf`). O iframe existe precisamente para não ser um pop-up.
Só que `next.config.mjs` não declarava `frame-src`, portanto valia o `default-src 'self'`
— e um `blob:` não é `'self'`. O browser recusava o embutido: **o PDF era gerado, o
iframe entrava no DOM, o `onload` nunca disparava com conteúdo, e a caixa de impressão
nunca abria.** Sem erro visível, sem toast, sem nada.

Acrescentado `frame-src 'self' blob:`. Continua a não ser possível embutir conteúdo de
outra origem, e `frame-ancestors 'none'` — quem nos pode embutir a NÓS — fica intocado.

> Vale como regra: uma técnica que evita o bloqueador de pop-ups (iframe, worker, blob)
> passa a depender da CSP. Quando o remédio muda de mecanismo, a política tem de saber.

#### 9. Dois obstáculos no caminho, corrigidos para se poder verificar

Nenhum dos dois foi relatado; ambos impediam **qualquer** verificação em browser.

- **`node ace seed:qa-tenant` estava partido desde 7.13.** Criava a empresa com
  `Empresa.create` directamente — logo, sem passar por `CreateEmpresaUserDetalhes` e sem
  `clonarPapeisPadrao()` — e rebentava a seguir com «Não existe o papel "Admin" no âmbito
  "empresa"», já depois de ter criado empresa e utilizador. Deixava um inquilino de QA a
  meio, sem administrador. Além disso resolvia o papel com `Papel.findByOrFail('nome',
  'Admin')`, que 7.13 avisa não identificar um papel: devolvia o MODELO, e a verificação
  seguinte nunca encontrava a atribuição (que aponta para a cópia da empresa), pelo que o
  comando reatribuía o papel em cada corrida. Corrigidas as duas coisas, e **acrescentado
  o passo que faltava desde 7.21**: marcar o onboarding como concluído, pelo repositório
  real (`OnboardingRepository.concluir`, que também garante a subscrição). Sem isso o
  `ProtectedRoute` prende a sessão de QA em `/[alias]/onboarding` e todos os testes de
  browser param no primeiro ecrã — o login passa e mais nada passa, que é o pior sintoma
  possível porque parece um problema da página que se está a testar.
- **A caixa do inquilino de QA não tinha `empresa_id`**, e isso produzia vendas que a
  produção nunca produz. `vendas_repository.create()` copia o `empresa_id` da CAIXA para
  a venda; sem ele segue por um ramo alternativo que grava a venda **sem `empresa_id` e
  sem número sequencial**. O comando criava a caixa com `Caixa.create` directo, ao
  contrário de `caixa_repository.open()`, que o preenche a partir do utilizador. As
  facturas saíam como `FAT-4F7E3253` (um pedaço de UUID) em vez de `FAT-000001` — e, o
  que é pior, **`faturacaoDoMes()` filtra por `vendas.empresa_id`**: o tecto de
  facturação do plano nunca contaria uma única dessas vendas, e um teste do 402 do tecto
  passaria por não encontrar nada em vez de por o limite funcionar. Corrigido, com
  reparação da caixa que a versão anterior deixou. **A produção não é afectada** —
  `open()` sempre preencheu o campo; era só o inquilino de teste que não se parecia com
  ela. É a lição de 7.22 outra vez, e desta vez do lado do comando e não das fixtures.
- **Os testes de browser tinham três cópias do login**, e o placeholder do campo da
  empresa mudou (`empresa_1` → `minha-empresa`). `_login.mjs` existe exactamente para
  isso não acontecer e nunca chegou a ser adoptado por `proforma.mjs`, `sessao.mjs` e
  `smoke.mjs`. Resultado: falhavam num timeout de 90 s sem dizer que a causa era um
  selector cosmético. `proforma.mjs` passou a usar o helper; os outros dois passaram a
  procurar pelo NOME do campo (`input[name="company_alias"]`), que é contrato, e não pelo
  placeholder, que é texto de interface.

#### Verificado

Ao contrário do que costuma acontecer com trabalho de frontend neste repositório, **isto
foi verificado a correr, em browser real** — e os dois testes novos foram postos à prova
contra o código ANTIGO antes de se acreditar neles.

| suite | resultado |
|---|---|
| `taesic-backend` — `node ace test` | **745** (sem alteração: a mudança é o seeder) |
| `taesic-backoffice-api` — `node ace test` | **193** (eram 181; +12 de `plano_limites.spec.ts`) |
| `alaragest-webpage` — `npm run e2e:proforma` | **12/12** (eram 7; +5 sobre o emitente e o IVA) |
| `alaragest-webpage` — `npm run e2e:pos-venda` | **13/13** (novo) |
| `alaragest-webpage` — `npm run e2e:smoke` | 21/21 |
| `tsc --noEmit` | limpo nos quatro projectos |
| `next build` | passa nos dois frontends |

**Os dois testes novos têm dentes, e está provado:**

- Reposto o emitente de exemplo na pré-visualização da proforma → falham *"A
  pré-visualização identifica a empresa autenticada — falta o nome «QA Audit Empresa»;
  falta o NIF 5000000000; mostra o emitente de exemplo «Taesic, Lda.»"* e *"Sem regime de
  IVA, o documento não tem linha de imposto"*.
- Repostos o `clearSales()` e o `printReceipt` na finalização → falham 6 asserções, com o
  relato do utilizador escrito nelas: *"descarregou recibo_FAT-….pdf"* e *"nenhum PDF foi
  gerado — o botão não fez nada"*, nos dois formatos, mais o "Baixar".

E, do lado dos dados: seeder corrido de raiz numa base descartável (três planos gravados
com os limites); `node ace planos:semear` corrido em dev; `POST api/plano` verificado por
HTTP com os limites e com as duas recusas (limite zero, slug repetido) em português.

> ⚠️ **`e2e:pos-venda` FECHA UMA VENDA A SÉRIO** no inquilino `qa-audit` — consome stock
> e escreve na caixa. É para isso que o inquilino de QA existe, e é a razão de não correr
> contra a empresa de ninguém. Não apontar estes testes a dados reais.

> ⚠️ **`npm run e2e:sessao` tem 2 falhas pré-existentes**, e são do TESTE, não do produto:
> ainda exige que o token de sessão esteja no `localStorage`/`sessionStorage`, e o token
> saiu do browser para um cookie httpOnly. Não foi tocado — corrigi-lo é decidir qual é
> hoje o contrato da sessão, e isso não é uma decisão de arrumação.

> ⚠️ **`taesic-backoffice` não tem testes de browser** (só `e2e/bff-tunel.mjs`, que é uma
> regressão do proxy e não abre browser nenhum). O ecrã de planos foi verificado por
> `tsc`, por `next build` e pela API por baixo dele — não por execução da página.

### 7.24 Auditoria de segurança — a fronteira da empresa nas chaves estrangeiras, e as imagens

Auditoria pedida sobre 20 categorias de vulnerabilidade (Next.js + Caddy + VPS). A maior
parte do sistema saiu limpa — e vale dizer quais, porque não voltar lá é metade do valor:
ReDoS (as regexes têm prefixos disjuntos), segredos no bundle, LFI, XXE, poluição de
protótipo (não há fusão profunda em lado nenhum), empilhamento de descontos (`desconto`
0–100, cupão único, `Math.min(…, total)`, soma de pagamentos reconciliada), e o binding de
rede da VPS (`ufw` com 22/80/443, MySQL em `127.0.0.1`).

O que não saiu limpo foi o mesmo defeito repetido em quatro sítios, mais duas coisas na
infraestrutura.

#### O isolamento multi-tenant estava metade feito

**`findOrFail(id, companyAlias)` protege o RECURSO. Nada protegia as CHAVES ESTRANGEIRAS
escritas para dentro dele.** Vários validadores confirmavam só que a linha apontada existia
— em qualquer sítio da base de dados:

```ts
.exists(async (db, value, __) => {
  const exists = await db.from('user').where('id', value).first()
  return !!exists
})
```

O `__` no terceiro parâmetro é o sintoma: é o `FieldContext`, o único sítio de onde vem o
`company_alias` da rota, e estava explicitamente ignorado. §7.14 já tinha deixado isto
assinalado em aberto, com o `produto_media_validator` nomeado.

| rota | o que dava | |
|---|---|---|
| `POST caixas` | abrir caixa em nome de funcionário de outra empresa | escrita cross-tenant |
| `POST/PUT cliente` | `cliente_pai_id` de outra empresa | **escrita vira LEITURA** |
| `PUT produto-medias/:id` | mover a nossa imagem para o produto de outra empresa | escrita cross-tenant |
| `POST cobranca` | cobrança contra a subscrição de outra empresa | escrita cross-tenant |

O caso do `cliente` é o pior porque não fica pela escrita: `cliente_pai` é uma relação LIDA
de volta (`belongsTo` em `cliente.ts`, filtro em `cliente_repository.ts`), portanto apontá-la
ao cliente de outra empresa serve a ficha do concorrente pela nossa própria API. Nenhum
destes é furo de autenticação — o atacante entra pela porta, com conta verdadeira da empresa
dele. É o que a OWASP chama BOLA.

**Correcção**: `app/validators/pertence_a_empresa.ts`, um `exists()` com fronteira de
empresa. Não é mecanismo novo — `existeNoDominio`/`papelDestaEmpresa` em `auth_validator.ts`
já faziam isto desde sempre; os quatro validadores é que tinham ficado para trás. **Falha
fechada**: sem `company_alias` no contexto devolve `false`, nunca "sem filtro".

`tests/functional/validators_fronteira_empresa.spec.ts` (9 testes). **Tem dentes, e está
provado**: revertida a correcção, as 5 rejeições falham e as 4 aceitações continuam a passar.
Os testes de ACEITAÇÃO não são decoração — são o que impede a correcção de ser um
`return false`, que passaria todas as rejeições e partiria o produto.

> **Armadilha apanhada a escrever o teste**: a primeira versão do teste de rejeição do
> cliente omitia `tipo` (obrigatório). Passava — mas por ser recusado por falta de `tipo`,
> nunca chegando a exercitar a fronteira. **Um teste de rejeição só prova alguma coisa se
> todos os OUTROS campos forem válidos.**

#### As imagens de cliente iam para o disco do servidor, não para o R2

`cliente.logo`/`foto` eram escritos por um `.transform()` DENTRO do validador, a chamar
`file.move('uploads', ...)`. Quatro defeitos somados:

1. Disco local em vez do R2, num caminho que **nada serve** — não existe `uploads/` na raiz
   (há `public/uploads/`, que é outro sítio). Escritos e nunca mais lidos: a funcionalidade
   estava partida de ponta a ponta. Confirmado no frontend, que nunca lê estes campos.
2. 25 MB por pedido, sem limpeza, por qualquer utilizador autenticado — caminho para encher
   o disco da VPS a partir de um `POST`, e com ele parar a produção e a BD.
3. `move()` é assíncrono e `.transform()` é SÍNCRONO: a promessa nunca era aguardada nem
   apanhada.
4. I/O num validador escreve o ficheiro mesmo quando outro campo do pedido é recusado.

**A regra que fica: o validador valida, o repositório escreve.** É o que o `produto_media`
já fazia. `app/helpers/imagem_r2.ts` passou a ser o único caminho (`guardarImagem`,
`caminhoDoObjecto`, `apagarImagemPorUrl`), e o `produto_media_repository` foi consolidado
nele — a derivação inversa URL→caminho tem de continuar a concordar com `urlPublicaR2()`, e
duas cópias divergiriam.

> **Bug que EU introduzi e o teste apanhou**: escrevi `{ logo: await resolverImagem(...) }`
> a partir da ideia — errada — de que o `merge()` do Lucid ignora `undefined`. **Não
> ignora**: a chave existe e atribui `undefined` por cima do valor da BD. Um update que
> mexesse só no nome APAGAVA a foto. A chave tem de estar AUSENTE, não a `undefined`.

`tests/functional/cliente_imagens_r2.spec.ts` (9 testes) usa **`drive.fake('r2')`** — que
exigiu acrescentar `fakes: { location: app.tmpPath('drive-fakes') }` a `config/drive.ts`.
Sem isso não há forma de exercitar um upload sem falar com o R2 a sério, e um teste que
falha por a rede estar em baixo não diz nada sobre o código. **Precedente novo neste
projecto**; o `MultipartFileFactory` sozinho não chega, porque `moveToDisk()` lê o
`tmpPath` — é preciso escrever um ficheiro de verdade e atribuí-lo.

`softDelete` de cliente **não** apaga as imagens, ao contrário do de `produto_media`: aqui é
um ALTERNADOR, e repor devolveria uma ficha com as imagens partidas.

#### Infraestrutura

- **`utils.taesic.bknkv.com` retirado do Caddyfile.** Expunha `/consultar-nif/:nif` e
  `/consultar-bi/:bi` **sem autenticação, sem limitador** (`@adonisjs/limiter` nem é
  dependência daquele projecto) **e sem shield**. Consulta de BI de cidadãos aberta ao
  mundo, e cada pedido lança um Chromium (`chromium.launch()`), sem fila nem limite de
  concorrência. Apagar não parte nada: o único consumidor é `nif_repository.ts:43`, que já
  usa `http://127.0.0.1:3400`.
- **Caddyfile**: tempos limite (não havia nenhum — Slowloris), `includeSubDomains` no HSTS,
  `request_body max_size`.
- **`X-Forwarded-For`: não se mexe nele no Caddy, e a primeira versão deste trabalho estava
  errada.** Tinha posto `header_up X-Forwarded-For {remote_host}` nos quatro sites, para
  substituir a cadeia em vez de lhe acrescentar. O `caddy validate` avisou que era
  desnecessário — e é: o `reverse_proxy` só ACRESCENTA à cadeia quando a ligação vem de um
  endereço declarado em `trusted_proxies`, e não há nenhum declarado. O que o cliente enviar
  já é descartado por omissão.
  **E não era só redundante — era uma mina.** No dia em que houver uma CDN à frente com
  `trusted_proxies` declarado, o Caddy passaria a derivar bem o IP do visitante e aquela
  linha sobrepunha-o com o endereço da CDN: todos os utilizadores a contar como um só, e os
  limitadores por IP a barrar a plataforma inteira de uma vez. Retirada.
  **Lição**: o aviso do `caddy validate` não era ruído. Um "unnecessary" numa directiva que
  se escreveu de propósito é um sinal de que a premissa sobre o comportamento por omissão
  está errada — vale sempre confirmar antes de o ignorar.
- **Os cabeçalhos passaram a usar o operador `?`** ("define só se ainda não existir"). Sem
  ele o Caddy SUBSTITUÍA o que a aplicação enviava — e estava a rebaixar o
  `Referrer-Policy: no-referrer` do backoffice para `strict-origin-when-cross-origin`. Uma
  linha escrita para melhorar a segurança estava a desfazer a decisão mais cuidada tomada na
  aplicação.
- **Limitação de ritmo**: `servidor-caddy-ratelimit.sh`. O `rate_limit` é módulo de
  terceiros e exige reconstruir o binário; o bloco fica COMENTADO no Caddyfile e é o script
  que o descomenta — depois de confirmar que o binário novo tem mesmo o módulo, e desfazendo
  binário e configuração se o `validate` ou o `reload` falharem. **A ordem importa: primeiro
  o binário, só depois a configuração.** Ao contrário deixa o site em baixo.
- **`clx` removido** de `alaragest-webpage`. Nome com forma de typosquat do `clsx`, que está
  lá ao lado, e zero usos em todo o projecto.

#### Verificado

**816 testes** (eram 807), `tsc --noEmit` limpo no backend e no frontend, `next build` a
passar.

O Caddyfile foi escrito numa máquina **sem binário do Caddy** e validado depois, no
servidor. Valeu a pena: foi o `caddy validate` que apanhou o `header_up X-Forwarded-For`
(acima) — quatro avisos que teriam passado despercebidos se o ficheiro tivesse sido
aplicado sem validar. **Correr `caddy validate` antes do `reload`, sempre, e LER os avisos,
não só o "Valid configuration" do fim.**

O `servidor-caddy-ratelimit.sh` continua por executar — exige reconstruir o binário no
servidor. O `sed` que ele usa para descomentar foi simulado sobre o Caddyfile real e produz
sintaxe correcta, mas o script em si nunca correu.
