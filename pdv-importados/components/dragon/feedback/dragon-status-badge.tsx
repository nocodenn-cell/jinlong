import { cn } from "@/lib/utils"

export type DragonBadgeVariant =
  | "default"
  | "success"
  | "warning"
  | "destructive"
  | "info"
  | "muted"

type Props = {
  children: React.ReactNode
  variant?: DragonBadgeVariant
  dot?: boolean
  className?: string
}

const VARIANT_CLASSES: Record<DragonBadgeVariant, string> = {
  default:     "border-jl-border-1 bg-jl-surface-soft text-jl-fg-2",
  success:     "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  warning:     "border-amber-500/40 bg-amber-500/10 text-amber-400",
  destructive: "border-destructive/45 bg-destructive/15 text-destructive",
  info:        "border-blue-500/30 bg-blue-500/10 text-blue-400",
  muted:       "border-transparent bg-muted/60 text-muted-foreground",
}

const DOT_CLASSES: Record<DragonBadgeVariant, string> = {
  default:     "bg-jl-fg-3",
  success:     "bg-emerald-400",
  warning:     "bg-amber-400",
  destructive: "bg-destructive",
  info:        "bg-blue-400",
  muted:       "bg-muted-foreground",
}

/**
 * Badge/chip de status canônico Dragon UI.
 * Substitui os 26 padrões badge ad-hoc com rounded-full inconsistente.
 */
export function DragonStatusBadge({ children, variant = "default", dot = false, className }: Props) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        VARIANT_CLASSES[variant],
        className,
      )}
    >
      {dot && <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", DOT_CLASSES[variant])} />}
      {children}
    </span>
  )
}
