import { roundAbnt } from '@/core/money/roundAbnt'

/**
 * Arredondamento monetário (2 casas) — utilitário puro de apresentação/validação.
 *
 * Fonte única de arredondamento: delega a `roundAbnt` (alinhada a
 * `public.round_abnt` no Postgres), para não divergir em casos de borda de
 * ponto flutuante (ex.: `Math.round(1.005*100)/100` dava 1, não 1.01 — ver
 * `core/money/roundAbnt.test.ts`).
 *
 * NOTA DE ARQUITETURA: a totalização do carrinho e a aplicação de desconto de
 * gerente NÃO vivem aqui. A fonte única é `shared-core/src/stores/unifiedCartStore`
 * (`calcularTotais` / `calcularTotaisComGerente`), que aplica o clamp de máximo
 * permitido via `aplicarDescontoGerenteSobreTotal`. Duplicar a regra aqui
 * reintroduziria divergência de preço fora do motor central.
 */
export function roundMoney2(value: number): number {
  return roundAbnt(value, 2)
}
