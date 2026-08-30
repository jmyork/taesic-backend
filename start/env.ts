/*
|--------------------------------------------------------------------------
| Environment variables service
|--------------------------------------------------------------------------
|
| The `Env.create` method creates an instance of the Env service. The
| service validates the environment variables and also cast values
| to JavaScript data types.
|
*/

import { Env } from '@adonisjs/core/env'

export default await Env.create(new URL('../', import.meta.url), {
  NODE_ENV: Env.schema.enum(['development', 'production', 'test'] as const),
  PORT: Env.schema.number(),
  APP_KEY: Env.schema.string(),
  HOST: Env.schema.string({ format: 'host' }),
  LOG_LEVEL: Env.schema.string(),

  /*
  |----------------------------------------------------------
  | Variables for configuring session package
  |----------------------------------------------------------
  */
  SESSION_DRIVER: Env.schema.enum(['cookie', 'memory'] as const),

  /*
  | Domínio do cookie de sessão. Opcional: só é definido quando o frontend e a
  | API estão em subdomínios diferentes (produção). Deve começar por ponto —
  | `.taesic.bknkv.com` — para cobrir app. e api. Ausente em desenvolvimento.
  */
  SESSION_COOKIE_DOMAIN: Env.schema.string.optional(),

  /*
  |----------------------------------------------------------
  | Variables for configuring database connection
  |----------------------------------------------------------
  */
  DB_HOST: Env.schema.string({ format: 'host' }),
  DB_PORT: Env.schema.number(),
  DB_USER: Env.schema.string(),
  DB_PASSWORD: Env.schema.string.optional(),
  DB_DATABASE: Env.schema.string(),

  /*
  |----------------------------------------------------------
  | Variables for configuring the drive package
  |----------------------------------------------------------
  */
  DRIVE_DISK: Env.schema.enum(['r2'] as const),
  R2_KEY: Env.schema.string(),
  R2_SECRET: Env.schema.string(),
  R2_BUCKET: Env.schema.string(),
  R2_ENDPOINT: Env.schema.string(),

  /*
  | Base pública para servir os objectos do bucket. OPCIONAL de propósito: era
  | obrigatória com o nome R2_DEV_SHOW_ENDPOINT e impedia o arranque em
  | produção, onde não há subdomínio r2.dev. Ausente, os URLs caem no endpoint
  | S3 do bucket (ver app/helpers/r2_url.ts).
  */
  R2_PUBLIC_URL: Env.schema.string.optional(),

  /*
  |----------------------------------------------------------
  | Variables for configuring the limiter package
  |----------------------------------------------------------
  */
  LIMITER_STORE: Env.schema.enum(['database', 'memory'] as const),

  /*
  |----------------------------------------------------------
  | Variáveis do envio de email (Resend)
  |----------------------------------------------------------
  | Substituíram o SMTP/Mailpit. A chave é obrigatória: sem ela nenhum email de
  | activação ou de recuperação de palavra-passe sairia, e é melhor a aplicação
  | recusar arrancar do que falhar em silêncio a cada envio.
  */
  RESEND_API_KEY: Env.schema.string(),
  RESEND_BASE_URL: Env.schema.string.optional(),

  /*
  | Remetente dos emails. Opcional, e normalmente ausente: o endereço verificado
  | está em `app/mails/remetente.ts`, uma definição só para as oito Mailables.
  |
  | Só se sobrepõe se for mesmo um ENDEREÇO. Um valor sem "@" é ignorado — este
  | ficheiro dizia "usa-se noreply@taesic.com", duas Mailables acreditaram, e com
  | `MAIL_FROM=BKNKV` no .env o que seguia para a Resend era a palavra `BKNKV`.
  */
  MAIL_FROM: Env.schema.string.optional(),

  /*
  | Destinatário dos alertas operacionais (estoque crítico, validade próxima,
  | cancelamento de valor alto). Opcional POR DESENHO: a ausência desliga o
  | envio — os alertas continuam a ser calculados, apenas não seguem por email
  | (ver app/listeners/estoque_alertas.ts).
  */
  ALERT_EMAIL: Env.schema.string.optional(),

  /*
  |----------------------------------------------------------
  | URLs do frontend
  |----------------------------------------------------------
  | O backend envia por email links que apontam para PÁGINAS do frontend —
  | activação de empresa e reposição de password —, nunca para a API.
  |
  | FRONTEND_URL é OBRIGATÓRIA. Estava a ser lida por `process.env` com omissão
  | para `http://localhost:3000`: um servidor de produção sem ela enviava aos
  | utilizadores links para a máquina deles próprios, e o email saía com
  | aparência perfeitamente normal. Falhar no arranque é preferível.
  |
  | `tld: false` porque `http://localhost:3000` não tem domínio de topo.
  */
  FRONTEND_URL: Env.schema.string({ format: 'url', tld: false }),

  /*
  | Página que recebe o token de definição de password, quando não é a derivada
  | de FRONTEND_URL. Opcional: ausente, usa-se `<FRONTEND_URL>/reset-password/:token`.
  | O marcador `:token` é substituído pelo token real.
  */
  APP_PASSWORD_DEFINITION_URL: Env.schema.string.optional(),

  /*
  | Origens de browser autorizadas a falar directamente com esta API, separadas
  | por vírgula. Opcional: ausente, permite-se tudo em desenvolvimento e nada em
  | produção — porque com o BFF o frontend deixou de falar com a API a partir do
  | browser, e pedidos servidor-a-servidor não passam por CORS (ver config/cors.ts).
  */
  CORS_ORIGINS: Env.schema.string.optional(),

  /*
  | Segredo partilhado com o servidor do frontend (o BFF). Definido, esta API
  | recusa qualquer pedido que não o traga no cabeçalho `x-bff-secret`.
  |
  | Opcional, e ausente não faz nada: activar é um acto deliberado, e exige pôr
  | o MESMO valor no .env do backend e no do frontend. Ausente dos dois lados,
  | tudo continua a funcionar como antes.
  |
  | Ver app/middleware/apenas_bff_middleware.ts, incluindo o que isto NÃO
  | substitui: a fronteira a sério é a rede.
  */
  BFF_SHARED_SECRET: Env.schema.string.optional(),

  /*
  | O MESMO, para o segundo frontend: o backoffice da plataforma.
  |
  | Duas variáveis e não uma lista separada por vírgulas: um segredo é texto
  | arbitrário e uma vírgula lá dentro partiria a lista em silêncio. Assim cada
  | frontend também se roda sem tocar no outro, e o registo de segurança consegue
  | dizer QUAL dos dois falhou.
  */
  BFF_SHARED_SECRET_BACKOFFICE: Env.schema.string.optional(),


  /*
  |----------------------------------------------------------
  | Consulta de NIF (serviço externo bknkv-utils-api-resources)
  |----------------------------------------------------------
  */
  NIF_API_URL: Env.schema.string.optional(),
  NIF_API_TIMEOUT_MS: Env.schema.number.optional(),
  NIF_CACHE_DIAS: Env.schema.number.optional(),

  /*
  |----------------------------------------------------------
  | Limiares dos alertas operacionais
  |----------------------------------------------------------
  | Declarados como número, e não como texto, para que um valor inválido seja
  | apanhado no arranque. Antes eram lidos com `Number(env.get(...))`: um
  | `cinco` no .env dava NaN, e qualquer comparação com NaN é falsa — o alerta
  | desligava-se em silêncio, sem erro nenhum.
  */
  /*
  |----------------------------------------------------------
  | Documentação da API (/swagger e /docs)
  |----------------------------------------------------------
  | Publicar a especificação entrega a um atacante o mapa completo do que
  | atacar: 146 caminhos, com parâmetros e formatos, sem precisar de adivinhar
  | um único nome. Não é uma vulnerabilidade por si — é reconhecimento gratuito,
  | e não há motivo para o oferecer em produção.
  |
  | Omitida, as rotas ficam ligadas fora de produção e desligadas em produção,
  | que é o comportamento certo por omissão dos dois lados. Pôr `true` em
  | produção é uma decisão explícita de quem a toma.
  */
  API_DOCS_ENABLED: Env.schema.boolean.optional(),
  ESTOQUE_LIMIAR_CRITICO: Env.schema.number.optional(),
  LOTE_VALIDADE_ALERTA_DIAS: Env.schema.number.optional(),
  VENDA_CANCELADA_LIMIAR: Env.schema.number.optional(),

  /*
  |----------------------------------------------------------
  | Quanto é que o registo de actividade captura
  |----------------------------------------------------------
  | 'completo'  (omissão) — TODAS as rotas chamadas, com cabeçalhos, parâmetros,
  |                         corpo do pedido e corpo da resposta. Tudo redigido:
  |                         password, token, cookie, authorization e afins saem
  |                         substituídos por [redigido] (ver activity_logger.ts).
  | 'escritas'            — só POST/PUT/PATCH/DELETE, e sem corpos. É o mínimo
  |                         para saber quem fez o quê.
  | 'desligado'           — não regista nada.
  |
  | O que isto decide na prática é VOLUME. Em 'completo' cada GET deixa uma linha
  | com o corpo da resposta, e um catálogo de produtos consultado ao segundo enche
  | a tabela depressa. Os corpos são cortados aos 8000 caracteres, mas o número de
  | LINHAS é que manda — ver a nota de retenção no runbook.
  */
  AUDITORIA_CAPTURA: Env.schema.enum.optional(['completo', 'escritas', 'desligado'] as const),
})
