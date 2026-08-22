# Servidor Taesic — referência de comandos

`srv01.taesic.bknkv.com` · `159.195.109.213` · Ubuntu 24.04 LTS · Viena

---

# 0. A regra que evita metade dos erros

| Ação | Como |
|---|---|
| Navegar, ler, ver logs, `systemctl` | como **`jose`** |
| `git`, `npm`, `node ace`, escrever ficheiros | **`sudo -H -u deploy ...`** |

O `-H` define `HOME=/srv/apps`, onde o `deploy` guarda a configuração do SSH e a cache do npm. **Sem ele:** `Permission denied (publickey)` no git, ou erros de cache no npm.

O `sudo` sozinho cria ficheiros do **root**. Em `/srv/apps` quer sempre `sudo -u deploy`.

## Atalhos recomendados

```bash
echo "alias aceprd='sudo -H -u deploy node /srv/apps/api-prd/ace'" >> ~/.bashrc
echo "alias acequa='sudo -H -u deploy node /srv/apps/api-qua/ace'" >> ~/.bashrc
echo "alias aceutl='sudo -H -u deploy node /srv/apps/utils/ace'" >> ~/.bashrc
source ~/.bashrc
```

Nomes distintos por ambiente reduzem a chance de correr em produção o que era para qualidade.

---

# 1. Mapa do sistema

| Serviço | Domínio | Porta | Pasta | Base de dados |
|---|---|---|---|---|
| `web-prd` | taesic.bknkv.com | 3000 | `/srv/apps/web-prd` | — |
| `api-prd` | api.taesic.bknkv.com | 3333 | `/srv/apps/api-prd` | `taesic_prd_db` |
| `web-qua` | qua.taesic.bknkv.com | 3001 | `/srv/apps/web-qua` | — |
| `api-qua` | api.qua.taesic.bknkv.com | 3334 | `/srv/apps/api-qua` | `taesic_qua_db` |
| `utils` | utils.taesic.bknkv.com | 3400 | `/srv/apps/utils` | `utils_db` |

Ramos git: `prod` para produção, `dev` para qualidade, `main` no `utils`.

---

# 2. Serviços

```bash
# Estado resumido dos cinco
sudo systemctl is-active api-prd api-qua utils web-prd web-qua

# Estado detalhado, com memória
sudo systemctl status api-prd api-qua utils web-prd web-qua --no-pager | grep -E "●|Active|Memory"

# Um serviço
sudo systemctl status api-prd --no-pager

# Reiniciar (aplica alterações ao .env dos backends)
sudo systemctl restart api-prd

# Parar / arrancar
sudo systemctl stop api-qua
sudo systemctl start api-qua

# Depois de esgotar as tentativas de reinício
sudo systemctl reset-failed api-qua && sudo systemctl start api-qua

# Portas em escuta — todas devem estar em 127.0.0.1
sudo ss -tlnp | grep -E "3000|3001|3333|3334|3400"
```

> `reload` não funciona nestas unidades — não definem `ExecReload`. Use sempre `restart`.

---

# 3. Logs

```bash
# Últimas 50 linhas de um serviço
journalctl -u api-qua -n 50 --no-pager

# Em tempo real
journalctl -u api-qua -f

# Todos os serviços juntos
journalctl -u api-prd -u api-qua -u utils -u web-prd -u web-qua -f

# Caddy — pedidos externos e certificados
journalctl -u caddy -f

# Só erros, em todo o sistema
journalctl -p err -n 50 --no-pager

# Por janela de tempo
journalctl -u api-qua --since "10 min ago" --no-pager
journalctl -u api-qua --since "2026-08-22 02:00" --until "02:30" --no-pager

# Filtrar por texto
journalctl -u api-prd -n 200 -o cat | grep -iE "error|nif|r2"
```

## Logs do Adonis legíveis

Os backends escrevem JSON numa linha. O projeto traz o `pino-pretty`:

```bash
journalctl -u api-qua -n 50 -o cat | /srv/apps/api-qua/node_modules/.bin/pino-pretty
```

Em tempo real:

```bash
journalctl -u api-qua -f -o cat | /srv/apps/api-qua/node_modules/.bin/pino-pretty
```

## Espaço do journal

```bash
journalctl --disk-usage
sudo journalctl --vacuum-time=14d
```

> Se aparecer *"not seeing messages from other users"*, a adição aos grupos `adm` e `systemd-journal` só entra em efeito numa **nova sessão SSH**. Até lá use `sudo journalctl`.

---

# 4. Deploy

```bash
# Sempre a partir de /srv/apps, nunca de dentro de build/
cd /srv/apps

sudo deploy-app api-prd              # publica se houver commits novos
sudo deploy-app api-prd --force      # reconstroi mesmo sem commits novos
sudo deploy-app api-qua
sudo deploy-app web-prd
sudo deploy-app web-qua
sudo deploy-app utils
```

## Quando usar `--force`

- Alterou o `.env` de um **frontend** (as `NEXT_PUBLIC_*` são gravadas no build)
- Um deploy anterior falhou a meio
- Quer descartar um build possivelmente corrompido

## Depois de editar um `.env`

| Serviço | Ação |
|---|---|
| `api-prd`, `api-qua`, `utils` | `sudo systemctl restart <serviço>` |
| `web-prd`, `web-qua` | `sudo deploy-app <serviço> --force` |

**Reiniciar um frontend não aplica alterações ao `.env`** — as variáveis `NEXT_PUBLIC_*` ficam gravadas nos ficheiros compilados. Tem de reconstruir.

## Auto-deploy (temporizadores)

```bash
systemctl list-timers 'deploy-poll@*'
journalctl -u deploy-poll@api-qua -n 40 --no-pager

sudo systemctl enable --now deploy-poll@api-qua.timer
sudo systemctl disable --now deploy-poll@api-qua.timer
```

> Ativos apenas em **qualidade**. Produção publica-se à mão, com supervisão.

---

# 5. Ficheiros `.env`

```bash
# Ver conteúdo sem comentários nem linhas vazias
sudo grep -vE "^#|^$" /srv/apps/api-prd/.env

# Ver só as variáveis da base de dados
sudo grep -E "^DB_" /srv/apps/api-prd/.env

# Ver o tamanho da APP_KEY (tem de ser ≥ 16)
sudo awk -F= '/^APP_KEY=/{print "tamanho:", length($2)}' /srv/apps/api-prd/.env
```

## Editar com segurança

```bash
# 1. Cópia de segurança — como deploy, para poder restaurar
sudo -u deploy cp /srv/apps/api-qua/.env /srv/apps/api-qua/.env.bak

# 2. Editar
sudo -u deploy nano /srv/apps/api-qua/.env

# 3. Comparar o que mudou
sudo diff /srv/apps/api-qua/.env.bak /srv/apps/api-qua/.env

# 4. Aplicar
sudo systemctl restart api-qua

# 5. Se falhar, restaurar
sudo -u deploy cp /srv/apps/api-qua/.env.bak /srv/apps/api-qua/.env && sudo systemctl restart api-qua
```

## Substituir um valor sem editor

```bash
sudo -u deploy sed -i "s|^LOG_LEVEL=.*|LOG_LEVEL=debug|" /srv/apps/api-qua/.env
```

> Aspas **duplas** quando quer expandir uma variável da shell; **simples** para texto literal.

## ⚠️ Duas variáveis que nunca vêm do ficheiro de desenvolvimento

| Variável | Porquê |
|---|---|
| `APP_KEY` | Única por ambiente. Cifra cookies — igual à de produção, um cookie de qualidade passa a valer em produção |
| `DB_PASSWORD` | Tem de corresponder ao que está na MariaDB deste servidor |

## Verificar o atalho do `.env` no build

```bash
ls -la /srv/apps/api-prd/build/.env
```

Deve mostrar `.env -> ../.env`. O `node ace build` apaga a pasta `build/`, por isso o atalho é recriado a cada deploy. **Se faltar, o serviço arranca sem configuração nenhuma.**

```bash
cd /srv/apps/api-prd/build && sudo -H -u deploy ln -sfn ../.env .env
```

---

# 6. Base de dados

```bash
# Entrar como administrador (sem password — autenticação por socket)
sudo mariadb

# Listar bases de dados
sudo mariadb -e "SHOW DATABASES;"

# Ver utilizadores do projeto
sudo mariadb -e "SELECT user,host FROM mysql.user WHERE user LIKE 'taesic%' OR user LIKE 'utils%';"

# Ver permissões de um utilizador
sudo mariadb -e "SHOW GRANTS FOR 'taesic_prd_user'@'localhost';"

# Configuração de memória
sudo mariadb -e "SHOW VARIABLES WHERE Variable_name IN ('innodb_buffer_pool_size','bind_address','max_connections');"

# Tamanho das bases de dados
sudo mariadb -e "SELECT table_schema AS bd, ROUND(SUM(data_length+index_length)/1024/1024,1) AS mb FROM information_schema.tables GROUP BY table_schema;"
```

## Trocar a password de um utilizador

Gera, aplica e escreve no `.env` sem a password passar pelas suas mãos:

```bash
P=$(openssl rand -hex 16)
sudo mariadb -e "ALTER USER 'taesic_qua_user'@'localhost' IDENTIFIED BY '$P';"
sudo -u deploy sed -i "s|^DB_PASSWORD=.*|DB_PASSWORD=$P|" /srv/apps/api-qua/.env
MYSQL_PWD="$P" mariadb -u taesic_qua_user taesic_qua_db -e "SELECT 'OK' AS r;"
sudo systemctl restart api-qua
```

## Testar credenciais

```bash
MYSQL_PWD="<password>" mariadb -u taesic_prd_user taesic_prd_db -e "SELECT 'OK' AS r;"
```

> **Nunca use `-p <password>` com espaço.** O `mariadb` interpreta o valor como nome de base de dados e despeja o manual de ajuda. Use `-p"<password>"` sem espaço, ou `MYSQL_PWD=`.

## Backup manual

```bash
sudo mariadb-dump --single-transaction taesic_prd_db | gzip > ~/taesic_prd_$(date +%F).sql.gz
```

---

# 7. Comandos `ace` (AdonisJS)

Sempre a partir da pasta do projeto, como `deploy`:

```bash
cd /srv/apps/api-qua

# Listar tudo o que existe
sudo -H -u deploy node ace list

# Ajuda de um comando (mostra os sinalizadores aceites)
sudo -H -u deploy node ace db:fresh:seed --help

# Estado das migrações
sudo -H -u deploy node ace migration:status

# Correr migrações pendentes
sudo -H -u deploy node ace migration:run --force

# Reverter a última tanda
sudo -H -u deploy node ace migration:rollback --force

# Seeders
sudo -H -u deploy node ace db:seed

# Gerar nova APP_KEY (escreve no .env)
sudo -H -u deploy node ace generate:key
```

## ⚠️ Comandos destrutivos

```bash
node ace migration:fresh      # APAGA todas as tabelas e recria
node ace db:fresh:seed        # idem, mais os seeders
node ace db:wipe              # APAGA todas as tabelas
```

**Antes de qualquer destes, confirme a pasta:**

```bash
pwd
```

Tem de dizer `/srv/apps/api-qua`. **Nunca `api-prd`.**

> O `--force` é exigido pelos comandos padrão quando `NODE_ENV=production`. Comandos personalizados podem não o aceitar — verifique com `--help`.

---

# 8. Git

```bash
# Ramo atual de cada app
for d in api-prd api-qua web-prd web-qua utils; do
  printf "%-10s" "$d"
  sudo -H -u deploy git -C /srv/apps/$d branch --show-current
done

# Commit atual de cada app
for d in api-prd api-qua web-prd web-qua utils; do
  printf "%-10s" "$d"
  sudo -H -u deploy git -C /srv/apps/$d log --oneline -1
done

# Ver ramos remotos sem clonar
sudo -H -u deploy git ls-remote --heads git@github-api:jmyork/taesic-backend.git

# Testar as deploy keys
sudo -H -u deploy ssh -T github-api
sudo -H -u deploy ssh -T github-web
sudo -H -u deploy ssh -T github-utils

# Voltar a um commit anterior
cd /srv/apps/api-prd
sudo -H -u deploy git reset --hard <commit>
cd /srv/apps && sudo deploy-app api-prd --force
```

Apelidos SSH: `github-api` → taesic-backend · `github-web` → alaragest-webpage · `github-utils` → bknkv-utils-api-resources

---

# 9. Caddy e domínios

```bash
# Validar antes de aplicar
sudo caddy validate --config /etc/caddy/Caddyfile

# Formatar o ficheiro
sudo caddy fmt --overwrite /etc/caddy/Caddyfile

# Aplicar (não interrompe ligações)
sudo systemctl reload caddy

# Acompanhar certificados e pedidos
journalctl -u caddy -f

# Gerar hash para autenticação básica
caddy hash-password
```

## Testar os cinco domínios

```bash
for h in taesic api.taesic qua.taesic api.qua.taesic utils.taesic; do
  printf "%-24s" "$h"
  curl -s -o /dev/null -w "%{http_code}\n" https://$h.bknkv.com
done
```

Esperado: `200` nos dois frontends, `404` nas três APIs (não há rota em `/`).

## Verificar DNS

```bash
for h in taesic api.taesic qua.taesic api.qua.taesic utils.taesic; do
  printf "%-20s" "$h"
  dig +short $h.bknkv.com
done
```

Todos devem devolver `159.195.109.213`.

---

# 10. Sistema e recursos

```bash
free -h                    # memória
df -h /                    # disco
systemd-cgtop              # consumo por serviço, em tempo real
uptime                     # carga
sudo ufw status verbose    # firewall
sudo fail2ban-client status sshd
apt list --upgradable      # pacotes pendentes
sudo apt update && sudo apt upgrade -y
```

---

# 11. Erros comuns e o que significam

| Mensagem | Causa | Solução |
|---|---|---|
| `Permission denied (publickey)` no git | Falta o `-H` no `sudo -u deploy` | Acrescentar `-H` |
| `EACCES ... open '.env'` | Comando correu como `jose`; o `.env` é 600 do `deploy` | `sudo -H -u deploy ...` |
| `dubious ownership in repository` | `git` a correr como `jose` numa pasta do `deploy` | `sudo -H -u deploy git ...` |
| `The value of your key should be at least 16 characters` | `APP_KEY` vazia ou curta | `node ace generate:key` |
| `Access denied for user '...'@'localhost'` | `DB_PASSWORD` do `.env` não bate com a MariaDB | Sincronizar (secção 6) |
| `Cannot find module` | Falta `npm ci --omit=dev` dentro de `build/` | `sudo deploy-app <app> --force` |
| `process.cwd failed` | Estava dentro de `build/` quando o deploy a apagou | `cd` outra vez |
| `Unknown flag "--force"` | Comando personalizado que não aceita esse sinalizador | Ver `--help` |
| `Repository not found` (GitHub) | Nome errado **ou** sem permissão | Confirmar nome e deploy key |
| Serviço reinicia em ciclo | Erro de arranque; `Restart=always` | Ver `journalctl`; `systemctl stop` para parar o ciclo |
| Certificado do Caddy falha | Proxy do Cloudflare ativo, ou DNS não propagado | Pôr em **DNS only** |
| `not seeing messages from other users` | Grupos `adm`/`systemd-journal` ainda não ativos | Nova sessão SSH |

---

# 12. Fluxo de trabalho

```
   desenvolve na sua máquina
            │
            ▼
   push para  dev
            │
            ▼
   temporizador publica em qualidade (≤5 min)
            │
            ▼
   testa em qua.taesic.bknkv.com
            │
            ▼
   merge  dev → prod   (no GitHub)
            │
            ▼
   cd /srv/apps && sudo deploy-app api-prd     ← manual
            │
            ▼
   confirma em taesic.bknkv.com
```

---

# 13. Ainda em falta

- [ ] **Backup externo** — `restic` ou `borgbackup` para fora do servidor, mais dump diário da MariaDB, **com restauro testado**. É o único item verdaderamente crítico que ainda não existe
- [ ] Reverse DNS (PTR) no SCP, a apontar para `srv01.taesic.bknkv.com`
- [ ] Snapshot no SCP, depois de tudo confirmado
- [ ] CORS no `config/cors.ts` de cada backend, autorizando só o seu frontend
- [ ] `config/session.ts` com `domain: ''`, para não partilhar cookies entre produção e qualidade
- [ ] Rodar as credenciais R2 e Resend que ficaram expostas
- [ ] Proteger os domínios de qualidade (autenticação básica no Caddy ou restrição por IP)
