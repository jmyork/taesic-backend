import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import Pos from '#models/faturacao/pos'
import Empresa from '#models/empresa'

/**
 * Nome do posto de atendimento que nasce com a empresa.
 *
 * "Sede" e não o nome da empresa: o posto é um LOCAL, e o local onde se abriu a empresa
 * é a sede. Repetir o nome da empresa dentro dela ("Farmácia Bem-Estar" → posto
 * "Farmácia Bem-Estar") não distingue nada no dia em que abrir o segundo posto, que é
 * exactamente quando o nome passa a ser lido.
 */
export const NOME_POSTO_PADRAO = 'Sede'

/**
 * Toda a empresa tem de ter um posto de atendimento, desde o primeiro minuto.
 *
 * ── Porque é que isto existe ───────────────────────────────────────────────────
 *
 * Sem um `pos`, uma empresa acabada de registar está de pé e não faz nada: `caixa` é
 * aberta contra um posto, `vendas` corre dentro de uma caixa, e o `lote` (stock, preço)
 * é por posto. Um Vendedor é atirado para `/dashboard/selecionar-pdv` (ver
 * `ProtectedRoute`) e encontra uma lista vazia, sem forma de sair dali — só um Admin
 * pode criar postos, e a permissão `domain_pos.store` não é dele.
 *
 * Até aqui o primeiro posto era trabalho manual do dono, num ecrã que ele ainda não sabe
 * que existe. O registo deixa de o deixar a meio: mesma razão, e mesmo sítio, que os
 * métodos de pagamento e os papéis padrão — dentro da transacção do registo, ou a
 * empresa nasce completa ou não nasce.
 *
 * ── Idempotente ────────────────────────────────────────────────────────────────
 *
 * Devolve `null` sem escrever nada se a empresa já tiver um posto activo. Não é só
 * defesa contra chamadas repetidas: este helper também serve para reparar empresas
 * anteriores a esta mudança, e essas não podem ganhar uma "Sede" a mais por cima dos
 * postos que já têm.
 *
 * O nome é procurado até um estar livre (`Sede`, `Sede 2`, ...) porque `pos` tem
 * `unique(nome, empresa_id)` e um posto SOFT-APAGADO continua a ocupar o nome — uma
 * empresa que tenha desactivado a sua "Sede" antiga rebentaria aqui com um erro de
 * chave duplicada, no meio do registo, sem nada a dizer que o problema é um nome.
 */
export async function semearPostoPadrao(
  empresa: Empresa,
  emailDoDono: string,
  trx?: TransactionClientContract
): Promise<Pos | null> {
  const activos = await contarPostosActivos(empresa.id, trx)
  if (activos > 0) return null

  const ocupados = new Set(
    (await Pos.query({ client: trx }).where('empresa_id', empresa.id).select('nome')).map((p) =>
      p.nome.trim().toLowerCase()
    )
  )

  let nome = NOME_POSTO_PADRAO
  for (let n = 2; ocupados.has(nome.toLowerCase()); n++) {
    nome = `${NOME_POSTO_PADRAO} ${n}`
  }

  // Os dados do posto são os da empresa porque, no dia do registo, são a mesma coisa: a
  // sede é onde a empresa está. O dono edita-os depois, sem nunca ter tido de os inventar
  // duas vezes no formulário de registo.
  //
  // `pos` não tem email próprio no registo — a empresa também não tem coluna de email
  // (ver `empresaDoUtilizador` em auth_repository.ts): o endereço institucional é o da
  // conta que registou a empresa, e é esse que serve de contacto do primeiro posto.
  return Pos.create(
    {
      nome,
      localizacao: empresa.localizacao ?? '',
      contacto: empresa.contacto ?? '',
      email: emailDoDono,
      empresa_id: empresa.id,
    },
    { client: trx }
  )
}

/**
 * Quantos postos de atendimento activos (não soft-apagados) tem esta empresa.
 *
 * É a pergunta que `pos_repository.softDelete()` faz antes de desactivar um posto: a
 * empresa tem de ficar sempre com pelo menos um. Aqui e não inline no repositório
 * porque o registo faz a mesma pergunta (acima) e as duas têm de concordar no que conta
 * como "activo".
 */
export async function contarPostosActivos(
  empresaId: string,
  trx?: TransactionClientContract
): Promise<number> {
  const linha = await Pos.query({ client: trx })
    .where('empresa_id', empresaId)
    .whereNull('deleted_at')
    .count('* as total')
    .first()

  // mysql2 devolve COUNT() como string em alguns drivers/versões — normalizar aqui, para
  // ninguém comparar "0" > 0 e ficar a olhar para o resultado errado.
  return Number((linha as any)?.$extras?.total ?? 0)
}
