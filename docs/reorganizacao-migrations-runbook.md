# Runbook — reorganização de migrations e seeders

Como aplicar o trabalho da branch `chore/reorganizacao-migrations-seeders`.

**Nada disto foi executado em QA nem em produção.** Tudo o que segue foi validado
em bases descartáveis na máquina de desenvolvimento; a execução nos servidores é
deliberadamente deixada para uma pessoa.

---

## 0. O que mudou, em três linhas

| | antes | depois |
|---|---|---|
| migrations | 125 ficheiros | 56 (uma por tabela) + 1 da auditoria |
| `database_seeder.ts` | 1932 linhas | 110 |
| catálogo RBAC | dentro do seeder, não repetível | `app/helpers/rbac_padrao.ts`, idempotente |
| auditoria | só `security_logs` (segurança) | `activity_logs` (tudo o que se faz) |

O schema é **idêntico** ao anterior, mais a tabela `activity_logs`. Verificado por
comparação mecânica — ver a secção 5.

---

## 1. Antes de tocar em nada

```bash
# 1.1 Backup COMPLETO da base de qualidade. Sem isto não há passo 2.
mysqldump -h <host> -u <user> -p --single-transaction --routines --triggers \
  <base_qua> > backup-qua-$(date +%Y%m%d-%H%M).sql

# 1.2 Fotografia do schema ACTUAL, para comparar no fim.
#     Não usa mysqldump de propósito: a saída deste script é determinística e
#     um `diff` mostra a coluna exacta que mudou.
node scripts/schema/snapshot.cjs \
  --host <host> --user <user> --password '<pw>' --database <base_qua> \
  --out schema-qua-antes.txt

# 1.3 Baseline dos testes, para comparar no fim.
node ace test 2>&1 | tail -5
```

Guardar `backup-*.sql` e `schema-qua-antes.txt` fora da máquina. São o ponto de
retorno.

**Ponto de rollback no git:** a tag `antes-reorganizacao-migrations` aponta para o
commit anterior a todo este trabalho.

---

## 2. Qualidade — a base VAI ser limpa

Este é o caminho fácil, e é o cenário para que isto foi desenhado.

```bash
git checkout chore/reorganizacao-migrations-seeders

# A collation da BASE tem de bater certo com a de dev, senão as chaves
# estrangeiras entre colunas de texto são recusadas (secção 7.20.2 do CLAUDE.md).
# Confirmar ANTES:
#   SELECT DEFAULT_COLLATION_NAME FROM information_schema.SCHEMATA
#    WHERE SCHEMA_NAME = '<base_qua>';
# Em dev é utf8mb4_0900_ai_ci.

node ace migration:fresh --force      # larga tudo e cria de raiz
node ace db:seed                      # planos, catálogo RBAC, 3 contas de plataforma
```

`--force` não é opcional fora de desenvolvimento: sem ele o Adonis pergunta, e num
pipeline sem terminal a resposta é sempre não — a migração não corre e o comando
parece ter passado (7.20.1).

Confirmar:

```bash
node ace migration:status | grep -c pending      # tem de ser 0
```

---

## 3. Produção — a base JÁ TEM o schema

**Nunca correr `migration:fresh` aqui.** Produção tem as 125 migrations antigas
registadas em `adonis_schema`, e nenhum desses nomes existe agora.

Há duas formas de lá chegar, e a diferença entre elas importa:

### 3.1 O caminho recomendado: `migration:baseline`

```bash
node ace migration:baseline --dry-run    # mostra o que faria, sem escrever
node ace migration:baseline              # regista as 56 SEM as executar
node ace migration:run --force           # cria só a activity_logs, que é nova
```

`migration:baseline` **verifica primeiro** que todas as tabelas esperadas existem e
recusa-se a correr se faltar alguma — marcar como feito o que não foi seria pior do
que não fazer nada.

### 3.2 Porque é que `migration:run` sozinho também funcionaria

As 56 migrations são idempotentes (`temTabela` antes de cada `createTable`),
portanto correr `migration:run` numa base que já tem as tabelas salta-as todas e
limita-se a registá-las. O resultado é o mesmo.

Prefere-se na mesma o `baseline`: diz o que vai fazer antes de o fazer, verifica que
não falta nenhuma tabela, e não depende de a idempotência estar correcta em todos
os 56 ficheiros.

### 3.3 O ruído no `migration:status`

Depois do baseline, os 125 nomes antigos ficam sem ficheiro e aparecem como
`corrupt — file missing`. **É só cosmético** — está verificado que `migration:run` e
`migration:rollback` continuam a funcionar com eles lá.

```bash
node ace migration:baseline --limpar-orfas     # tira-os do registo
```

Correr isto **numa segunda passagem, dias depois**, e não no mesmo deploy: enquanto
as linhas antigas lá estiverem, repor a versão anterior do código é um `git revert`
e mais nada, porque o registo dela ainda bate certo com os ficheiros dela.

### 3.4 O catálogo RBAC, numa base com dados

```bash
node ace rbac:semear      # idempotente; só acrescenta o que falta
node ace planos:semear
```

`db:seed` **não serve** numa base com dados: não é idempotente
(`Users.createMany` rebenta com emails repetidos).

⚠️ `rbac:semear` mexe nos papéis MODELO. As empresas já existentes têm cópias
próprias e não são alteradas — para lá chegar:

```bash
node ace permissao:conceder <permissao> <papel> --todas-empresas
```

É a armadilha que o CLAUDE.md regista quatro vezes (7.6, 7.8, 7.12, 7.21).

---

## 4. Auditoria — o que é preciso saber antes de ligar

A tabela `activity_logs` é criada pela migração `1790000000560`. A partir do momento
em que existe, **toda** a escrita que passe pela API deixa uma linha.

- Escreve o `taesic-backend`; **consulta-se pelo `taesic-backoffice-api`**
  (`GET api/auditoria`, `.../resumo`, `.../registo`), com papel de plataforma.
- A escrita é *fire-and-forget*: uma falha a gravar auditoria nunca parte o pedido
  que a originou. Em troca, não é um registo à prova de falhas — está dito no
  próprio ficheiro.
- **Volume.** Uma linha por POST/PUT/PATCH/DELETE. Vale a pena decidir uma política
  de retenção antes de a tabela crescer (ex.: um `DELETE` mensal do que tiver mais
  de N meses, por `id`, que é a chave). Não foi implementada nenhuma — impor uma
  retenção a dados de auditoria é uma decisão de negócio, não técnica.
- O corpo dos pedidos **não** é gravado (passwords, dados de pagamento). Ver o
  comentário em `app/middleware/activity_log_middleware.ts`.

O `taesic-backoffice-api` precisa do model `app/models/activity_log.ts`, que já lá
está. Esse projecto **não tem migrations e não deve ganhar nenhuma** (regra 7.18).

---

## 5. Validação

```bash
# 5.1 O schema resultante é o mesmo?
node scripts/schema/snapshot.cjs \
  --host <host> --user <user> --password '<pw>' --database <base_qua> \
  --out schema-qua-depois.txt

diff schema-qua-antes.txt schema-qua-depois.txt
```

A única diferença esperada é a tabela `activity_logs` (22 linhas). Qualquer outra
coisa é um problema — parar e investigar.

Foi este o resultado obtido na verificação em dev, contra as 125 migrations
originais corridas de raiz:

```
57 -> 58 tabelas, 531 -> 545 colunas, 210 -> 215 índices,
82 -> 82 chaves estrangeiras, 2 -> 2 gatilhos
diferença: só a activity_logs
```

```bash
# 5.2 Os dados semeados
node ace db:seed   # ou rbac:semear, conforme o ambiente
# esperado numa base de raiz: 15 papéis, 316 permissões, 884 ligações, 3 planos

# 5.3 Testes
node ace test          # taesic-backend: 764
npm run typecheck

cd ../taesic-backoffice-api
node ace test          # 210
npm run typecheck
```

### 5.4 Fluxos a testar à mão

Os que dependem de dados semeados, e que nenhum teste automático cobre
ponta-a-ponta contra o ambiente real:

1. Registar uma empresa nova → confirmar que recebe os 10 papéis clonados, um posto
   de atendimento e os métodos de pagamento.
2. Entrar com o Admin dessa empresa e fechar uma venda (o fluxo que já ficou partido
   três vezes por falta de permissões — 7.12).
3. Concluir o onboarding: escolher ramo, ver o catálogo semeado, escolher plano.
4. No backoffice, abrir a auditoria e confirmar que as acções dos passos 1 a 3
   aparecem, com o utilizador certo.
5. Provocar um erro de propósito (ex.: apagar o último posto de atendimento) e
   confirmar que a recusa aparece na auditoria com o código de estado.

---

## 6. Se correr mal

```bash
# Código
git checkout dev            # ou a tag antes-reorganizacao-migrations

# Base de dados de qualidade
mysql -h <host> -u <user> -p <base_qua> < backup-qua-AAAAMMDD-HHMM.sql
```

Em produção, se o baseline já tiver corrido e for preciso voltar atrás: as 125
linhas antigas continuam em `adonis_schema` (desde que `--limpar-orfas` NÃO tenha
sido corrido), portanto repor o código anterior chega. É a razão de essa limpeza
ser um segundo passo, dias depois.

---

## 7. O que ficou por fazer, e porquê

- **Nada foi executado em QA nem em produção.** As secções 2 e 3 nunca correram
  fora de bases descartáveis locais.
- **A base de dev (`auth_system`) não foi tocada.** Continua com as 125 migrations
  antigas registadas e sem a tabela `activity_logs`. Para a pôr em dia é o caminho
  da secção 3, ou recriá-la de raiz.
- **Sem política de retenção para `activity_logs`** — ver a secção 4.
- **O `taesic-backoffice-api` não tem um único commit** (o repositório tem `git
  init` e zero ficheiros seguidos). O trabalho da auditoria está no disco e testado,
  mas fazer o commit inicial de um projecto inteiro é uma decisão que não foi tomada
  aqui.
- **A auditoria não regista o "antes e depois" automaticamente.** O middleware
  regista quem/o quê/quando/resultado; o diff campo a campo exige chamar
  `registarActividade()` com `diferencas()` no repositório onde a mudança acontece.
  Um hook do Lucid daria o diff sozinho mas não saberia QUEM — `useAsyncLocalStorage`
  está desligado em `config/app.ts`, e ligá-lo é uma mudança de comportamento global.
