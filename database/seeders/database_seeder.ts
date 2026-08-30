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

    // ── Contas de plataforma ──────────────────────────────────────────────────
    //
    // ⚠️ AS TRÊS CONTAS ABAIXO NUNCA PODEM EXISTIR EM PRODUÇÃO.
    //
    // Recebem TODOS os papéis de escopo `plataforma` (ver o ciclo mais abaixo) —
    // `Platform_Admin` incluído — e ficam pré-activadas, portanto entram sem
    // passar pelo email. As passwords estão escritas neste ficheiro, que está no
    // repositório. Em produção, isso são três administradores de plataforma com
    // credenciais publicadas.
    //
    // O comentário anterior dizia "desenvolvimento e qualidade", o que descrevia
    // a INTENÇÃO — mas nada a impunha: `db:seed` corre exactamente igual em
    // qualquer ambiente, e `db:fresh:seed` chama-o. Uma reconstrução de produção
    // criava-as sem um único aviso.
    //
    // Em produção o seeder NÃO CRIA CONTA NENHUMA, e isso é deliberado.
    //
    // A primeira versão desta correcção exigia `SEED_ADMIN_EMAIL` e
    // `SEED_ADMIN_PASSWORD` na linha de comandos. Funcionava, mas obrigava a
    // escrever uma password num comando — que fica no histórico do shell, na
    // lista de processos e em qualquer registo de sessão. Trocava um problema por
    // outro mais pequeno, não o resolvia.
    //
    // A conta de administrador da plataforma passou a nascer no BACKOFFICE, num
    // ecrã de instalação que só existe enquanto não houver nenhuma
    // (`POST api/instalacao` em taesic-backoffice-api). A password é escrita num
    // formulário, nunca num terminal.
    //
    // Uma base de produção sem utilizadores não fica bloqueada: o registo de
    // empresas é público e não depende de haver contas de plataforma.
    // ── Onde é que as contas de demonstração podem nascer ─────────────────────
    //
    // SÓ em `development`. A regra anterior era o inverso — "em todo o lado
    // excepto `production`" — e falhava aberta por duas vias.
    //
    // A primeira apareceu em serviço: QUALIDADE está exposta na internet
    // (`admin.qua.taesic.bknkv.com`), e não é produção. Bastava correr
    // `db:fresh:seed` para a consola de administração de qualidade ficar com
    // três administradores de plataforma cujas passwords estão escritas neste
    // ficheiro, que está num repositório. A base é a de qualidade e não a de
    // produção, mas continua a ser uma consola de administração destrancada.
    //
    // A segunda é mais silenciosa: `NODE_ENV` por definir, escrito com maiúscula,
    // ou com um valor que ninguém previu, dava contas criadas. Uma lista de
    // permissões não tem esse problema — o que não está nela não passa.
    //
    // A partir daqui, tudo o que não seja desenvolvimento cria a primeira conta
    // no ecrã de instalação do backoffice, onde a password é escrita num
    // formulário e não fica no repositório nem no histórico do shell.
    const ambiente = process.env.NODE_ENV
    const podeCriarContasDeDemonstracao = ambiente === 'development'

    if (!podeCriarContasDeDemonstracao) {
      console.log(
        `\nAmbiente "${ambiente ?? '(por definir)'}": nenhuma conta criada — as de ` +
          'demonstração têm passwords no repositório.\n' +
          'Crie o administrador da plataforma no ecrã de instalação do backoffice:\n' +
          '  1. defina PLATFORM_SETUP_TOKEN no .env do taesic-backoffice-api\n' +
          '  2. abra /instalacao no backoffice e use esse token\n' +
          '  3. apague a variável e reinicie o serviço\n'
      )
      return
    }

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
