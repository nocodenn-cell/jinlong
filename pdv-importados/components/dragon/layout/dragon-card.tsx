import { type ReactNode } from "react"
import { cn } from "@/lib/utils"

type CardProps = {
  children: ReactNode
  className?: string
  /** elevated: usa bg-jl-surface-elev (panel dentro de panel). soft: frosted-glass. */
  variant?: "default" | "elevated" | "soft"
  /** Com padding canônico px-4 py-3 */
  padded?: boolean
}

/**
 * Card canônico Dragon UI.
 * Substitui os 39 card wrappers ad-hoc com border/bg inconsistentes.
 */
export function DragonCard({ children, className, variant = "default", padded = false }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-md border",
        variant === "default" && "border-jl-border-1 bg-jl-surface-base",
        variant === "elevated" && "border-jl-border-1 bg-jl-surface-elev",
        variant === "soft" && "border-jl-border-1 bg-jl-surface-soft",
        padded && "px-4 py-3",
        className,
      )}
    >
      {children}
    </div>
  )
}

type SectionProps = {
  label: string
  children: ReactNode
  className?: string
}

/**
 * Seção com label canônico Dragon UI.
 * Combina SectionLabel + DragonCard em bloco semântico.
 */
export function DragonSection({ label, children, className }: SectionProps) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <span className="text-xs font-semibold uppercase tracking-wide text-jl-fg-3">{label}</span>
      {children}
    </div>
  )
}
