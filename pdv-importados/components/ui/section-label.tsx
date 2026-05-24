import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

type Props = {
  children: ReactNode
  className?: string
}

/**
 * Label de seção canônico Dragon UI.
 * Substitui o padrão ad-hoc: text-xs font-semibold uppercase tracking-wide text-jl-fg-3
 */
export function SectionLabel({ children, className }: Props) {
  return (
    <span className={cn("text-xs font-semibold uppercase tracking-wide text-jl-fg-3", className)}>
      {children}
    </span>
  )
}
