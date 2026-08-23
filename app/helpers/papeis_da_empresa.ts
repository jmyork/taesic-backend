import { randomUUID } from 'node:crypto'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import db from '@adonisjs/lucid/services/db'
import Papel, { ESCOPO_PAPEL, PREFIXO_PLATAFORMA } from '#models/auth/papel'

/**
 * Dá a uma empresa nova a sua própria cópia dos papéis padrão.
 *
 * Os padrões vivem na base de dados como papéis de âmbito `modelo`, e não como
 * constantes no código. Foi uma escolha: assim o dono da plataforma pode afinar o
 * que uma empresa nova recebe — acrescentar uma permissão ao Vendedor padrão, por
 * exemplo — sem um deploy. As empresas já criadas não são afectadas, porque cada
 * uma tem a sua cópia; é isso que os torna padrões e não configuração global.
 *
 * (Esse mesmo isolamento tem uma consequência operacional que é fácil esquecer:
 * conceder uma permissão ao `modelo` NÃO chega às empresas existentes. Para essas
 * há `node ace permissao:conceder ... --todas-empresas` — ver
 * `resolverPapeisPorNome()` em rbac_permissoes.ts.)
 *
 * A cópia é FUNDA: os papéis e as suas ligações às permissões. As permissões em si
 * não são copiadas — são um catálogo global, partilhado, e é assim que deve ser
 * (uma permissão é um nome de rota, não dados do cliente).
 *
 * ── Sobre o custo ─────────────────────────────────────────────────────────────
 *
 * São ~750 ligações por empresa, e isto corre em cada registo E em cada
 * `createEmpresa()` dos testes — ~350 empresas por corrida da suite. A primeira
 * versão fazia uma consulta por papel dentro de um ciclo, o que dava ~30 idas à
 * base de dados por empresa e tornava a suite impraticável. Esta faz 5,
 * independentemente do número de papéis: duas leituras, uma inserção de papéis e
 * as ligações em lotes.
 *
 * Os ids continuam a ser gerados em Node (`randomUUID()`, v4) e não com o `UUID()`
 * do MySQL, que produz v1: há validadores e parâmetros de rota neste projecto que
 * exigem o formato v4, e um id v1 passaria a falhar validação em sítios difíceis
 * de relacionar com a causa.
 */
export async function clonarPapeisPadrao(
  empresaId: string,
  trx?: TransactionClientContract
): Promise<number> {
  const cliente = trx ?? db.connection()
  const agora = new Date()

  const modelos = await cliente
    .from('papel')
    .where('escopo', ESCOPO_PAPEL.modelo)
    .whereNull('deleted_at')
    .select('id', 'nome', 'descricao')

  if (modelos.length === 0) {
    // Não é um detalhe silenciável: uma empresa sem papéis não tem administrador,
    // e ninguém consegue entrar nela. Melhor falhar o registo do que criar uma
    // empresa inutilizável e descobri-lo quando o cliente tentar entrar.
    throw new Error(
      'Não existem papéis padrão (escopo "modelo") para clonar. ' +
        'A base de dados precisa de ser semeada antes de aceitar registos.'
    )
  }

  // Já clonados? Torna a função repetível sem duplicar — o índice único
  // (empresa_id, nome) recusaria a segunda tentativa, e isto permite ao backoffice
  // repor os padrões de uma empresa que os tenha apagado por engano.
  const jaExistentes = new Set(
    (
      await cliente
        .from('papel')
        .where('empresa_id', empresaId)
        .where('escopo', ESCOPO_PAPEL.empresa)
        .select('nome')
    ).map((p: { nome: string }) => p.nome)
  )

  const aClonar = modelos.filter((m: { nome: string }) => !jaExistentes.has(m.nome))
  if (aClonar.length === 0) return 0

  const idPorModelo = new Map<string, string>()
  const papeisNovos = aClonar.map((modelo: { id: string; nome: string; descricao: string }) => {
    const id = randomUUID()
    idPorModelo.set(modelo.id, id)
    return {
      id,
      nome: modelo.nome,
      descricao: modelo.descricao,
      empresa_id: empresaId,
      escopo: ESCOPO_PAPEL.empresa,
      created_at: agora,
      updated_at: agora,
    }
  })

  await cliente.table('papel').multiInsert(papeisNovos)

  // TODAS as ligações dos modelos numa só consulta, em vez de uma por papel.
  const ligacoes = await cliente
    .from('papel_permissao')
    .whereIn('papel_id', [...idPorModelo.keys()])
    .whereNull('deleted_at')
    .select('papel_id', 'permissao_id')

  const ligacoesNovas = ligacoes.map((l: { papel_id: string; permissao_id: string }) => ({
    id: randomUUID(),
    papel_id: idPorModelo.get(l.papel_id)!,
    permissao_id: l.permissao_id,
    created_at: agora,
    updated_at: agora,
  }))

  for (let i = 0; i < ligacoesNovas.length; i += 1000) {
    await cliente.table('papel_permissao').multiInsert(ligacoesNovas.slice(i, i + 1000))
  }

  return papeisNovos.length
}

/**
 * Valida o nome de um papel que uma EMPRESA quer criar.
 *
 * O prefixo `Platform_` já não concede nada — a autorização de plataforma vem de
 * `papel.escopo`, e um inquilino não consegue escrever `plataforma` nessa coluna
 * (a base de dados recusa-o). Continua proibido por outra razão: um papel de
 * inquilino chamado `Platform_Admin` engana quem lê um ecrã de gestão ou uma linha
 * de auditoria, e uma fronteira de acesso não é sítio para nomes que induzem em
 * erro.
 */
export function nomeDePapelReservado(nome: string): boolean {
  return nome.trim().toLowerCase().startsWith(PREFIXO_PLATAFORMA.toLowerCase())
}

/** Os papéis desta empresa, pelo nome. Usado onde antes se procurava globalmente. */
export function papeisDaEmpresa(empresaId: string) {
  return Papel.query()
    .where('empresa_id', empresaId)
    .where('escopo', ESCOPO_PAPEL.empresa)
    .whereNull('deleted_at')
}
