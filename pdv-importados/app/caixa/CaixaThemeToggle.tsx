"use client"

import { Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Mensagens } from "@/i18n/getMessages"
import type { CaixaPdvLayoutVariant } from "@/app/caixa/CaixaPdvTopBar"
import { cn } from "@/lib/utils"

type Props = {
  m: Mensagens
  layoutVariant: CaixaPdvLayoutVariant
  onToggle: () => void
  className?: string
}

/**
 * Toggle claro/escuro do Caixa (canto superior direito do topbar). Alterna
 * `layoutVariant` em runtime — a escolha é persistida por
 * `useCaixaLayoutPreference` (localStorage), não afeta outros módulos
 * (Gerente/Admin continuam travados em tema claro único).
 */
export function CaixaThemeToggle({ m, layoutVariant, onToggle, className }: Props) {
  const classic = layoutVariant === "classic"
  const label = classic ? m.caixa.tema_alternar_para_escuro : m.caixa.tema_alternar_para_claro

  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className={cn(
        "text-xs font-medium px-2 py-1.5 h-auto",
        classic ? "text-primary-foreground hover:bg-white/15" : "text-jl-fg-2 hover:bg-white/[0.06]",
        className,
      )}
      onClick={onToggle}
      title={label}
      aria-label={label}
    >
      {classic ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
    </Button>
  )
}
