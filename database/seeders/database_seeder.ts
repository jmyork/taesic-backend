import { BaseSeeder } from '@adonisjs/lucid/seeders'
import { semearPlanosPadrao } from '../../app/helpers/planos_padrao.js'
import { semearRbacPadrao } from '../../app/helpers/rbac_padrao.js'

/**
 * O arranque de uma instalação de RAIZ: planos e catálogo RBAC. **Nada mais.**
 *
 * ── Este seeder NÃO cria contas. Em ambiente nenhum. ─────────────────────────
 *
 * Criou três administradores de plataforma durante muito tempo, com as passwords
 * escritas neste ficheiro — que está num repositório. A guarda que os limitava
 * foi apertada duas vezes (primeiro "em todo o lado excepto `production`", depois
 * "só em `development`") e as duas vezes a pergunta ficou por responder: qual é o
 * ambiente onde é aceitável semear credenciais publicadas?
 *
 * Não há nenhum, e em desenvolvimento também não: é a base de onde se copiam
 * dumps, é a que aparece num ecrã partilhado, e é o hábito que leva alguém a
 * escrever a mesma password noutro sítio. A decisão é do dono do produto —
 * *"user nenhum deve ser criado de antemão"* — e é a certa.
 *
 * A primeira conta de plataforma nasce SEMPRE no ecrã de instalação do
 * backoffice (`POST api/instalacao` no `taesic-backoffice-api`), onde a password
 * é escrita num formulário, o acesso é guardado pelo `PLATFORM_SETUP_TOKEN`, e o
 * endereço de quem instala fica registado — é essa linha que liga o filtro por
 * IP. Ver o CLAUDE.md §9 desse projecto.
 *
 * Uma base sem utilizadores não fica bloqueada: o registo de empresas é público
 * e não depende de haver contas de plataforma.
 *
 * ── O que este ficheiro deixou de ser ────────────────────────────────────────
 *
 * Tinha 1932 linhas, das quais ~1900 eram DADOS: 15 papéis, 316 permissões e as
 * ~880 ligações entre uns e outros, escritas à mão dentro do método `run()`.
 * Esses dados passaram para `app/helpers/rbac_padrao.ts` e a diferença não é de
 * arrumação: `semearRbacPadrao()` é IDEMPOTENTE, e o mesmo catálogo passou a
 * estar ao alcance da aplicação e dos testes sem ninguém ter de correr um seeder
 * para lá chegar.
 *
 * ── Numa base que já tem dados ───────────────────────────────────────────────
 *
 * `node ace rbac:semear` e `node ace planos:semear`. Só acrescentam o que falta.
 * Este seeder é para bases vazias — e, agora que não cria contas, correr duas
 * vezes deixou de rebentar (era o `Users.createMany` que o impedia).
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

    console.log(
      '\nNenhuma conta criada — e é deliberado, em qualquer ambiente.\n' +
        'Crie o administrador da plataforma no ecrã de instalação do backoffice:\n' +
        '  1. defina PLATFORM_SETUP_TOKEN no .env do taesic-backoffice-api\n' +
        '  2. abra /instalacao no backoffice e use esse token\n' +
        '  3. apague a variável e reinicie o serviço\n'
    )
  }
}
