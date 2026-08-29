import { BaseSeeder } from '@adonisjs/lucid/seeders'
import Users from '#models/user'
import Papel, { ESCOPO_PAPEL } from '#models/auth/papel'
import VerificationTokenHash from '#models/verification_token_hash'
import { giveRoleToUser } from '../../app/helpers/Utils.js'
import { semearPlanosPadrao } from '../../app/helpers/planos_padrao.js'
import { semearRbacPadrao } from '../../app/helpers/rbac_padrao.js'

/**
 * O arranque de uma instalação de RAIZ: planos, catálogo RBAC e três contas de
 * administrador de plataforma para se poder entrar.
 *
 * ── O que este ficheiro deixou de ser ─────────────────────────────────────────
 *
 * Tinha 1932 linhas, das quais ~1900 eram DADOS: 15 papéis, 316 permissões e as
 * ~880 ligações entre uns e outros, escritas à mão dentro do método `run()`. Esses
 * dados passaram para `app/helpers/rbac_padrao.ts` e a diferença não é de
 * arrumação:
 *
 *   - `semearRbacPadrao()` é IDEMPOTENTE, e este seeder continua a não o ser
 *     (`Users.createMany` rebenta com emails repetidos numa segunda corrida). Uma
 *     permissão nova podia, até aqui, chegar a uma base com dados apenas por
 *     `node ace permissao:conceder`, um comando de cada vez. Agora é
 *     `node ace rbac:semear`, e corre em produção.
 *   - o mesmo catálogo passou a estar ao alcance da aplicação e dos testes, sem
 *     ninguém ter de correr um seeder para lá chegar.
 *
 * ── Este seeder é para bases VAZIAS ──────────────────────────────────────────
 *
 * As três contas abaixo são de desenvolvimento e de qualidade. Numa base que já
 * tenha dados, o que se quer é `node ace rbac:semear` e `node ace planos:semear`,
 * que só acrescentam o que falta e não tocam em contas nenhumas.
 */
export default class extends BaseSeeder {
  async run() {
    // ── Planos de subscrição ──────────────────────────────────────────────────
    //
    // Vem PRIMEIRO de propósito: ao concluir o onboarding, `onboarding_repository`
    // abre a subscrição da empresa no plano de arranque (`garantirSubscricao` →
    // `planoDeArranque`), e faz isso em silêncio quando não há planos — para uma
    // plataforma mal configurada não prender ninguém no onboarding. O preço desse
    // silêncio é que a empresa sai configurada e sem subscrição, e ninguém dá por
    // isso. Uma base semeada sem planos dava ainda, sem o dizer, acesso ilimitado a
    // todas as empresas: `limites_do_plano.ts` não impõe limite a quem não tem plano.
    await semearPlanosPadrao()

    // ── Catálogo RBAC: papéis, permissões e as ligações entre eles ────────────
    //
    // Os papéis de inquilino nascem como MODELO, não como papéis utilizáveis.
    // Nenhum utilizador os recebe: cada empresa ganha a SUA cópia no registo (ver
    // `clonarPapeisPadrao()`), e é a cópia que é atribuída. É isso que permite a
    // uma empresa mudar o seu "Vendedor" sem mudar o Vendedor de todas as outras.
    //
    // Afinar um modelo só afecta empresas criadas A PARTIR DE ENTÃO. Para alcançar
    // as que já existem:
    //   node ace permissao:conceder <permissao> <papel> --todas-empresas
    const rbac = await semearRbacPadrao()
    console.log(
      `RBAC: ${rbac.papeis} papéis, ${rbac.permissoes} permissões, ${rbac.ligacoes} ligações.`
    )

    // ── Contas de plataforma (desenvolvimento e qualidade) ────────────────────
    const contas = [
      {
        username: 'jose.baptista99',
        email: 'josebaptistatest99@example.com',
        password: '1234567890aA#',
      },
      {
        username: 'benedito.ciloca',
        email: 'beneditociloca@gmail.com',
        password: '1234567890aA$',
      },
      {
        username: 'carla.morais',
        email: 'carlamorais@gmail.com',
        password: '1234567890aA%',
      },
    ]
    await Users.createMany(contas)

    const users = await Users.query().whereIn(
      'email',
      contas.map((c) => c.email)
    )

    // Contas já activadas — sem isto não se consegue entrar sem passar pelo email.
    await VerificationTokenHash.createMany(
      users.map((u) => ({ purpose: 'account_activation' as const, verified: true, user_id: u.id }))
    )

    // ── Papéis de plataforma para estas contas ────────────────────────────────
    //
    // Só as contas criadas ACIMA, nunca `Users.all()`: isso promoveria a
    // Platform_Admin qualquer conta real já registada na base.
    //
    // Por `escopo`, e não pelo prefixo do nome — a mesma correcção feita no
    // `admin_only_middleware`. Com papéis por empresa, um inquilino pode criar um
    // papel chamado "Platform_Admin", e decidir pelo nome era o caminho para
    // escalar de inquilino a administrador da plataforma.
    const papeisDePlataforma = (
      await Papel.query().where('escopo', ESCOPO_PAPEL.plataforma).whereNull('deleted_at')
    ).map((p) => p.nome)

    for (const user of users) {
      await giveRoleToUser(user, papeisDePlataforma)
    }
  }
}
