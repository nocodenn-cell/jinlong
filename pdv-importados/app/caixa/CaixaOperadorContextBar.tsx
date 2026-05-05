"use client"

import type { Mensagens } from "@/i18n/getMessages"
import type { Idioma } from "@/idioma/normalizeIdioma"

type Props = {
  m: Mensagens
  idioma: Idioma
}

export function CaixaOperadorContextBar({ m }: Props) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3 rounded-lg border border-border px-3 py-2 text-[11px] sm:text-xs bg-muted/50 text-muted-foreground">
      <div className="flex items-start gap-2 min-w-0">
        <span
          className="shrink-0 mt-0.5 inline-block h-1.5 w-1.5 rounded-full bg-primary"
          aria-hidden
        />
        <p className="leading-snug min-w-0">
          <span>{m.caixa.leadtime_banner}</span>
        </p>
      </div>
    </div>
  )
}
