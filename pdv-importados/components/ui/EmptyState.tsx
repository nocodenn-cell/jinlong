/**
 * FastProduct — EmptyState
 *
 * Estado vazio padrão para tabelas/listas (ícone + título + subtítulo +
 * ação opcional). Reusa o mesmo padrão visual já usado inline em
 * EstoqueTable/VendaDetailSheet, só que como componente compartilhado.
 */

import * as React from 'react'

export function EmptyState({
  icon,
  title,
  subtitle,
  action,
}: {
  icon?: React.ReactNode
  title: string
  subtitle?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-16 text-center">
      {icon ? <span className="text-4xl text-jl-fg-3">{icon}</span> : null}
      <p className="text-[14px] font-medium text-jl-fg-2">{title}</p>
      {subtitle ? <p className="text-[12px] text-jl-fg-3">{subtitle}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}
