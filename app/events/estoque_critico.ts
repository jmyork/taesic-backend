/** Emitido quando uma saída de stock deixa um lote com quantidade <= limiar configurado. */
export default class EstoqueCritico {
  constructor(
    public readonly loteId: string,
    public readonly produtoNome: string,
    public readonly companyAlias: string,
    public readonly quantidadeAtual: number,
    public readonly limiar: number
  ) {}
}
