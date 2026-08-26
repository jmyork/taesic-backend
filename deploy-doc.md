# Deploy — manual de uso

Servidor `srv01.taesic.bknkv.com` · cinco serviços · script `deploy-app`

---

# 1. Uso básico

```bash
sudo deploy-app <app> [--force]
```

| App | Ramo | Porta | Base de dados |
|---|---|---|---|
| `api-prd` | `prod` | 3333 | `taesic_prd_db` |
| `api-qua` | `dev` | 3334 | `taesic_qua_db` |
| `utils` | `main` | 3400 | `utils_db` |
| `web-prd` | `prod` | 3000 | — |
| `web-qua` | `dev` | 3001 | — |

## Exemplos

```bash
sudo deploy-app api-prd            # publica se houver commits novos
sudo deploy-app api-prd --force    # reconstroi mesmo sem commits novos
sudo deploy-app web-qua            # publica o frontend de qualidade
```

⚠️ **Não execute de dentro de `build/`.** O script apaga e recria essa pasta; a sua shell fica a apontar para um diretório inexistente e o próximo comando falha com `process.cwd failed`. Corra sempre de `/srv/apps` ou da sua pasta pessoal.

## Quando usar `--force`

- Alterou o `.env` (o código não mudou, mas o serviço precisa de reiniciar)
- Um deploy anterior falhou a meio
- Quer reconstruir para descartar um build corrompido

---

# 2. O que o script faz

1. Valida que a pasta é um repositório git e que o `.env` existe
2. Mostra e **descarta** alterações locais (`git reset --hard` + `git clean`, preservando o `.env`)
3. Busca o ramo remoto e compara commits — **sai se não houver novidades**
4. Lista os commits que vão entrar
5. `git merge --ff-only` (nunca cria commits de merge)
6. `npm ci`
7. Build: deteta AdonisJS (`ace.js` presente) ou Next.js
8. Nos backends: `npm ci --omit=dev` dentro de `build/`, recria o atalho do `.env`, corre as migrações
9. Reinicia o serviço systemd
10. Testa a porta local e, se não responder, mostra o log e devolve erro

## Aviso que pode ignorar

```
npm warn allow-scripts   @swc/core (postinstall)
npm warn allow-scripts   esbuild (postinstall)
```

O npm 11 bloqueia scripts de instalação por omissão. Estes dois pacotes distribuem os binários nativos como dependências opcionais por plataforma, que o npm instala sem executar scripts. **Se o build completa, está tudo bem.**

*(Se algum dia aprovar os scripts, note que a aprovação é gravada no `package.json` — e o `git reset` do deploy vai descartá-la na publicação seguinte.)*

---

# 3. Deploy automático a partir do GitHub

## Opção recomendada: temporizador que verifica commits

O script já sai em dois segundos quando não há nada novo, o que o torna ideal para verificação periódica. **Nenhuma credencial sai do servidor** e não há endpoint exposto na internet.

### Criar o serviço

`/etc/systemd/system/deploy-poll@.service`

```ini
[Unit]
Description=Auto-deploy de %i quando ha commits novos
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/deploy-app %i
```

### Criar o temporizador

`/etc/systemd/system/deploy-poll@.timer`

```ini
[Unit]
Description=Verifica commits novos de %i

[Timer]
OnBootSec=5min
OnUnitActiveSec=5min
RandomizedDelaySec=60
Unit=deploy-poll@%i.service

[Install]
WantedBy=timers.target
```

O `@` torna estas unidades **modelos** — um par de ficheiros serve os cinco serviços.

### Ativar

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now deploy-poll@api-qua.timer
sudo systemctl enable --now deploy-poll@web-qua.timer
```

### Verificar

```bash
systemctl list-timers 'deploy-poll@*'
journalctl -u deploy-poll@api-qua -n 40 --no-pager
```

### Parar

```bash
sudo systemctl disable --now deploy-poll@api-qua.timer
```

---

## ⚠️ Ative apenas em qualidade

Notei que ativei acima **só os serviços de qualidade**, e é deliberado.

Auto-publicar produção significa que **cada push corre migrações em produção sem ninguém a olhar**. Uma migração destrutiva, um build que compila mas quebra em execução, um commit enviado por engano para `prod` — tudo isso vai ao ar sozinho.

A postura habitual, e a que recomendo:

| Ambiente | Publicação |
|---|---|
| **Qualidade** | Automática. É para isso que existe |
| **Produção** | Manual, `sudo deploy-app api-prd`, com alguém a ver o resultado |

O fluxo fica: envia para `dev` → qualidade atualiza-se em ≤5 min → testa → faz merge `dev → prod` → publica produção à mão.

Se mais tarde quiser produção automática também, é uma linha:

```bash
sudo systemctl enable --now deploy-poll@api-prd.timer
```

---

## Opção alternativa: GitHub Actions (imediato)

Publica em segundos em vez de esperar pelo temporizador. O custo é guardar uma chave SSH do servidor nos segredos do GitHub.

`.github/workflows/deploy.yml` no repositório:

```yaml
name: Deploy
on:
  push:
    branches: [dev]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Publicar em qualidade
        uses: appleboy/ssh-action@v1
        with:
          host: srv01.taesic.bknkv.com
          username: deployer
          key: ${{ secrets.SSH_KEY }}
          script: sudo /usr/local/bin/deploy-app api-qua
```

Requer no servidor:

1. Um utilizador dedicado (`deployer`), separado do `jose`
2. A chave pública desse utilizador em `~/.ssh/authorized_keys`
3. Uma regra no `sudoers` que permita **apenas** este comando:

```
deployer ALL=(root) NOPASSWD: /usr/local/bin/deploy-app api-qua
```

```bash
sudo visudo -f /etc/sudoers.d/deployer
```

⚠️ A regra tem de ser **exatamente este comando**. Um `NOPASSWD: ALL` daria ao GitHub acesso root total ao servidor.

## Comparação

| | Temporizador | GitHub Actions |
|---|---|---|
| Latência | até 5 min | segundos |
| Credenciais fora do servidor | nenhuma | chave SSH no GitHub |
| Superfície de ataque | nenhuma nova | acesso SSH concedido a terceiros |
| Complexidade | 2 ficheiros | workflow + utilizador + sudoers |
| Funciona com repos privados | sim | sim |

**Comece pelo temporizador.** Cinco minutos de latência num ambiente de qualidade não incomodam ninguém, e evita conceder acesso ao servidor a um sistema externo.

---

# 4. Diagnóstico

## O deploy falhou

O script para no primeiro erro e **não reinicia o serviço** — a versão anterior continua a servir.

```bash
journalctl -u api-prd -n 50 --no-pager
```

## Voltar a uma versão anterior

O script imprime o comando exato em caso de falha:

```bash
cd /srv/apps/api-prd
sudo -H -u deploy git reset --hard <commit-antigo>
sudo deploy-app api-prd --force
```

Ver commits disponíveis:

```bash
sudo -H -u deploy git -C /srv/apps/api-prd log --oneline -10
```

## O serviço não responde na porta

```bash
sudo systemctl status api-prd --no-pager
sudo ss -tlnp | grep 333
```

Causas mais comuns:

| Sintoma | Causa provável |
|---|---|
| `Cannot find module` | Falta `npm ci --omit=dev` dentro de `build/` |
| Erro de variável de ambiente | O atalho `build/.env` não foi recriado |
| `ECONNREFUSED` na base de dados | Password do `.env` fora de sincronia com a MariaDB |
| Arranca e morre em ciclo | Ver `journalctl` — quase sempre `start/env.ts` a validar algo em falta |

## `Field 'X' doesn't have a default value` — a tabela ficou só de leitura

Sintoma no `journalctl`: uma operação de negócio falha, e o erro é do motor e não da
aplicação.

```
ER_NO_DEFAULT_FOR_FIELD (1364)
Field 'chave_escopo' doesn't have a default value
insert into `papel` (...) values (...)
```

**Causa**: uma migração que torna uma coluna `NOT NULL` e cria a seguir o objecto que a
preenche (gatilho, valor por omissão). O MariaDB/MySQL **não faz DDL transaccional**: se o
segundo passo falhar, o primeiro fica feito. A coluna fica obrigatória, sem valor por
omissão e sem ninguém a preenchê-la — e **todas** as escritas naquela tabela passam a
falhar, não só a operação onde o erro apareceu.

Aconteceu em `api-qua` com `papel.chave_escopo`: criar empresa deixou de funcionar porque
o clone dos papéis padrão não passava. Ver a secção 7.20 do `CLAUDE.md`.

**Isto prende o deploy inteiro.** A migração fica por registar, e `migration:run` volta a
bater nela em cada publicação — nenhuma das migrações seguintes corre, incluindo a que
repara o problema. Em `api-qua` foi o que aconteceu: a 796 ficou pendente e a 798, que é a
reparação, era inalcançável.

### 1. Ver em que estado está

As bases são `taesic_prd_db` e `taesic_qua_db`.

```bash
sudo mysql taesic_qua_db -e "
  SELECT COLUMN_NAME, IS_NULLABLE, COLUMN_DEFAULT
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'papel'
     AND COLUMN_NAME = 'chave_escopo';
  SELECT TRIGGER_NAME FROM information_schema.TRIGGERS
   WHERE TRIGGER_SCHEMA = DATABASE();
  SELECT COUNT(*) AS papeis_dessincronizados FROM papel
   WHERE NOT (chave_escopo <=> COALESCE(empresa_id, escopo));
"
```

Estado saudável: `IS_NULLABLE = YES` e zero dessincronizados. Os gatilhos
(`papel_chave_escopo_bi`/`_bu`) são desejáveis mas **não** são necessários — ver o ponto 3.

### 2. Publicar e correr as migrações

A reparação vem no código, portanto o primeiro passo é publicá-lo:

```bash
sudo deploy-app api-qua --force
```

O `deploy-app` já corre as migrações (passo 8 da secção 2). Para as correr à mão:

```bash
cd /srv/apps/api-qua && sudo -H -u deploy node ace migration:status
cd /srv/apps/api-qua && sudo -H -u deploy node ace migration:run --force
```

**O `--force` é obrigatório fora de desenvolvimento.** Sem ele o Adonis pergunta *"You are
in production environment. Want to continue running migrations? (y/N)"* e, num pipeline sem
terminal interactivo, a resposta é sempre não — a migração não corre e o comando parece ter
passado.

As migrações envolvidas deixaram de poder prender o deploy: a coluna fica anulável **antes**
de qualquer passo que possa falhar, e a criação dos gatilhos avisa em vez de rebentar.
Verificado numa base descartável, a partir do estado exacto de `api-qua` e com um utilizador
sem privilégios para criar gatilhos: as três migrações completam e a tabela volta a aceitar
escritas.

### 3. Se os gatilhos não tiverem sido criados

A migração avisa no log e continua:

```
[migração] não foi possível criar o gatilho papel_chave_escopo_bi: You do not have the
SUPER privilege and binary logging is enabled (you *might* want to use the less safe
log_bin_trust_function_creators variable)
```

São duas causas possíveis, e o texto do erro diz qual é:

| erro | o que falta |
|---|---|
| `You do not have the SUPER privilege and binary logging is enabled` (1419) | `SUPER`, ou `log_bin_trust_function_creators = 1` |
| `command denied to user ... TRIGGER` (1142) | o privilégio `TRIGGER`, que é concedido à parte dos outros |

```bash
sudo mysql -e "SHOW GRANTS FOR 'taesic_qua_user'@'localhost';"

# se for o privilégio TRIGGER que falta:
sudo mysql -e "GRANT TRIGGER ON taesic_qua_db.* TO 'taesic_qua_user'@'localhost'; FLUSH PRIVILEGES;"

# se for o 1419 (binlog + sem SUPER) — em /etc/mysql/mariadb.conf.d/50-server.cnf, em [mysqld]:
#   log_bin_trust_function_creators = 1
# e a seguir: sudo systemctl restart mariadb

cd /srv/apps/api-qua && sudo -H -u deploy node ace migration:run --force   # idempotente
```

**Sem os gatilhos a aplicação funciona à mesma.** Os dois backends preenchem
`papel.chave_escopo` por si (`@beforeSave` no model, mais o valor à mão no `multiInsert` de
`papeis_da_empresa.ts`). O que fica descoberto é o SQL à mão e os restauros — e o sinal
disso é a terceira consulta do ponto 1 deixar de dar zero.

## Verificar o atalho do `.env`

```bash
ls -la /srv/apps/api-prd/build/.env
```

Deve mostrar `.env -> ../.env`. Se faltar, o script recria-o no próximo deploy.

---

# 5. Comandos de referência

```bash
# Estado de todos os serviços
sudo systemctl status api-prd api-qua utils web-prd web-qua --no-pager

# Seguir logs em tempo real
journalctl -u api-prd -f

# Portas em escuta
sudo ss -tlnp

# Consumo de memória por serviço
systemd-cgtop

# Temporizadores de auto-deploy
systemctl list-timers 'deploy-poll@*'

# Commit atual de cada app
for d in api-prd api-qua web-prd web-qua utils; do
  printf "%-10s" "$d"
  sudo -H -u deploy git -C /srv/apps/$d log --oneline -1
done
```

---

# 6. Fluxo de trabalho recomendado

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
   sudo deploy-app api-prd     ← manual, com supervisão
            │
            ▼
   confirma em taesic.bknkv.com
```
