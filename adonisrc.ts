import { defineConfig } from '@adonisjs/core/app'

export default defineConfig({
  /*
  |--------------------------------------------------------------------------
  | Experimental flags
  |--------------------------------------------------------------------------
  |
  | The following features will be enabled by default in the next major release
  | of AdonisJS. You can opt into them today to avoid any breaking changes
  | during upgrade.
  |
  */
  experimental: {
    mergeMultipartFieldsAndFiles: true,
    shutdownInReverseOrder: true,
  },

  /*
  |--------------------------------------------------------------------------
  | Commands
  |--------------------------------------------------------------------------
  |
  | List of ace commands to register from packages. The application commands
  | will be scanned automatically from the "./commands" directory.
  |
  */
  commands: [
    () => import('@adonisjs/core/commands'),
    () => import('@adonisjs/lucid/commands'),
    () => import('@adonisjs/bouncer/commands'),
    () => import('@adonisjs/mail/commands'),
  ],

  /*
  |--------------------------------------------------------------------------
  | Service providers
  |--------------------------------------------------------------------------
  |
  | List of service providers to import and register when booting the
  | application
  |
  */
  providers: [
    () => import('@adonisjs/core/providers/app_provider'),
    () => import('@adonisjs/core/providers/hash_provider'),
    {
      file: () => import('@adonisjs/core/providers/repl_provider'),
      environment: ['repl', 'test'],
    },
    () => import('@adonisjs/core/providers/vinejs_provider'),
    () => import('@adonisjs/core/providers/edge_provider'),
    () => import('@adonisjs/session/session_provider'),
    () => import('@adonisjs/shield/shield_provider'),
    () => import('@adonisjs/static/static_provider'),
    () => import('@adonisjs/cors/cors_provider'),
    () => import('@adonisjs/lucid/database_provider'),
    () => import('@adonisjs/auth/auth_provider'),
    () => import('@adonisjs/inertia/inertia_provider'),
    () => import('@adonisjs/bouncer/bouncer_provider'),
    () => import('@adonisjs/mail/mail_provider'),
    () => import('@adonisjs/drive/drive_provider'),
    () => import('@adonisjs/limiter/limiter_provider')
  ],

  /*
  |--------------------------------------------------------------------------
  | Preloads
  |--------------------------------------------------------------------------
  |
  | List of modules to import before starting the application.
  |
  */
  preloads: [
    () => import('#start/lucid'),
    // `start/validator.ts` define `vine.messagesProvider` com a tradução completa das mensagens
    // de validação, mas nunca esteve nesta lista — ou seja, o ficheiro nunca era carregado e a
    // aplicação inteira devolvia sempre o texto inglês por omissão do VineJS ("The uid field
    // must be defined", "The selected tipo is invalid"). Tem de vir antes das rotas, para o
    // provider já estar instalado quando os controladores forem resolvidos.
    () => import('#start/validator'),
    () => import('#start/routes'),
    () => import('#start/kernel'),
    () => import('#start/events'),
  ],

  /*
  |--------------------------------------------------------------------------
  | Tests
  |--------------------------------------------------------------------------
  |
  | List of test suites to organize tests by their type. Feel free to remove
  | and add additional suites.
  |
  */
  tests: {
    suites: [
      {
        files: ['tests/unit/**/*.spec(.ts|.js)'],
        name: 'unit',
        timeout: 2000,
      },
      {
        files: ['tests/functional/**/*.spec(.ts|.js)'],
        name: 'functional',
        timeout: 30000,
      },
      /*
       * A integração com a facturação electrónica da AGT.
       *
       * Suite própria, e os ficheiros ficam dentro do módulo — é a mesma razão
       * das migrações em `config/database.ts`: o módulo cabe todo numa pasta.
       *
       * Não precisa de base de dados: exercita o cliente contra o servidor
       * simulado (`minfin-integration/simulador/`), que é a única forma de
       * testar isto enquanto a AGT não entregar endereços reais — o Blueprint
       * entrega-os como `http://xxx.xxx.xxx.xxx:yyyy/`.
       *
       *     node ace test minfin
       */
      {
        files: ['minfin-integration/testes/**/*.spec(.ts|.js)'],
        name: 'minfin',
        timeout: 30000,
      },
      /*
       * A integração com o BAI Paga (pagamentos móveis do Banco BAI).
       *
       * Mesma razão da suite acima: o módulo cabe todo numa pasta, e os testes
       * ficam lá dentro com ele.
       *
       * Não precisa de base de dados, e não toca no BAI: exercita o cliente
       * contra o servidor simulado (`baipaga-integration/simulador/`). Além das
       * razões habituais — cada chamada ao ambiente de qualidade deles consome
       * uma referência externa — há uma que é só desta integração: a única
       * maneira de afirmar que uma resposta FORJADA é recusada é forjar uma, e
       * isso exige um servidor nosso.
       *
       *     node ace test baipaga
       */
      {
        files: ['baipaga-integration/testes/**/*.spec(.ts|.js)'],
        name: 'baipaga',
        timeout: 30000,
      },
    ],
    forceExit: false,
  },

  /*
  |--------------------------------------------------------------------------
  | Metafiles
  |--------------------------------------------------------------------------
  |
  | A collection of files you want to copy to the build folder when creating
  | the production build.
  |
  */
  metaFiles: [
    {
      pattern: 'resources/views/**/*.edge',
      reloadServer: false,
    },
    {
      pattern: 'public/**',
      reloadServer: false,
    },
  ],

  hooks: {
    // onBuildStarting: [() => import('@adonisjs/vite/build_hook')],
  },
})
