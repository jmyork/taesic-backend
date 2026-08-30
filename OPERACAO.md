# Operação — `taesic-backend`

Tudo o que é preciso para publicar, diagnosticar e recuperar este projecto no
servidor, sem ter de perguntar a ninguém.

Se só quer publicar e seguir a vida, leia a secção 3 e ignore o resto até
alguma coisa correr mal.

---

## 1. O que é isto, e onde corre

A API de facturação. É o **dono do esquema da base de dados** — as migrações
vivem aqui e em mais lado nenhum. O `taesic-backoffice-api` usa a mesma base,
mas nunca lhe toca na estrutura.

| Ambiente | Serviço | Porta | Pasta no servidor | Ramo | Domínio público |
|---|---|---|---|---|---|
| Produção | `api-prd` | 3333 | `/srv/apps/api-prd` | `prod` | `api.taesic.bknkv.com` |
| Qualidade | `api-qua` | 3334 | `/srv/apps/api-qua` | `dev` | `api.qua.taesic.bknkv.com` |

**Servidor:** `srv01.taesic.bknkv.com` (159.195.109.213). Entra-se por SSH com
o utilizador `jose`. As aplicações correm com o utilizador `deploy`, que não
tem palavra-passe nem shell de login — é de propósito.

**Todos os serviços da máquina**, para contexto:

| Serviço | Porta | Repositório | Ramo |
|---|---|---|---|
| `api-prd` | 3333 | `taesic-backend` | `prod` |
| `api-qua` | 3334 | `taesic-backend` | `dev` |
| `web-prd` | 3000 | `alaragest-webpage` | `prod` |
| `web-qua` | 3001 | `alaragest-webpage` | `dev` |
| `utils` | 3400 | `bknkv-utils-api-resources` | `main` |
| `bo-api-prd` | 3335 | `taesic-backoffice-api` | `prod` |
| `bo-api-qua` | 3336 | `taesic-backoffice-api` | `dev` |
| `bo-web-prd` | 3002 | `taesic-backoffice` | `prod` |
| `bo-web-qua` | 3003 | `taesic-backoffice` | `dev` |

Nenhuma destas portas está aberta à internet. O `ufw` só deixa passar 22, 80 e
443; tudo o resto entra pelo Caddy, que fala com os serviços em `127.0.0.1`.

---

## 2. Ver se está de pé — diagnóstico em 30 segundos

```bash
# 1. o serviço está a correr?
systemctl status api-prd api-qua --no-pager

# 2. responde na porta?
curl -s -o /dev/null -w "api-prd %{http_code}\n" http://127.0.0.1:3333/
curl -s -o /dev/null -w "api-qua %{http_code}\n" http://127.0.0.1:3334/

# 3. responde na internet?
curl -s -o /dev/null -w "publico %{http_code}\n" https://api.taesic.bknkv.com/
```

**Como ler:**

| O que vê | Significa |
|---|---|
| `200` ou `404` | O servidor responde. `404` é normal na raiz — prova que está vivo. |
| `000` | **Nada responde.** O processo morreu ou nunca arrancou. Ver secção 8. |
| `502` (só no público) | O Caddy está bem, o serviço por trás é que não. |
| `active (running)` mas `000` | Arrancou e rebentou logo. Vá directo aos logs. |

### Ver os logs

```bash
# as últimas 50 linhas
journalctl -u api-prd -n 50 --no-pager

# ao vivo, enquanto reproduz o problema (Ctrl+C para sair)
journalctl -u api-prd -f

# só desde o último arranque
journalctl -u api-prd -b --no-pager

# só erros, na última hora
journalctl -u api-prd --since "1 hour ago" -p err --no-pager
```

Acrescente sempre `--no-pager`. Sem isso o `journalctl` abre um paginador e a
sessão parece bloqueada — carregue em `q` para sair.

### Ver o processo em si

```bash
# que processos Node estão a correr, e com que memória
ps -eo pid,user,rss,etime,cmd --sort=-rss | grep -E 'node|next' | grep -v grep

# consumo por serviço
systemctl status api-prd --no-pager | grep -E 'Memory|Tasks|CPU'

# que portas estão realmente em escuta
sudo ss -ltnp | grep -E ':(3000|3001|3002|3003|3333|3334|3335|3336|3400)\b'

# memória e disco da máquina
free -h
df -h /
```

---

## 3. Publicar — o caminho normal

O fluxo é sempre o mesmo:

```
commit em dev  →  push  →  qualidade actualiza-se sozinha em ≤5 min
                        →  testa
                        →  merge dev → prod  →  publica produção À MÃO
```

### Qualidade — automático

Não precisa de fazer nada. Existe um temporizador do systemd que verifica
commits novos de 5 em 5 minutos:

```bash
# quando é a próxima verificação
systemctl list-timers 'deploy-poll@*'

# o que aconteceu na última
journalctl -u deploy-poll@api-qua -n 40 --no-pager
```

Se tiver pressa, force à mão:

```bash
sudo deploy-app api-qua
```

### Produção — sempre à mão

```bash
sudo deploy-app api-prd
```

**Produção nunca é automática, e é deliberado.** Publicar produção sozinho
significa correr migrações numa base com dados de clientes sem ninguém a olhar.
Uma migração destrutiva, um build que compila mas rebenta em execução, ou um
commit enviado para `prod` por engano — tudo isso ia ao ar sem travão.

### O que o `deploy-app` faz, por ordem

1. Confirma que a pasta é um repositório git e que tem `.env`.
2. Descarta alterações locais (`git reset --hard`, `git clean -fd`, poupando o `.env`).
3. `git fetch` do ramo, e **sai já se não houver nada novo**.
4. `git merge --ff-only`.
5. `npm ci`.
6. `node ace build`, depois `npm ci --omit=dev` dentro de `build/`.
7. Recria o atalho `build/.env → ../.env`.
8. `node ace migration:run --force`.
9. `systemctl restart` e verifica a porta com `curl`.

Se falhar **depois do passo 4**, o script avisa-o de um estado que não se vê de
outra maneira: o repositório já está no commit novo, mas o serviço continua a
correr o código antigo. O `git log` mostra a versão nova e a aplicação comporta-se
como a antiga. O aviso dá-lhe o comando exacto para voltar atrás.

---

## 4. Refazer o deploy do zero

Use quando o `deploy-app` diz *"Sem alteracoes novas"* mas quer reconstruir na
mesma — a seguir a um clone novo, depois de mexer no `.env`, ou porque a pasta
`build/` ficou num estado esquisito.

```bash
sudo deploy-app api-prd --force
sudo deploy-app api-qua --force
```

### Reconstrução total, com a base de dados apagada

**Isto apaga TODOS os dados.** Só faz sentido enquanto não houver clientes.

```bash
sudo deploy-app api-qua --force
cd /srv/apps/api-qua/build && sudo -H -u deploy node ace db:fresh:seed --force
```

O `--force` é obrigatório em produção — sem ele o comando recusa-se a correr, e
é essa recusa que impede um `db:fresh:seed` distraído de apagar a base real.

O *seeder* **não cria contas nenhumas, em ambiente nenhum** — nem em produção,
nem em qualidade, nem em desenvolvimento. Semeia os planos e o catálogo RBAC, e
mais nada. A primeira conta de plataforma cria-se no backoffice, em
`/instalacao` — ver o `OPERACAO.md` do `taesic-backoffice-api`, secção 5.

O comando confirma-se a si próprio no fim e sai com erro se a sementeira ficar
vazia:

```
Verificado: 5 papéis de plataforma, 3 planos.
```

Se em vez disso vir **"A base ficou por semear"**, pare: sem papéis de plataforma
o `/instalacao` aborta, e sem planos o onboarding abre empresas sem subscrição —
e sem plano não há limite nenhum a aplicar.

---

## 5. Voltar atrás

```bash
# 1. em que commit está agora
cd /srv/apps/api-prd && sudo -H -u deploy git log --oneline -5

# 2. voltar ao anterior (troque <sha> pelo que quer)
sudo -H -u deploy git reset --hard <sha>

# 3. reconstruir a partir dele
sudo deploy-app api-prd --force
```

⚠️ **Isto NÃO desfaz migrações.** Se a versão nova acrescentou colunas, elas
continuam lá — o que é quase sempre inofensivo. Se *apagou* alguma coisa, o
`reset` do código não a traz de volta. Aí é restauro de cópia de segurança.

---

## 6. Ficheiros de configuração — o que cada um faz

### No servidor (fora do repositório)

| Ficheiro | Para que serve |
|---|---|
| `/srv/apps/api-prd/.env` | Segredos e ligação à base de dados. **Não é versionado.** Modo `600`, dono `deploy`. É o único ficheiro do servidor que não se recupera do git. |
| `/srv/apps/api-prd/build/.env` | Um **atalho** para o anterior. O `node ace build` apaga a pasta `build/` inteira, portanto o `deploy-app` recria-o em cada publicação. Se este atalho desaparecer, a aplicação arranca e falha em cada pedido. |
| `/etc/systemd/system/api-prd.service` | Como o serviço arranca: utilizador, porta, caminho, reinício automático, e o bloco de isolamento. |
| `/etc/caddy/Caddyfile` | O reverse proxy. Traduz `api.taesic.bknkv.com` para `127.0.0.1:3333`, trata dos certificados HTTPS sozinho, e acrescenta os cabeçalhos de segurança. |
| `/etc/systemd/system/deploy-poll@.timer` | O temporizador de 5 minutos que publica qualidade automaticamente. |
| `/usr/local/bin/deploy-app` | O script de publicação. |
| `/srv/apps/.ssh/config` | Os apelidos SSH (`github-api`, `github-web`, …) que ligam cada pasta à sua chave de deploy do GitHub. **Editar sempre com `tee -a`, nunca com `tee`** — sem o `-a`, o ficheiro é truncado e todos os deploys param com `Could not resolve hostname`. |

Ver um deles:

```bash
sudo cat /etc/systemd/system/api-prd.service
sudo cat /etc/caddy/Caddyfile
sudo cat /srv/apps/.ssh/config

# o .env sem mostrar os valores
sudo cut -d= -f1 /srv/apps/api-prd/.env
```

### No repositório

| Ficheiro | Para que serve |
|---|---|
| `.env.example` | O modelo do `.env`, com um comentário por variável a explicar porquê. Quando acrescentar uma variável nova, acrescente-a aqui **e** no `.env` do servidor. |
| `start/env.ts` | A validação das variáveis, no arranque. Uma variável obrigatória que falte impede o arranque com uma mensagem clara — em vez de a aplicação subir e falhar em cada pedido. |
| `config/database.ts` | Ligação MySQL, pool de ligações, caminho das migrações. |
| `config/session.ts` | Cookies de sessão: `httpOnly`, `secure`, `sameSite`. |
| `config/shield.ts` | CSRF, e os cabeçalhos que o AdonisJS envia. |
| `config/cors.ts` | Que origens de browser podem falar directamente com a API. Em produção: nenhuma — o frontend fala com a API a partir do servidor, e pedidos servidor-a-servidor não passam por CORS. |
| `config/limiter.ts` | Limitação de pedidos por IP. Guarda o estado na base de dados. |
| `config/drive.ts` | Cloudflare R2 (imagens e ficheiros). A chave `fakes.location` **não se apaga**: sem ela os testes não conseguem simular uploads. |
| `config/mail.ts` | Envio de email. |
| `config/hash.ts` | Algoritmo de hash das palavras-passe (scrypt). |
| `config/bodyparser.ts` | Tamanho máximo do corpo de um pedido (20MB). O Caddy corta antes, aos 30MB. |
| `config/swagger.ts` | A documentação da API. Desligada em produção — publicar a especificação entrega o mapa completo do que atacar. |
| `adonisrc.ts` | Que providers, comandos e *preloads* o AdonisJS carrega. |
| `database/migrations/` | O esquema. **Este projecto é o dono.** |
| `database/seeders/` | Dados iniciais. Em produção não cria contas nenhumas. |

---

## 7. Comandos utilitários

Todos os comandos `node ace` correm **dentro de `build/`**, com o utilizador
`deploy`:

```bash
cd /srv/apps/api-prd/build
```

| Comando | O que faz |
|---|---|
| `sudo -H -u deploy node ace migration:status` | Que migrações correram e quais faltam. |
| `sudo -H -u deploy node ace migration:run --force` | Corre as que faltam. |
| `sudo -H -u deploy node ace rbac:semear` | Cria/actualiza o catálogo de papéis e permissões. |
| `sudo -H -u deploy node ace planos:semear` | Cria/actualiza os planos de subscrição. |
| `sudo -H -u deploy node ace permissao:conceder` | Dá uma permissão a um papel. |
| `sudo -H -u deploy node ace permissao:revogar` | Retira uma permissão a um papel. |
| `sudo -H -u deploy node ace limiter:reset` | Limpa os contadores do limitador — desbloqueia um IP travado. |
| `sudo -H -u deploy node ace auditoria:limpar` | Apaga registos de auditoria antigos. |
| `sudo -H -u deploy node ace caixa:fechar-diario` | Fecho diário de caixa. |
| `sudo -H -u deploy node ace estoque:check-alertas` | Verifica os alertas de estoque. |
| `sudo -H -u deploy node ace empresa:clean:expired` | Limpa registos de empresas expirados. |
| `sudo -H -u deploy node ace list` | Lista tudo o que existe. |

### Serviços

```bash
sudo systemctl restart api-prd     # reiniciar
sudo systemctl stop api-prd        # parar
sudo systemctl start api-prd       # arrancar
sudo systemctl enable api-prd      # arrancar sozinho no boot
sudo systemctl disable api-prd     # deixar de arrancar no boot
```

Depois de editar um ficheiro `.service`, **é obrigatório**:

```bash
sudo systemctl daemon-reload
```

Sem isto o systemd continua a usar a versão antiga em memória e a alteração
parece não ter efeito nenhum.

### Caddy

```bash
sudo caddy validate --config /etc/caddy/Caddyfile   # LER os avisos, não só o "Valid"
sudo systemctl reload caddy                        # aplicar sem cortar ligações
journalctl -u caddy -n 50 --no-pager
```

Faça sempre `validate` antes de `reload`. Um `Caddyfile` inválido não recarrega,
mas um `Caddyfile` *válido e errado* recarrega — e tira o site do ar.

### Base de dados

```bash
# ligar
sudo mysql

# ver o tamanho das tabelas maiores
sudo mysql -e "SELECT table_name, ROUND(data_length/1024/1024,1) AS mb
               FROM information_schema.tables
               WHERE table_schema='<base>' ORDER BY data_length DESC LIMIT 15;"

# cópia de segurança à mão, antes de algo arriscado
sudo mysqldump --single-transaction --routines --triggers <base> \
  | gzip > /root/backup-$(date +%F-%H%M).sql.gz
```

Substitua `<base>` pelo valor de `DB_DATABASE`:

```bash
sudo grep '^DB_DATABASE=' /srv/apps/api-prd/.env
```

### Estado geral, num só comando

```bash
for a in api-prd api-qua web-prd web-qua utils bo-api-prd bo-api-qua bo-web-prd bo-web-qua; do
  printf '%-12s %-10s ' "$a" "$(systemctl is-active $a 2>/dev/null)"
  if [ -d /srv/apps/$a ]; then
    printf '%s' "$(sudo -H -u deploy git -C /srv/apps/$a rev-parse --short HEAD 2>/dev/null)"
  fi
  echo
done
```

---

## 8. Quando corre mal — sintoma, causa, comando

### `curl` devolve `000` e o serviço aparece como `active`

Arrancou e morreu, ou está preso. Veja o que ele disse:

```bash
journalctl -u api-prd -n 80 --no-pager
```

As causas mais comuns, por ordem de frequência:

| No log | Causa | Solução |
|---|---|---|
| `EnvValidationException` | Falta uma variável no `.env`, ou o atalho `build/.env` desapareceu | Ver abaixo |
| `EADDRINUSE` | Outra coisa já está na porta | `sudo ss -ltnp \| grep 3333` |
| `ER_ACCESS_DENIED_ERROR` | Credenciais da base erradas | Confirmar `DB_USER`/`DB_PASSWORD` |
| `Unknown column` | Falta correr uma migração | `node ace migration:run --force` |

### O serviço não arranca de todo: `Unit ... not found`

O ficheiro `.service` refere uma dependência que não existe nesta máquina — o
caso clássico é `Requires=mariadb.service` numa máquina com MySQL.

```bash
# qual é a unidade real da base de dados
systemctl list-unit-files --type=service | grep -iE 'mysql|mariadb'

# corrigir e recarregar
sudo sed -i 's/mariadb\.service/mysql.service/g' /etc/systemd/system/api-prd.service
sudo systemctl daemon-reload
sudo systemctl restart api-prd
```

### O atalho `build/.env` desapareceu

```bash
# ver se está lá
ls -l /srv/apps/api-prd/build/.env

# recriar
sudo -H -u deploy ln -sfn ../.env /srv/apps/api-prd/build/.env
sudo systemctl restart api-prd
```

O `deploy-app` recria-o em cada publicação. Se desapareceu fora de uma
publicação, alguém correu `node ace build` à mão — provavelmente com `sudo`, o
que também estraga as permissões (ver abaixo).

### Permissões estragadas depois de correr algo com `sudo`

Correr `sudo npm ci` ou `sudo node ace build` deixa ficheiros com dono `root`
dentro de `/srv/apps`. O utilizador `deploy` deixa de conseguir escrever, e o
próximo deploy falha de maneiras estranhas.

```bash
sudo chown -R deploy:deploy /srv/apps/api-prd
sudo deploy-app api-prd --force
```

**Regra:** dentro de `/srv/apps`, nunca use `sudo <comando>` directamente. Use
sempre `sudo -H -u deploy <comando>`.

### `Could not resolve hostname github-api`

O `/srv/apps/.ssh/config` perdeu blocos.

```bash
sudo cat /srv/apps/.ssh/config          # que apelidos existem
sudo ls -l /srv/apps/.ssh/              # que chaves existem
sudo -H -u deploy ssh -T git@github-api # o GitHub aceita?
```

A resposta certa ao `ssh -T` é `Hi jmyork/taesic-backend! You've successfully
authenticated…` e código de saída 1 — o GitHub não dá shell, e isso é normal.

### Uma migração falha a meio

```bash
cd /srv/apps/api-prd/build
sudo -H -u deploy node ace migration:status | grep -v completed
```

Uma linha `corrupt` quer dizer que a base tem registo de uma migração cujo
ficheiro já não existe — normalmente por renumeração ou consolidação. Não
impede o funcionamento, mas suja o `status`. Não a apague sem perceber porque
lá está.

### Recuperar o `.env` que foi apagado

Não há cópia no git, de propósito. As fontes possíveis, por ordem:

1. A cópia de segurança do `restic` (inclui `/srv/apps`).
2. O `.env` do outro ambiente (`api-qua` ↔ `api-prd`) como ponto de partida —
   **mudando a base de dados, o `APP_KEY` e a porta**.
3. `.env.example` deste repositório, preenchido à mão.

Depois de recriar, `APP_KEY` novo invalida todas as sessões: toda a gente tem
de voltar a entrar.

---

## 9. Cópias de segurança

```bash
# ver o estado
sudo systemctl list-timers | grep -i backup
sudo restic snapshots     # se o restic estiver configurado

# cópia manual da base, agora
sudo mysqldump --single-transaction --routines --triggers <base> \
  | gzip > /root/backup-$(date +%F-%H%M).sql.gz
```

Faça uma cópia manual **antes** de qualquer publicação de produção que traga
migrações. Custa segundos e é a diferença entre um susto e um desastre.
