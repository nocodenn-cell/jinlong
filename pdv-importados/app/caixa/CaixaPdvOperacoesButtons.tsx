"use client"

import { useCallback, useEffect, useId, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import type { Mensagens } from "@/i18n/getMessages"
import type { Idioma } from "@/idioma/normalizeIdioma"
import { ImperialSealIcon } from "@/components/icons/ImperialSealIcon"
import { caixaFmt } from "@/app/caixa/caixaI18n"
import { cn } from "@/lib/utils"

export type CaixaPdvOperacoesCaixaStatus =
  | {
      aberto: true
      caixaId: string
      dataAbertura: string
      valorInicial: number
      valorSistemaDinheiro: number
      blindClosureEnabled: boolean
    }
  | { aberto: false }
  | null

type Props = {
  m: Mensagens
  idioma: Idioma
  carregandoRegras: boolean
  caixaStatus: CaixaPdvOperacoesCaixaStatus
  caixaAberto: boolean
  movimentandoCaixa: boolean
  finalizando: boolean
  validandoGerente: boolean
  gerenteValidadoAte: string | null
  onAbrirSuprimento: () => void
  onAbrirSangria: () => void
  onValidarGerente: () => void
  /** PDV clássico: botões em contraste com trilho / faixa mobile azul (alinhado à TopBar). */
  variant?: "default" | "classic"
}

export function CaixaPdvOperacoesButtons({
  m,
  idioma,
  carregandoRegras,
  caixaStatus,
  caixaAberto,
  movimentandoCaixa,
  finalizando,
  validandoGerente,
  gerenteValidadoAte,
  onAbrirSuprimento,
  onAbrirSangria,
  onValidarGerente,
  variant = "default",
}: Props) {
  const classic = variant === "classic"
  const [sistemaAberto, setSistemaAberto] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const painelRef = useRef<HTMLDivElement>(null)
  const painelId = useId()
  const tituloPainelId = useId()
  const descricaoPainelId = useId()

  const localeString = idioma === "pt" ? "pt-BR" : "zh-CN"

  const fecharSistema = useCallback(() => {
    setSistemaAberto(false)
    requestAnimationFrame(() => triggerRef.current?.focus())
  }, [])

  useEffect(() => {
    if (!sistemaAberto) return

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        fecharSistema()
      }
    }
    const onPointerDown = (e: MouseEvent | PointerEvent) => {
      const t = e.target as Node
      if (
        painelRef.current?.contains(t) ||
        triggerRef.current?.contains(t)
      ) {
        return
      }
      fecharSistema()
    }

    document.addEventListener("keydown", onKey)
    document.addEventListener("pointerdown", onPointerDown, true)
    return () => {
      document.removeEventListener("keydown", onKey)
      document.removeEventListener("pointerdown", onPointerDown, true)
    }
  }, [sistemaAberto, fecharSistema])

  useEffect(() => {
    if (sistemaAberto) {
      painelRef.current?.focus()
    }
  }, [sistemaAberto])

  const turnoResumo =
    caixaStatus?.aberto === true
      ? caixaFmt(m.caixa.pdv_sistema_turno_resumo, {
          data: new Date(caixaStatus.dataAbertura).toLocaleString(localeString),
          valor: `${m.caixa.moeda_prefixo} ${caixaStatus.valorInicial.toFixed(2)}`,
        })
      : null

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Button
          ref={triggerRef}
          type="button"
          variant="secondary"
          className={cn(
            "w-full text-xs sm:text-sm",
            classic
              ? "border border-border bg-secondary text-secondary-foreground hover:bg-secondary/80"
              : "border border-jl-border-1 bg-jl-surface-soft text-jl-fg-1 hover:bg-white/[0.06]",
          )}
          aria-expanded={sistemaAberto}
          aria-haspopup="dialog"
          aria-controls={sistemaAberto ? painelId : undefined}
          onClick={() => setSistemaAberto((v) => !v)}
        >
          {m.caixa.pdv_sistema_catalogo_trigger}
        </Button>
        {sistemaAberto ? (
          <div
            ref={painelRef}
            id={painelId}
            role="dialog"
            aria-modal="true"
            aria-labelledby={tituloPainelId}
            aria-describedby={descricaoPainelId}
            tabIndex={-1}
            className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[min(70vh,24rem)] overflow-y-auto rounded-md border border-jl-border-1 bg-jl-surface-elev p-3 text-jl-fg-1 shadow-md outline-none text-xs sm:text-sm"
          >
            <p id={descricaoPainelId} className="sr-only">
              {m.caixa.aria_pd_sistema_catalogo}
            </p>
            <div className="mb-2 flex items-start justify-between gap-2 border-b border-jl-border-1 pb-2">
              <h2
                id={tituloPainelId}
                className="font-semibold text-jl-fg-1 leading-tight"
              >
                {m.caixa.pdv_sistema_catalogo_trigger}
              </h2>
              <button
                type="button"
                className="shrink-0 rounded-sm px-2 py-0.5 text-jl-fg-3 hover:bg-white/10 hover:text-jl-fg-1"
                aria-label={m.caixa.aria_pd_sistema_catalogo_fechar}
                onClick={fecharSistema}
              >
                ×
              </button>
            </div>
            <div className="space-y-3">
              {turnoResumo ? (
                <p className="text-foreground/90 leading-snug">{turnoResumo}</p>
              ) : (
                <p className="text-foreground/60 leading-snug text-xs italic">
                  {m.caixa.topbar_turno_fechado}
                </p>
              )}
              {carregandoRegras && (
                <p className="text-xs text-muted-foreground">{m.caixa.regras_carregando}</p>
              )}
            </div>
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          className={cn(
            classic
              ? "border border-border bg-secondary text-secondary-foreground hover:bg-secondary/80"
              : "border border-jl-border-1 bg-jl-surface-soft text-jl-fg-1 hover:bg-white/[0.06]",
          )}
          onClick={onAbrirSuprimento}
          disabled={!caixaAberto || movimentandoCaixa || finalizando}
          aria-busy={movimentandoCaixa}
          title="Ctrl+Shift+S"
        >
          {m.caixa.suprimento} (+)
        </Button>
        <Button
          type="button"
          variant="secondary"
          className={cn(
            classic
              ? "border-destructive/45 bg-destructive/10 text-destructive hover:bg-destructive/20"
              : "border-destructive/45 bg-destructive/15 text-destructive hover:bg-destructive/25",
          )}
          onClick={onAbrirSangria}
          disabled={!caixaAberto || movimentandoCaixa || finalizando}
          aria-busy={movimentandoCaixa}
          title="Ctrl+Shift+R"
        >
          {m.caixa.sangria} (-)
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          className={cn(
            "inline-flex items-center gap-2",
            classic
              ? "border border-primary/50 bg-primary/10 text-primary hover:bg-primary/20"
              : "border border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20",
          )}
          onClick={onValidarGerente}
          disabled={validandoGerente || movimentandoCaixa}
          aria-busy={validandoGerente}
        >
          {!gerenteValidadoAte ? (
            <ImperialSealIcon
              className={cn(
                "h-4 w-4 shrink-0",
                classic ? "text-primary drop-shadow-sm" : "app-accent-text",
              )}
              title={m.caixa.aria_selo_gerente}
              pulse
            />
          ) : null}
          {validandoGerente ? m.caixa.validando_gerente : m.caixa.validar_gerente}
        </Button>
      </div>
    </div>
  )
}
