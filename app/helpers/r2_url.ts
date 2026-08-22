import env from '#start/env'

/**
 * URL público de um objecto guardado no R2.
 *
 * Esta expressão existia em duas cópias — `empresa_repository` e
 * `produto_media_repository` — e decidia pelo ambiente:
 *
 *     NODE_ENV !== 'development'
 *       ? `${R2_ENDPOINT}/${R2_BUCKET}/${caminho}`
 *       : `${R2_DEV_SHOW_ENDPOINT}/${caminho}`
 *
 * Duas coisas erradas nisso:
 *
 * 1. `R2_DEV_SHOW_ENDPOINT` estava declarada como OBRIGATÓRIA no schema. Um
 *    deploy de produção — que não tem subdomínio r2.dev — não arrancava, apesar
 *    de o valor nunca chegar a ser usado nesse ambiente.
 * 2. Amarrar a escolha ao `NODE_ENV` impede um servidor de produção de servir as
 *    imagens por um domínio próprio: o nome da variável dizia "dev" e o código
 *    tratava-a como tal, e por isso produção ficou com o endpoint S3.
 *
 * Agora decide a PRESENÇA da variável, não o ambiente. `R2_PUBLIC_URL` é
 * opcional: quando definida é a base pública (subdomínio r2.dev em
 * desenvolvimento, domínio próprio do R2 em produção); quando ausente, cai no
 * endpoint S3 do bucket — que é exactamente o que produção já fazia, logo sem
 * mudança de comportamento em quem não a definir.
 *
 * ATENÇÃO ao valor: o endpoint S3 do R2 (`*.r2.cloudflarestorage.com`) NÃO é
 * legível publicamente — exige pedidos assinados. Um `<img src>` para lá recebe
 * 401. Para as imagens aparecerem em produção, `R2_PUBLIC_URL` tem de ser um
 * domínio público ligado ao bucket.
 *
 * E use a raiz do domínio, sem segmento de caminho: o `softDelete` em
 * `produto_media_repository` recupera o caminho do objecto a partir deste URL
 * (tira `/<bucket>/` quando existe, e a barra inicial). Uma base como
 * `https://cdn.exemplo.com/media` quebraria essa derivação.
 */
export function urlPublicaR2(caminhoDoObjecto: string): string {
  const caminho = caminhoDoObjecto.replace(/^\/+/, '')
  const basePublica = env.get('R2_PUBLIC_URL')?.trim()

  if (basePublica) {
    return `${basePublica.replace(/\/+$/, '')}/${caminho}`
  }

  const endpoint = env.get('R2_ENDPOINT').replace(/\/+$/, '')
  return `${endpoint}/${env.get('R2_BUCKET')}/${caminho}`
}
