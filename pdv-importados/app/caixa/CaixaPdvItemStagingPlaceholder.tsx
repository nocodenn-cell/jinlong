"use client"

import { memo } from "react"
import type { Mensagens } from "@/i18n/getMessages"
import { Package } from "lucide-react"
import { cn } from "@/lib/utils"

type Props = Readonly<{
  m: Mensagens
  /** Reduz padding quando a busca está em modo compacto (código digitado). */
  dense?: boolean
}>

/** Área reservada para quantidade / desconto / confirmar item (Fase D). */
export const CaixaPdvItemStagingPlaceholder = memo(function CaixaPdvItemStagingPlaceholder({ m, dense }: Props) {
  return (
    <section
      aria-label={m.caixa.pdv_item_staging_aria}
      className={cn(
        "flex min-h-0 flex-1 flex-col justify-center rounded-lg border border-dashed border-border/70 bg-muted/20 px-3 py-4 text-center",
        dense ? "py-2" : "py-4",
      )}
    >
      <div className="mx-auto flex max-w-[18rem] flex-col items-center gap-2">
        <Package
          className="h-10 w-10 shrink-0 text-muted-foreground/50"
          strokeWidth={1.25}
          aria-hidden
        />
        <p className="text-sm font-semibold text-foreground/90">
          {m.caixa.pdv_item_staging_titulo}
        </p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {m.caixa.pdv_item_staging_desc}
        </p>
      </div>
    </section>
  )
})

CaixaPdvItemStagingPlaceholder.displayName = "CaixaPdvItemStagingPlaceholder"
