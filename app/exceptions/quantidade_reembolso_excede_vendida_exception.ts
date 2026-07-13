import { Exception } from '@adonisjs/core/exceptions'

export default class QuantidadeReembolsoExcedeVendidaException extends Exception {
  static status = 400
  static code = 'REFUND_QUANTITY_EXCEEDS_SOLD'
  static message = 'REFUND_QUANTITY_EXCEEDS_SOLD: The quantity to refund exceeds the quantity sold.'
}