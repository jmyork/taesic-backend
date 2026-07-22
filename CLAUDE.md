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
  Templates edge em `resources/views/emails/`, reaproveitando os partials
  `emails/partials/alaragest_header` e `alaragest_styles`.

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
  `tsc --noEmit` (os 37 já existentes, listados na secção 7.5, não têm relação com
  nada tocado aqui).

### 7.5 Backlog conhecido, não tocado (propositadamente — ver secção 2)

- `pessoa_dto.ts` declara `tipo: string`, mas o model `pessoa.ts` tipa `tipo` como
  `'Cliente' | 'Funcionario' | 'Promotor'` — mismatch de tipos pré-existente (não
  quebra em runtime, só falha `tsc --noEmit`).
- ~29 repositórios com `paginate()`/lógica própria (caixa, vendas, estoque, produtos,
  cupom, factura, promotor*, os `produto_*`, etc.) continuam por consolidar em
  `BaseRepository` — e é intencional (ver secção 2).
- ~48 controllers ainda com o padrão antigo de try/catch duplicado (7 já migrados) —
  migrar incrementalmente para o padrão do handler global, um de cada vez, com teste a
  confirmar antes/depois.
- ~12 `*QueryValidator` ainda não usam `commonQueryFields` (userpos, pos, categorias_
  produtos, metodopagamento, cupom, factura, vendas, produtos_reembolso, venda_itens,
  lote, promotor, produtos [`ProdutoQueryValidator`, tem campos a mais que não se
  encaixam 1:1]) — mesma receita a aplicar, ver secção 6.
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
