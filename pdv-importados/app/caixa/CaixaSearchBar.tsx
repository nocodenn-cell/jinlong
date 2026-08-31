"use client"

import { forwardRef, useCallback, useEffect, useRef, type FormEvent, type MutableRefObject } from "react"
import { Volume2, VolumeX } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/forms"
import type { Mensagens } from "@/i18n/getMessages"
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
  /**
   * Navegação por teclado da lista de candidatos (Onda 2 · Bloco 1) — só ativa
   * quando `temCandidatos` é true; do contrário ArrowDown/ArrowUp/Enter seguem
   * o comportamento normal do campo (Enter submete a busca).
   */
  temCandidatos?: boolean
  onNavegarCandidato?: (direcao: 1 | -1) => void
  onSelecionarCandidatoAtivo?: () => void
  onFecharCandidatos?: () => void
  /** ID da opção ativa na lista de candidatos — anuncia a seleção por teclado a leitores de tela. */
  candidatoAtivoId?: string
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
    temCandidatos = false,
    onNavegarCandidato,
    onSelecionarCandidatoAtivo,
    onFecharCandidatos,
    candidatoAtivoId,
  },
  forwardedRef,
) {
  const innerRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!compact) innerRef.current?.focus()
  }, [compact])

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

  const busy = buscando || carregandoRegras

  return (
    <div className={cn("space-y-2", compact && "space-y-1")}>
      <div className="flex items-center justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onToggleSom}
          aria-label={somAtivo ? m.caixa.som_feedback_ligado : m.caixa.som_feedback_desligado}
          title={somAtivo ? m.caixa.som_feedback_ligado : m.caixa.som_feedback_desligado}
          className="px-1.5 py-0.5 text-fg-subtle hover:text-fg"
        >
          {somAtivo ? <Volume2 className="h-4 w-4" aria-hidden /> : <VolumeX className="h-4 w-4" aria-hidden />}
        </Button>
      </div>
      <form
        onSubmit={onSubmit}
        className={cn("flex flex-col sm:flex-row", compact ? "gap-1.5 sm:gap-2" : "gap-2 sm:gap-3")}
      >
        <div className="flex-1">
          <Input
            ref={setRef}
            value={codigo}
            onChange={(e) => onCodigoChange(e.target.value)}
            placeholder={m.caixa.busca_placeholder}
            aria-label={m.caixa.busca_placeholder}
            disabled={busy}
            data-caixa-busca="true"
            className={cn(
              "w-full",
              compact ? "py-1.5 text-body" : "h-14 text-subtitle",
            )}
            role={temCandidatos ? "combobox" : undefined}
            aria-expanded={temCandidatos}
            aria-controls={temCandidatos ? "caixa-candidatos-listbox" : undefined}
            aria-activedescendant={temCandidatos ? candidatoAtivoId : undefined}
            onKeyDown={(e) => {
              if (temCandidatos) {
                if (e.key === "ArrowDown") {
                  e.preventDefault()
                  onNavegarCandidato?.(1)
                  return
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault()
                  onNavegarCandidato?.(-1)
                  return
                }
                if (e.key === "Enter") {
                  e.preventDefault()
                  onSelecionarCandidatoAtivo?.()
                  return
                }
                if (e.key === "Escape") {
                  e.preventDefault()
                  onFecharCandidatos?.()
                  onCodigoChange("")
                  return
                }
              }
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
            variant="primary"
            disabled={busy}
            loading={busy}
            className={cn(
              hideNovoCupom
                ? "w-full min-w-[7rem] flex-1 sm:w-auto sm:flex-none"
                : "min-w-[7rem] flex-1 sm:flex-none",
              compact ? "px-2.5 py-1.5 text-body" : "h-14 px-4 text-subtitle",
            )}
          >
            {busy ? m.caixa.buscando : m.caixa.adicionar_enter}
          </Button>
          {!hideNovoCupom && (
            <Button
              type="button"
              variant="secondary"
              onClick={onNovoCupom}
              className={cn(
                "flex-1 sm:flex-none",
                compact ? "px-2.5 py-1.5 text-body" : "h-14 px-4 text-subtitle",
              )}
            >
              {m.caixa.novo_cupom}
            </Button>
          )}
        </div>
      </form>
      {!compact ? (
        <p className="text-body leading-snug text-fg-muted">{m.caixa.busca_dica}</p>
      ) : null}
    </div>
  )
})

CaixaSearchBar.displayName = "CaixaSearchBar"
