import vine from '@vinejs/vine'
import { RAMOS_DE_ACTUACAO } from '../helpers/ramos_de_actuacao.js'

/**
 * Os ramos são obrigatórios, e têm de ser do catálogo.
 *
 * A obrigatoriedade vive AQUI e não na base de dados (secção 7.20): a tabela `empresa_ramo`
 * aceita zero linhas, porque uma empresa por onboardar tem mesmo de poder existir sem ramo
 * nenhum. Quem recusa o pedido vazio é este validador, com 400 e mensagem por campo, antes
 * de a transacção abrir.
 *
 * A lista sai de `RAMOS_DE_ACTUACAO` em vez de ser escrita à mão: um ramo novo passa a ser
 * aceite só por existir no catálogo, e nunca há duas listas a divergir.
 *
 * ── Porque é que `ramo` (singular) continua a ser aceite ───────────────────────
 *
 * Era a forma original, de quando só se escolhia um. Aceitar as duas custa duas linhas e
 * poupa um erro difícil de ler a qualquer chamador que ainda envie a antiga — incluindo um
 * frontend em cache no browser de alguém. `requiredIfMissing` nos dois campos exprime "um
 * ou outro, mas pelo menos um" sem tirar a decisão do validador.
 */
const IDS_DE_RAMO = RAMOS_DE_ACTUACAO.map((r) => r.id)

export const aplicarRamosValidator = vine.compile(
  vine.object({
    ramos: vine
      .array(vine.enum(IDS_DE_RAMO))
      .minLength(1)
      // Sem limite superior próprio: o `enum` de cada elemento já impede qualquer valor
      // fora do catálogo, e repetições são resolvidas pela sementeira (união sem
      // repetidos). Um `maxLength` fixo só criaria uma segunda regra a desactualizar-se
      // sempre que o catálogo crescesse.
      .optional()
      .requiredIfMissing('ramo'),

    /** Forma antiga, de um só ramo. Normalizada para lista no controller. */
    ramo: vine.enum(IDS_DE_RAMO).optional().requiredIfMissing('ramos'),
  })
)
