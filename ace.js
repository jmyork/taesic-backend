/*
|--------------------------------------------------------------------------
| JavaScript entrypoint for running ace commands
|--------------------------------------------------------------------------
|
| DO NOT MODIFY THIS FILE AS IT WILL BE OVERRIDDEN DURING THE BUILD
| PROCESS.
|
| See docs.adonisjs.com/guides/typescript-build-process#creating-production-build
|
| Since, we cannot run TypeScript source code using "node" binary, we need
| a JavaScript entrypoint to run ace commands.
|
| This file registers the "ts-node/esm" hook with the Node.js module system
| and then imports the "bin/console.ts" file.
|
*/

/**
 * Regista o compilador TypeScript em tempo de execução.
 *
 * ERA `ts-node-maintained/register/esm`, e isso partia comandos que corriam bem.
 *
 * O sintoma: qualquer comando com `options.startApp` (todos os que tocam na base
 * de dados — `caixa:fechar-diario`, `empresa:clean:expired`,
 * `estoque:check-alertas`, `migration:run`) fazia SIGSEGV ao SAIR, depois de
 * ter feito o trabalho todo e de ter escrito a mensagem de sucesso. O processo
 * terminava com código 139. Intermitente — medido em 2 de 15 execuções numa
 * máquina parada, e em 3 de 5 com o servidor a correr ao lado.
 *
 * Porque é que isso interessa: um cron não lê a mensagem de sucesso, lê o código
 * de saída. Um trabalho que correu bem era reportado como falhado, e um trabalho
 * que falhasse a sério ficava indistinguível do ruído.
 *
 * A causa é o crash da thread do loader durante o teardown do processo, e não
 * nada que os comandos façam: reproduz-se com um comando que só tem
 * `options.startApp` e um corpo vazio, e desaparece por completo ao correr o
 * JavaScript compilado (`build/`), que não tem loader nenhum.
 *
 * `@poppinss/ts-exec` não é uma escolha nova nem exótica: é o que o
 * `@adonisjs/assembler` JÁ usa para arrancar `node ace serve` e `node ace test`
 * (`--import=@poppinss/ts-exec`). Este ficheiro era o último sítio do projecto
 * ainda preso ao loader antigo. Medido a seguir à troca: 0 falhas em 23
 * execuções do mesmo comando que falhava.
 */
import '@poppinss/ts-exec'

/**
 * Import ace console entrypoint
 */
await import('./bin/console.js')
