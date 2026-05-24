"use client"

import { type ReactNode } from "react"
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react"
import { DragonOuroLoader } from "@/components/branding/DragonOuroLoader"
import { cn } from "@/lib/utils"

// ─────────────────────────────────────────────
// LOADING
// ─────────────────────────────────────────────

type LoadingProps = {
  label?: string
  size?: "sm" | "md" | "lg"
  className?: string
}

/**
 * Estado de loading canônico Dragon UI.
 * Para loading inline de botão use DragonOuroLoader diretamente.
 */
export function DragonLoadingState({ label, size = "md", className }: LoadingProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 py-8", className)}>
      <DragonOuroLoader
        iconClassName={cn(
          size === "sm" && "h-5 w-5",
          size === "md" && "h-8 w-8",
          size === "lg" && "h-12 w-12",
        )}
      />
      {label && <p className="text-sm text-jl-fg-3">{label}</p>}
    </div>
  )
}

// ─────────────────────────────────────────────
// INLINE FEEDBACK BANNER
// ─────────────────────────────────────────────

type BannerVariant = "success" | "warning" | "error" | "info"

type BannerProps = {
  variant: BannerVariant
  children: ReactNode
  className?: string
}

const BANNER_STYLES: Record<BannerVariant, { wrap: string; icon: ReactNode }> = {
  success: {
    wrap: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    icon: <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden />,
  },
  warning: {
    wrap: "border-amber-500/40 bg-amber-500/10 text-amber-300",
    icon: <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" aria-hidden />,
  },
  error: {
    wrap: "border-destructive/40 bg-destructive/10 text-destructive",
    icon: <XCircle className="h-4 w-4 shrink-0 text-destructive" aria-hidden />,
  },
  info: {
    wrap: "border-blue-500/30 bg-blue-500/10 text-blue-300",
    icon: <Info className="h-4 w-4 shrink-0 text-blue-400" aria-hidden />,
  },
}

/**
 * Banner de feedback inline canônico Dragon UI.
 * Hierarquia: error > warning > success > info.
 */
export function DragonFeedbackBanner({ variant, children, className }: BannerProps) {
  const { wrap, icon } = BANNER_STYLES[variant]
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={cn("flex items-center gap-2 rounded-md border px-3 py-2 text-sm", wrap, className)}
    >
      {icon}
      <span className="leading-snug">{children}</span>
    </div>
  )
}

// ─────────────────────────────────────────────
// DISABLED OVERLAY (para seções inteiras desabilitadas)
// ─────────────────────────────────────────────

type DisabledProps = {
  children: ReactNode
  disabled: boolean
  className?: string
}

/**
 * Wrapper que aplica estado disabled com opacidade e pointer-events-none.
 * Use quando um bloco inteiro está bloqueado (ex: caixa fechado).
 */
export function DragonDisabledSection({ children, disabled, className }: DisabledProps) {
  return (
    <div
      className={cn(
        "transition-opacity",
        disabled && "pointer-events-none select-none opacity-40",
        className,
      )}
      aria-disabled={disabled || undefined}
    >
      {children}
    </div>
  )
}
