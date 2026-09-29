/**
 * Texto da coluna "Atacado" do Catálogo: a FAIXA DE ENTRADA (menor quantidade
 * mínima ativa em `precos_atacado`) + quantas faixas existem além dela.
 * Puro — sem I/O nem React — para poder ser testado sem montar a tabela.
 */

export type CatalogoAtacadoLabels = {
  /** `{{n}}` = quantidade mínima, `{{preco}}` = preço já formatado. */
  atacadoAPartir: string
  atacadoFaixasUm: string
  /** `{{n}}` = quantas faixas além da de entrada. */
  atacadoFaixasN: string
}

export type CatalogoAtacadoTexto = {
  /** Ex.: "A partir de 6 un.: R$ 30,00". */
  principal: string
  /** Ex.: "+2 faixas"; `null` quando não há faixas além da de entrada. */
  extras: string | null
}

/** `null` = produto sem atacado (a tabela mostra "—"). */
export function atacadoEntradaTexto(
  faixa: {
    quantidadeMinima: number | null
    precoUnitario: number | null
    faixasAdicionais?: number | null
  },
  labels: CatalogoAtacadoLabels,
  formatarPreco: (valor: number) => string,
): CatalogoAtacadoTexto | null {
  if (faixa.quantidadeMinima == null || faixa.precoUnitario == null) return null
  const adicionais = faixa.faixasAdicionais ?? 0
  return {
    principal: labels.atacadoAPartir
      .replace('{{n}}', String(faixa.quantidadeMinima))
      .replace('{{preco}}', formatarPreco(faixa.precoUnitario)),
    extras:
      adicionais <= 0
        ? null
        : adicionais === 1
          ? labels.atacadoFaixasUm
          : labels.atacadoFaixasN.replace('{{n}}', String(adicionais)),
  }
}
