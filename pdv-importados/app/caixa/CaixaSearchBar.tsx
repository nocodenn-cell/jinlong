"use client"

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type FormEvent,
} from "react"
import { Barcode } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { Mensagens } from "@/i18n/getMessages"
import { DragonOuroLoader } from "@/components/branding/DragonOuroLoader"
import { cn } from "@/lib/utils"

type CategoriaChip = { id: string; nome: string }

/** Handle imperativo exposto pelo forwardRef — permite que o pai limpe/foque sem manter estado. */
export type CaixaSearchBarHandle = {
  focus: () => void
  clear: () => void
  getValue: () => string
}

type Props = {
  m: Mensagens
  onSubmit: (e: FormEvent) => void
  onNovoCupom: () => void
  buscando: boolean
  carregandoRegras: boolean
  categoriasAtalho?: CategoriaChip[]
  /** Quando true, o botão «Novo cupom» não é renderizado (ex.: classic com ação no trilho). */
  hideNovoCupom?: boolean
  /**
   * Chamado somente nas transições vazio↔com-texto.
   * Permite que o pai ajuste o staging placeholder sem re-renderizar no ritmo da digitação.
   */
  onHasText?: (hasText: boolean) => void
  /** Quando true, aplica borda vermelha temporária para sinalizar produto não encontrado. */
  hasError?: boolean
}

export const CaixaSearchBar = forwardRef<CaixaSearchBarHandle, Props>(function CaixaSearchBar(
  {
    m,
    onSubmit,
    onNovoCupom,
    buscando,
    carregandoRegras,
    categoriasAtalho = [],
    hideNovoCupom = false,
    onHasText,
    hasError = false,
  },
  forwardedRef,
) {
  // Estado local isolado: re-renderiza apenas este componente a cada bipe/tecla,
  // nunca o CaixaPageClient pai (carrinho + totais permanecem intocados).
  const [codigoLocal, setCodigoLocal] = useState("")
  const [atalhoExpandido, setAtalhoExpandido] = useState(false)
  const compact = codigoLocal.trim().length > 0

  const innerRef = useRef<HTMLInputElement>(null)

  // Garante foco ao montar e ao sair do modo compact.
  useEffect(() => {
    if (!compact) innerRef.current?.focus()
  }, [compact])

  // Notifica o pai apenas nas transições vazio↔com-texto (nunca por keystroke).
  const prevHasTextRef = useRef(false)
  useEffect(() => {
    const hasText = compact
    if (hasText !== prevHasTextRef.current) {
      prevHasTextRef.current = hasText
      onHasText?.(hasText)
    }
  }, [compact, onHasText])

  useImperativeHandle(
    forwardedRef,
    () => ({
      focus: () => innerRef.current?.focus(),
      clear: () => setCodigoLocal(""),
      getValue: () => codigoLocal,
    }),
    [codigoLocal],
  )

  return (
    <div className={cn("space-y-2", compact && "space-y-1")}>
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
            ref={innerRef}
            value={codigoLocal}
            onChange={(e) => setCodigoLocal(e.target.value)}
            placeholder={m.caixa.busca_placeholder}
            aria-label={m.caixa.busca_placeholder}
            disabled={buscando || carregandoRegras}
            className={cn(
              "w-full bg-jl-surface-soft border-2 text-foreground placeholder:text-foreground/70 rounded-md focus:outline-none focus:ring-2 focus:border-transparent transition-colors",
              hasError
                ? "border-destructive shadow-[0_0_0_1px_rgba(239,68,68,0.4)] focus:ring-destructive"
                : "border-amber-400/60 shadow-[0_0_0_1px_rgba(251,191,36,0.25)] focus:ring-jl-accent",
              compact
                ? "py-1.5 pl-8 pr-3 text-sm"
                : "h-14 pl-10 pr-3 text-base",
            )}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault()
                setCodigoLocal("")
              }
            }}
          />
        </div>
        <div className={cn("flex gap-2 sm:shrink-0", compact && "gap-1.5")}>
          <Button
            type="submit"
            disabled={buscando || carregandoRegras}
            aria-busy={buscando}
            className={cn(
              "app-btn-accent inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-colors",
              hideNovoCupom
                ? "w-full sm:w-auto flex-1 sm:flex-none min-w-[7rem]"
                : "flex-1 sm:flex-none min-w-[7rem]",
              compact ? "px-2.5 py-1.5 text-sm" : "h-14 px-4 text-base",
            )}
          >
            {buscando ? (
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
      {categoriasAtalho.length > 0 && !compact ? (
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => setAtalhoExpandido((v) => !v)}
            className="flex items-center gap-1 text-[11px] text-jl-fg-3 hover:text-jl-fg-1 transition-colors"
          >
            <span>{atalhoExpandido ? "▾" : "▸"}</span>
            <span>{m.caixa.atalhos_categoria}</span>
          </button>
          {atalhoExpandido && (
            <div className="flex flex-wrap gap-1.5">
              {categoriasAtalho.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  disabled={buscando || carregandoRegras}
                  onClick={() => { setCodigoLocal(c.nome); setAtalhoExpandido(false) }}
                  title={c.nome}
                  className="min-h-8 shrink-0 rounded-full border border-jl-border-1 bg-jl-surface-soft px-3 py-0.5 text-sm text-jl-fg-2 transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jl-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
                >
                  {c.nome}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
})

CaixaSearchBar.displayName = "CaixaSearchBar"
