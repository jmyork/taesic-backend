import { randomUUID } from 'node:crypto'
import type { MultipartFile } from '@adonisjs/core/bodyparser'
import drive from '@adonisjs/drive/services/main'
import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import { urlPublicaR2 } from './r2_url.js'

/**
 * Guardar e apagar imagens enviadas por utilizadores. UM caminho, para todas.
 *
 * O PROBLEMA QUE ISTO RESOLVE. Havia dois caminhos para uma imagem entrar no
 * sistema, e só um deles estava certo:
 *
 *   produto_media  →  `file.moveToDisk(...)` no repositório  →  R2, nome UUID,
 *                     URL pública gravada na coluna. Correcto.
 *
 *   cliente.logo   →  `file.move('uploads', ...)` DENTRO do validador  →  disco
 *   cliente.foto      local do servidor, e só o nome do ficheiro gravado.
 *
 * O segundo estava errado de quatro maneiras ao mesmo tempo:
 *
 * 1. Escrevia no disco do servidor, não no R2. Nada serve esse caminho — não
 *    existe sequer `uploads/` na raiz do projecto (há `public/uploads/`, que é
 *    outro sítio). Os ficheiros eram escritos e nunca mais lidos por ninguém: a
 *    funcionalidade estava partida de ponta a ponta, e ninguém tinha reparado
 *    porque falha em silêncio.
 * 2. Não havia limpeza nenhuma. 25 MB por pedido, sem limite de total, escritos
 *    por qualquer utilizador autenticado de qualquer empresa. É um caminho para
 *    encher o disco da VPS a partir de um `POST` — e como tudo corre na mesma
 *    máquina, encher o disco pára também a produção e a base de dados.
 * 3. `file.move()` é assíncrono e o `.transform()` do VineJS é SÍNCRONO. A
 *    promessa nunca era aguardada nem apanhada: um erro de escrita desaparecia
 *    sem deixar rasto, e o pedido respondia 200 com um nome de ficheiro que não
 *    existia.
 * 4. Trabalho de I/O dentro de um validador. Um validador que escreve no disco
 *    já escreveu quando OUTRO campo do mesmo pedido for recusado — o ficheiro
 *    fica lá, órfão, de um pedido que devolveu 400.
 *
 * A regra que fica: **o validador valida, o repositório escreve.** É o que o
 * `produto_media` já fazia e é para aí que o `cliente` passou.
 */

/** Extensões aceites. A mesma lista que os validadores impõem. */
export type ImagemEnviada = MultipartFile

/**
 * Sobe uma imagem para o R2 e devolve a URL pública a gravar na coluna.
 *
 * O nome é sempre `randomUUID()` e nunca o que o utilizador enviou. Duas razões,
 * e a segunda é a que interessa para segurança:
 *
 * - Nomes colidem. Duas pessoas a enviar `logo.png` sobrepunham-se uma à outra.
 * - Um nome escolhido pelo utilizador é um nome ADIVINHÁVEL, e o bucket é de
 *   leitura pública. Com UUIDv4 não há como enumerar o que lá está: quem não
 *   recebeu a URL da nossa API não a descobre. É esta imprevisibilidade que faz
 *   as vezes de controlo de acesso enquanto os objectos forem públicos.
 *
 * A extensão vem de `file.extname`, que o AdonisJS deriva do ficheiro, e os
 * validadores já a limitam a um conjunto fechado de imagens.
 */
export async function guardarImagem(ficheiro: ImagemEnviada, pasta: string): Promise<string> {
  const caminho = `${pasta}/${randomUUID()}.${ficheiro.extname}`

  await ficheiro.moveToDisk(caminho)

  return urlPublicaR2(caminho)
}

/**
 * O caminho do objecto dentro do bucket, a partir da URL pública gravada.
 *
 * Esta derivação estava só dentro de `produto_media_repository.softDelete()`.
 * Vive aqui porque agora tem dois chamadores, e porque é frágil o suficiente
 * para merecer um sítio só: depende do formato que `urlPublicaR2()` produz, e as
 * duas funções têm de continuar a concordar. Ver o aviso no cabeçalho de
 * `r2_url.ts` sobre `R2_PUBLIC_URL` ter de ser a raiz de um domínio, sem
 * segmento de caminho — é exactamente esta derivação que se parte se não for.
 *
 * Devolve `null` para o que não conseguir interpretar. Um valor que não é uma
 * URL nossa não deve ser apagado às cegas: pode ser o nome de ficheiro solto que
 * a versão antiga do `cliente` gravava, e nesse caso não há objecto nenhum no R2
 * para apagar.
 */
export function caminhoDoObjecto(url: string | null | undefined): string | null {
  if (!url) return null

  let pathname: string
  try {
    pathname = new URL(url).pathname
  } catch {
    // Não é uma URL absoluta — é o formato antigo (só o nome do ficheiro).
    return null
  }

  const caminho = pathname.replace(`/${env.get('R2_BUCKET')}/`, '').replace(/^\/+/, '')

  return caminho.length > 0 ? caminho : null
}

/**
 * Apaga o objecto de uma URL. Nunca propaga o erro.
 *
 * É "fire-and-forget" pela mesma razão que a escrita em `security_logs` o é (ver
 * `security_logger.ts`): esta limpeza acontece DEPOIS de a operação de negócio
 * ter tido sucesso — o cliente já foi actualizado com a imagem nova. Falhar aqui
 * e propagar transformaria uma limpeza falhada num erro 500 sobre uma operação
 * que correu bem, e o utilizador voltaria a tentar sobre um estado já alterado.
 *
 * O custo de engolir é um objecto órfão no R2, que ninguém referencia. É o troco
 * certo.
 */
export async function apagarImagemPorUrl(url: string | null | undefined): Promise<void> {
  const caminho = caminhoDoObjecto(url)
  if (!caminho) return

  try {
    await drive.use().delete(caminho)
  } catch (error) {
    logger.warn({ err: error, caminho }, '[imagem] falha ao apagar objecto no R2')
  }
}

/**
 * Resolve um campo de imagem de um payload já validado.
 *
 * Devolve a URL quando veio ficheiro novo, e `undefined` quando o campo não foi
 * enviado — `undefined` para o `merge()` do Lucid não tocar na coluna, que é o
 * que mantém a imagem actual num update parcial que não mexe nela.
 */
export async function resolverImagem(
  valor: ImagemEnviada | undefined,
  pasta: string
): Promise<string | undefined> {
  if (!valor) return undefined
  return guardarImagem(valor, pasta)
}
