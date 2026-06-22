/**
 * Arredondamento monetário (2 casas) — utilitário puro de apresentação/validação.
 *
 * NOTA DE ARQUITETURA: a totalização do carrinho e a aplicação de desconto de
 * gerente NÃO vivem aqui. A fonte única é `shared-core/src/stores/unifiedCartStore`
 * (`calcularTotais` / `calcularTotaisComGerente`), que aplica o clamp de máximo
 * permitido via `aplicarDescontoGerenteSobreTotal`. Duplicar a regra aqui
 * reintroduziria divergência de preço fora do motor central.
 */
export function roundMoney2(value: number): number {
  return Math.round(value * 100) / 100
}
