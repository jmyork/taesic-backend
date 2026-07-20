/** Emitido quando um reembolso (total ou parcial) devolve produtos ao stock. */
export default class EstoqueRevertido {
  constructor(
    public readonly loteId: string,
    public readonly produtoNome: string,
    public readonly companyAlias: string,
    public readonly quantidade: number,
    public readonly motivo: string
  ) {}
}
