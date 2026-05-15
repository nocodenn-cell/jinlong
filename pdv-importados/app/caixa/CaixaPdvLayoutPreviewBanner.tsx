"use client"

import type { Mensagens } from "@/i18n/getMessages"
import { Info } from "lucide-react"

type Props = Readonly<{
  m: Mensagens
}>

/** Aviso quando `NEXT_PUBLIC_CAIXA_PDV_LAYOUT=classic` — visibilidade: `CaixaPageClient` (env `NEXT_PUBLIC_CAIXA_PDV_LAYOUT_PREVIEW_BANNER` + `NODE_ENV`). Texto em `m.caixa.layout_preview_banner`. */
export function CaixaPdvLayoutPreviewBanner({ m }: Props) {
  return (
    <div
      role="region"
      aria-label={m.caixa.layout_preview_banner_aria}
      className="mx-4 mt-3 flex gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5 text-sm text-primary shadow-sm sm:mx-6"
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0 opacity-90" aria-hidden />
      <p className="min-w-0 leading-snug">{m.caixa.layout_preview_banner}</p>
    </div>
  )
}
