"use client"

import { memo, useCallback, useEffect, useId, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import type { Mensagens } from "@/i18n/getMessages"
import type { Idioma } from "@/idioma/normalizeIdioma"
import { ImperialSealIcon } from "@/components/icons/ImperialSealIcon"
import { caixaFmt } from "@/app/caixa/caixaI18n"
import type { CaixaStatusUi } from "@/app/caixa/hooks/useCaixaStatusMovimentacoes"
import { isCaixaAberto } from "@/app/caixa/hooks/useCaixaStatusMovimentacoes"
import { cn } from "@/lib/utils"
import { formatDecimalBRL } from "@/lib/format/money"

type Props = {
  m: Mensagens
  idioma: Idioma
  carregandoRegras: boolean
  caixaStatus: CaixaStatusUi | null
  caixaAberto: boolean
  movimentandoCaixa: boolean
  finalizando: boolean
  validandoGerente: boolean
  gerenteValidadoAte: string | null
  podeReimprimir: boolean
  onAbrirSuprimento: () => void
  onAbrirSangria: () => void
  onValidarGerente: () => void
  onHistorico: () => void
  onImprimirUltima: () => void
  onFecharCaixa: () => void
  onAbrirCaixa: () => void
  onConsultaRapida: () => void
  onSelecionarCliente: () => void
  variant?: "default" | "classic"
}

type MenuItem = {
  id: string
  label: string
  onClick: () => void
  disabled?: boolean
  destructive?: boolean
  shortcut?: string
}

function CaixaPdvOperacoesMenuImpl({
  m,
  idioma,
  carregandoRegras,
  caixaStatus,
  caixaAberto,
  movimentandoCaixa,
  finalizando,
  validandoGerente,
  gerenteValidadoAte,
  podeReimprimir,
  onAbrirSuprimento,
  onAbrirSangria,
  onValidarGerente,
  onHistorico,
  onImprimirUltima,
  onFecharCaixa,
  onAbrirCaixa,
  onConsultaRapida,
  onSelecionarCliente,
  variant = "default",
}: Props) {
  const classic = variant === "classic"
  const [menuAberto, setMenuAberto] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const painelRef = useRef<HTMLDivElement>(null)
  const painelId = useId()
  const tituloId = useId()

  const localeString = idioma === "pt" ? "pt-BR" : "zh-CN"

  const fecharMenu = useCallback(() => {
    setMenuAberto(false)
    requestAnimationFrame(() => triggerRef.current?.focus())
  }, [])

  useEffect(() => {
    if (!menuAberto) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        fecharMenu()
      }
    }
    const onPointerDown = (e: MouseEvent | PointerEvent) => {
      const t = e.target as Node
      if (painelRef.current?.contains(t) || triggerRef.current?.contains(t)) return
      fecharMenu()
    }
    document.addEventListener("keydown", onKey)
    document.addEventListener("pointerdown", onPointerDown, true)
    return () => {
      document.removeEventListener("keydown", onKey)
      document.removeEventListener("pointerdown", onPointerDown, true)
    }
  }, [menuAberto, fecharMenu])

  useEffect(() => {
    if (menuAberto) painelRef.current?.focus()
  }, [menuAberto])

  const runAndClose = useCallback(
    (fn: () => void) => {
      fecharMenu()
      fn()
    },
    [fecharMenu],
  )

  const busy = movimentandoCaixa || finalizando
  const itens: MenuItem[] = [
    {
      id: "consulta",
      label: m.caixa.operacoes_consulta_rapida,
      shortcut: "F3",
      onClick: () => runAndClose(onConsultaRapida),
    },
    {
      id: "cliente",
      label: m.caixa.selecionar_cliente_titulo,
      shortcut: "Alt+C",
      disabled: busy,
      onClick: () => runAndClose(onSelecionarCliente),
    },
    {
      id: "suprimento",
      label: m.caixa.suprimento,
      shortcut: "Ctrl+Shift+S",
      disabled: !caixaAberto || busy,
      onClick: () => runAndClose(onAbrirSuprimento),
    },
    {
      id: "sangria",
      label: m.caixa.sangria,
      shortcut: "Ctrl+Shift+R",
      disabled: !caixaAberto || busy,
      onClick: () => runAndClose(onAbrirSangria),
    },
    {
      id: "historico",
      label: m.caixa.operacoes_historico,
      onClick: () => runAndClose(onHistorico),
    },
    {
      id: "imprimir",
      label: m.caixa.operacoes_imprimir_ultima,
      shortcut: "F12",
      disabled: !podeReimprimir,
      onClick: () => runAndClose(onImprimirUltima),
    },
  ]

  if (caixaAberto) {
    itens.push({
      id: "fechar",
      label: m.caixa.fechar,
      shortcut: "F6",
      destructive: true,
      disabled: busy,
      onClick: () => runAndClose(onFecharCaixa),
    })
  } else {
    itens.push({
      id: "abrir",
      label: m.caixa.abrir,
      disabled: busy,
      onClick: () => runAndClose(onAbrirCaixa),
    })
  }

  const turnoResumo = isCaixaAberto(caixaStatus)
    ? caixaFmt(m.caixa.pdv_sistema_turno_resumo, {
        data: new Date(caixaStatus.dataAbertura).toLocaleString(localeString),
        valor: `${m.caixa.moeda_prefixo} ${formatDecimalBRL(caixaStatus.valorInicial)}`,
      })
    : null

  const itemClass = (item: MenuItem) =>
    cn(
      "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40",
      item.destructive
        ? classic
          ? "text-destructive hover:bg-destructive/10"
          : "text-[var(--color-danger-strong)] hover:bg-[var(--color-danger-bg)]"
        : classic
          ? "text-foreground hover:bg-muted"
          : "text-jl-fg-1 hover:bg-white/[0.06]",
    )

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Button
          ref={triggerRef}
          type="button"
          variant="secondary"
          className={cn(
            "w-full min-h-11 text-xs sm:text-sm",
            classic
              ? "border border-border bg-secondary text-secondary-foreground hover:bg-secondary/80"
              : "border border-jl-border-1 bg-jl-surface-soft text-jl-fg-1 hover:bg-white/[0.06]",
          )}
          aria-expanded={menuAberto}
          aria-haspopup="menu"
          aria-controls={menuAberto ? painelId : undefined}
          onClick={() => setMenuAberto((v) => !v)}
        >
          {m.caixa.rail_titulo_operacoes}
        </Button>
        {menuAberto ? (
          <div
            ref={painelRef}
            id={painelId}
            role="menu"
            aria-labelledby={tituloId}
            tabIndex={-1}
            className={cn(
              "absolute left-0 right-0 top-full z-50 mt-1 max-h-[min(70vh,28rem)] overflow-y-auto rounded-md border p-2 shadow-md outline-none",
              classic
                ? "border-border bg-card text-foreground"
                : "border-jl-border-1 bg-jl-surface-elev text-jl-fg-1",
            )}
          >
            <p
              id={tituloId}
              className={cn(
                "mb-1.5 px-2 text-small font-semibold uppercase tracking-wide",
                classic ? "text-muted-foreground" : "text-jl-fg-3",
              )}
            >
              {m.caixa.rail_titulo_operacoes}
            </p>
            {turnoResumo ? (
              <p
                className={cn(
                  "mb-2 border-b px-2 pb-2 text-xs leading-snug",
                  classic ? "border-border text-muted-foreground" : "border-jl-border-1 text-jl-fg-3",
                )}
              >
                {turnoResumo}
              </p>
            ) : (
              <p
                className={cn(
                  "mb-2 border-b px-2 pb-2 text-xs italic",
                  classic ? "border-border text-muted-foreground" : "border-jl-border-1 text-jl-fg-3",
                )}
              >
                {m.caixa.topbar_turno_fechado}
              </p>
            )}
            {carregandoRegras ? (
              <p className={cn("mb-2 px-2 text-xs", classic ? "text-muted-foreground" : "text-jl-fg-3")}>
                {m.caixa.regras_carregando}
              </p>
            ) : null}
            <ul className="flex flex-col gap-0.5">
              {itens.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={item.disabled}
                    className={itemClass(item)}
                    onClick={item.onClick}
                  >
                    <span>{item.label}</span>
                    {item.shortcut ? (
                      <span
                        className={cn(
                          "shrink-0 text-caption font-normal tabular-nums",
                          classic ? "text-muted-foreground" : "text-jl-fg-3",
                        )}
                      >
                        {item.shortcut}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <Button
        type="button"
        variant="secondary"
        className={cn(
          "inline-flex min-h-11 w-full items-center justify-center gap-2",
          classic
            ? "border border-primary/50 bg-primary/10 text-primary hover:bg-primary/20"
            : "border border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] text-[var(--color-warning-strong)] hover:bg-[var(--color-warning)]/20",
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
  )
}

export const CaixaPdvOperacoesMenu = memo(CaixaPdvOperacoesMenuImpl)
