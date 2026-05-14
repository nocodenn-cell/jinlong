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
              ? "border border-white/35 bg-white/10 text-white hover:bg-white/20 hover:text-white"
              : "bg-secondary text-secondary-foreground border border-border",
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
            className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[min(70vh,24rem)] overflow-y-auto rounded-md border border-border bg-popover p-3 text-popover-foreground shadow-md outline-none text-xs sm:text-sm"
          >
            <p id={descricaoPainelId} className="sr-only">
              {m.caixa.aria_pd_sistema_catalogo}
            </p>
            <div className="mb-2 flex items-start justify-between gap-2 border-b border-border pb-2">
              <h2
                id={tituloPainelId}
                className="font-semibold text-foreground leading-tight"
              >
                {m.caixa.pdv_sistema_catalogo_trigger}
              </h2>
              <button
                type="button"
                className="shrink-0 rounded-sm px-2 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={m.caixa.aria_pd_sistema_catalogo_fechar}
                onClick={fecharSistema}
              >
                ×
              </button>
            </div>
            <div className="space-y-3">
              {turnoResumo ? (
                <p className="text-foreground/90 leading-snug">{turnoResumo}</p>
              ) : null}
              <p className="text-foreground/90 leading-snug">
                {m.caixa.atalhos_placeholder}
              </p>
              <p className="text-foreground/90 leading-snug">
                {m.caixa.regras_catalogo}{" "}
                <code className="text-muted-foreground">regras_preco</code>
                {carregandoRegras ? ` · ${m.caixa.regras_carregando}` : ""}
              </p>
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
              ? "border border-white/30 bg-white/5 text-white hover:bg-white/15 hover:text-white"
              : "bg-secondary text-secondary-foreground border border-border",
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
              ? "border-red-300/45 bg-red-500/15 text-red-100 hover:bg-red-500/25 hover:text-white"
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
              ? "border border-amber-200/50 bg-amber-500/20 text-amber-50 hover:bg-amber-500/30 hover:text-white"
              : "bg-yellow-900/30 text-yellow-400 border border-yellow-700",
          )}
          onClick={onValidarGerente}
          disabled={validandoGerente || movimentandoCaixa}
          aria-busy={validandoGerente}
        >
          {!gerenteValidadoAte ? (
            <ImperialSealIcon
              className={cn(
                "h-4 w-4 shrink-0",
                classic ? "text-red-950 drop-shadow-sm" : "app-accent-text",
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
