import { Exception } from '@adonisjs/core/exceptions'

export default class TableFieldNotFoundException extends Exception {
  static status = 500

  async run() {
    return {}
  }

}