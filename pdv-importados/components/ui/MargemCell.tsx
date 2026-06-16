/**
 * FastProduct — MargemCell (observabilidade visual)
 *
 * Mostra a margem aproximada de um item de venda: "~R$ X (~XX%)".
 * Puramente informativo — calculado no client a partir de valores já
 * exibidos na tela (preço unitário, custo snapshot). Não é usado em
 * relatório financeiro nem em qualquer cálculo de negócio.
 *
 * Controlado por `pdv_config.show_margin_visual`: quando a flag está
 * desligada, o chamador simplesmente não deve renderizar este componente.
 */

import { formatBRL } from '@/lib/format/money'

export function MargemCell({
  precoUnitario,
  custoUnitarioSnap,
}: {
  precoUnitario: number
  custoUnitarioSnap: number | null
}) {
  if (custoUnitarioSnap == null) {
    return <span className="text-jl-fg-3">—</span>
  }

  const margemValor = precoUnitario - custoUnitarioSnap
  const margemPercentual = precoUnitario > 0 ? (margemValor / precoUnitario) * 100 : 0
  const negativa = margemValor < 0

  return (
    <span
      className={negativa ? 'text-red-400' : 'text-emerald-400'}
      title="Margem aproximada (visual) — não usada em relatório financeiro."
    >
      ~{formatBRL(margemValor)} (~{margemPercentual.toFixed(0)}%)
    </span>
  )
}
