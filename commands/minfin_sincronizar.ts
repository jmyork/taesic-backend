/**
 * Registo do comando `minfin:sincronizar`.
 *
 * O AdonisJS só descobre comandos que estejam FISICAMENTE em `commands/` — a
 * varredura é por directório, não por configuração. Este ficheiro existe só para
 * o encontrar.
 *
 * Nada da integração vive aqui: o comando inteiro está em
 * `minfin-integration/comandos/sincronizar_minfin.ts`, com o resto do módulo.
 */
export { default } from '../minfin-integration/comandos/sincronizar_minfin.js'
