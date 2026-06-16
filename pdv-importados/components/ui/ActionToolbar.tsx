/**
 * FastProduct — ActionToolbar
 *
 * Faixa de ações no canto superior direito de uma seção (regra de UX: ações
 * de página sempre à direita, filtros sempre acima/à esquerda da tabela).
 * Combina título/contagem opcional à esquerda com ações à direita.
 */

import * as React from 'react'

export function ActionToolbar({
  label,
  actions,
}: {
  label?: React.ReactNode
  actions: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="text-[12px] text-jl-fg-3">{label}</div>
      <div className="flex items-center gap-2">{actions}</div>
    </div>
  )
}
