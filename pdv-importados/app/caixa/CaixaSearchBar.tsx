"use client"

import { forwardRef, useCallback, useEffect, useRef, type FormEvent, type MutableRefObject } from "react"
import { Barcode } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { Mensagens } from "@/i18n/getMessages"
import { DragonOuroLoader } from "@/components/branding/DragonOuroLoader"
import { cn } from "@/lib/utils"

type Props = {
  m: Mensagens
  codigo: string
  onCodigoChange: (v: string) => void
  onSubmit: (e: FormEvent) => void
  onNovoCupom: () => void
  buscando: boolean
  carregandoRegras: boolean
  somAtivo: boolean
  onToggleSom: () => void
  /** Quando true, o botão «Novo cupom» não é renderizado (ex.: classic com ação no trilho). */
  hideNovoCupom?: boolean
  /** PDV clássico: reduz altura quando há texto na busca (prepara área de staging). */
  compact?: boolean
}

export const CaixaSearchBar = forwardRef<HTMLInputElement, Props>(function CaixaSearchBar(
  {
    m,
    codigo,
    onCodigoChange,
    onSubmit,
    onNovoCupom,
    buscando,
    carregandoRegras,
    somAtivo,
    onToggleSom,
    hideNovoCupom = false,
    compact = false,
  },
  forwardedRef,
) {
  const innerRef = useRef<HTMLInputElement>(null)

  // Garante foco ao montar e ao sair do modo compact — mais confiável que
  // autoFocus puro em navegação SPA e re-hidratação Next.js.
  useEffect(() => {
    if (!compact) innerRef.current?.focus()
  }, [compact])

  // Mescla innerRef (para foco imperativo) + forwardedRef (API externa).
  const setRef = useCallback(
    (el: HTMLInputElement | null) => {
      (innerRef as MutableRefObject<HTMLInputElement | null>).current = el
      if (typeof forwardedRef === "function") {
        forwardedRef(el)
      } else if (forwardedRef) {
        (forwardedRef as MutableRefObject<HTMLInputElement | null>).current = el
      }
    },
    [forwardedRef],
  )

  return (
    <div className={cn("space-y-2", compact && "space-y-1")}>
      <div className="flex items-center justify-between gap-2">
        <label
          className={cn(
            "font-semibold text-jl-fg-1",
            compact ? "text-xs" : "text-sm",
          )}
        >
          {m.caixa.busca_label_principal}
        </label>
        <Button
          type="button"
          variant="ghost"
          onClick={onToggleSom}
          className={cn(
            "h-auto rounded-md border border-jl-border-1 bg-jl-surface-soft font-semibold text-jl-fg-1 hover:bg-jl-surface-elev",
            compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-xs",
          )}
        >
          {somAtivo ? m.caixa.som_feedback_ligado : m.caixa.som_feedback_desligado}
        </Button>
      </div>
      <form
        onSubmit={onSubmit}
        className={cn("flex flex-col sm:flex-row", compact ? "gap-1.5 sm:gap-2" : "gap-2 sm:gap-3")}
      >
        {/* Input de código de barras — ponto de entrada principal */}
        <div className="relative flex-1">
          <Barcode
            className={cn(
              "absolute top-1/2 -translate-y-1/2 text-jl-fg-3 pointer-events-none",
              compact ? "left-2.5 h-4 w-4" : "left-3 h-5 w-5",
            )}
            aria-hidden
          />
          <Input
            ref={setRef}
            value={codigo}
            onChange={(e) => onCodigoChange(e.target.value)}
            placeholder={m.caixa.busca_placeholder}
            aria-label={m.caixa.busca_placeholder}
            disabled={buscando || carregandoRegras}
            data-caixa-busca="true"
            className={cn(
              "w-full app-input text-jl-fg-1 placeholder:text-jl-fg-3 rounded-md focus:outline-none focus:ring-2 focus:ring-jl-accent focus:border-transparent",
              compact
                ? "py-1.5 pl-8 pr-3 text-sm"
                : "h-14 pl-10 pr-3 text-base",
            )}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault()
                onCodigoChange("")
              }
            }}
          />
        </div>
        <div className={cn("flex gap-2 sm:shrink-0", compact && "gap-1.5")}>
          <Button
            type="submit"
            disabled={buscando || carregandoRegras}
            aria-busy={buscando || carregandoRegras}
            className={cn(
              "app-btn-accent inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-colors",
              hideNovoCupom
                ? "w-full sm:w-auto flex-1 sm:flex-none min-w-28"
                : "flex-1 sm:flex-none min-w-28",
              compact ? "px-2.5 py-1.5 text-sm" : "h-14 px-4 text-base",
            )}
          >
            {buscando || carregandoRegras ? (
              <>
                <DragonOuroLoader iconClassName="h-4 w-4" />
                {m.caixa.buscando}
              </>
            ) : (
              m.caixa.adicionar_enter
            )}
          </Button>
          {!hideNovoCupom && (
            <Button
              type="button"
              variant="secondary"
              onClick={onNovoCupom}
              className={cn(
                "flex-1 sm:flex-none bg-jl-surface-soft text-jl-fg-1 border border-jl-border-1 hover:bg-jl-surface-elev rounded-md font-semibold transition-colors",
                compact ? "px-2.5 py-1.5 text-sm" : "h-14 px-4 text-base",
              )}
            >
              {m.caixa.novo_cupom}
            </Button>
          )}
        </div>
      </form>
      {!compact ? (
        <p className="text-sm text-jl-fg-2 leading-snug">{m.caixa.busca_dica}</p>
      ) : null}
    </div>
  )
})

CaixaSearchBar.displayName = "CaixaSearchBar"
