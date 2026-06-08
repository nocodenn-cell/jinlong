"use client"

import { Button } from "@/components/ui/button"
import { SignOutButton } from "@/components/auth/SignOutButton"
import type { Mensagens } from "@/i18n/getMessages"
import type { Idioma } from "@/idioma/normalizeIdioma"
import type { ThermalStatus } from "@/hooks/useThermalPrinter"
import LanguageToggle from "@/app/caixa/idioma/LanguageToggle"
import { caixaFmt } from "@/app/caixa/caixaI18n"
import { turnoNumeroDeCaixaId } from "@/app/caixa/caixaPdvTurnoDisplay"
import type { CaixaStatusUi } from "@/app/caixa/hooks/useCaixaStatusMovimentacoes"
import { isCaixaAberto } from "@/app/caixa/hooks/useCaixaStatusMovimentacoes"
import { SquareTerminal } from "lucide-react"
import { cn } from "@/lib/utils"

export type CaixaPdvLayoutVariant = "default" | "classic"

type Props = {
  m: Mensagens
  idioma: Idioma
  layoutVariant: CaixaPdvLayoutVariant
  operadorLabel: string
  caixaStatus: CaixaStatusUi | null
  carregandoStatus?: boolean
  processandoCaixa: boolean
  onAbrirCaixa: () => void
  onFecharCaixa: () => void
  printerStatus?: ThermalStatus
  printerDeviceName?: string | null
}

export function CaixaPdvTopBar({
  m,
  idioma,
  layoutVariant,
  operadorLabel,
  caixaStatus,
  carregandoStatus = false,
  processandoCaixa,
  onAbrirCaixa,
  onFecharCaixa,
  printerStatus,
  printerDeviceName,
}: Props) {
  const fontStack =
    idioma === "zh"
      ? 'var(--font-noto-sc),"Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif'
      : undefined

  const localeString = idioma === "pt" ? "pt-BR" : "zh-CN"
  const aberto = isCaixaAberto(caixaStatus)
  const turnoText = aberto
    ? caixaFmt(m.caixa.topbar_turno_aberto, { n: turnoNumeroDeCaixaId(caixaStatus.caixaId) })
    : caixaStatus?.status === "ERRO"
      ? m.caixa.status_indisponivel
      : m.caixa.topbar_turno_fechado
  const operadorText = caixaFmt(m.caixa.topbar_operador, { nome: operadorLabel })
  const fundoText =
    !aberto || (aberto && caixaStatus.blindClosureEnabled)
      ? m.caixa.topbar_fundo_indisponivel
      : caixaFmt(m.caixa.topbar_fundo, {
          valor: `${m.caixa.moeda_prefixo} ${caixaStatus.valorSistemaDinheiro.toLocaleString(localeString, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`,
        })

  const classic = layoutVariant === "classic"

  return (
    <header
      className={cn(
        "shrink-0 px-3 sm:px-5 py-2.5 border-b flex flex-wrap items-center gap-x-3 gap-y-2",
        classic
          ? "border-border bg-primary text-primary-foreground shadow-[0_2px_3px_0px_rgba(0,0,0,0.2)]"
          : "border-jl-border-1 bg-jl-surface-elev text-jl-fg-1",
      )}
      style={fontStack ? { fontFamily: fontStack } : undefined}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
        <span
          className={cn(
            "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border",
            classic ? "border-primary-foreground/25 bg-white/10 text-primary-foreground" : "border-jl-border-1 bg-jl-surface-soft text-jl-fg-1",
          )}
          aria-hidden
        >
          <SquareTerminal className="h-5 w-5" aria-hidden />
        </span>
        <h1 className={cn("min-w-0 truncate text-base font-semibold tracking-tight sm:text-lg", classic && "text-primary-foreground")}>
          {m.caixa.topbar_titulo}
        </h1>
      </div>

      <div className="flex w-full min-w-0 flex-wrap items-center justify-end gap-x-2 gap-y-2 sm:w-auto sm:flex-nowrap">
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5 text-xs sm:text-sm">
          <span
            className={cn(
              "max-w-[11rem] truncate rounded-md border px-2 py-1 font-medium tabular-nums",
              classic ? "border-primary-foreground/30 bg-white/10" : "border-jl-border-1 bg-jl-surface-base",
            )}
            title={turnoText}
          >
            {turnoText}
          </span>
          <span
            className={cn(
              "max-w-[14rem] truncate rounded-md border px-2 py-1 font-medium",
              classic ? "border-primary-foreground/30 bg-white/10" : "border-jl-border-1 bg-jl-surface-base",
            )}
            title={operadorText}
          >
            {operadorText}
          </span>
          <span
            className={cn(
              "max-w-[12rem] truncate rounded-md border px-2 py-1 font-medium tabular-nums",
              classic ? "border-primary-foreground/30 bg-white/10" : "border-jl-border-1 bg-jl-surface-base",
            )}
            title={fundoText}
          >
            {fundoText}
          </span>
          {printerStatus && printerStatus !== "idle" && (
            <span
              title={printerDeviceName ?? "Impressora"}
              className={cn(
                "max-w-[10rem] truncate rounded-md border px-2 py-1 text-xs font-medium",
                printerStatus === "connected"
                  ? classic
                    ? "border-emerald-400/50 bg-emerald-400/20 text-emerald-100"
                    : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                  : printerStatus === "error"
                    ? classic
                      ? "border-red-400/50 bg-red-400/20 text-red-100"
                      : "border-destructive/40 bg-destructive/10 text-destructive"
                    : classic
                      ? "border-primary-foreground/30 bg-white/10"
                      : "border-jl-border-1 bg-jl-surface-base",
              )}
            >
              {printerStatus === "connected" ? "🖨 OK" : printerStatus === "error" ? "🖨 Erro" : "🖨 …"}
            </span>
          )}
        </div>

        <div
          className={cn(
            "flex shrink-0 items-center gap-1.5 border-l pl-2 sm:pl-3",
            classic ? "border-primary-foreground/25" : "border-white/[0.12]",
          )}
        >
          {aberto ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={cn(
                "text-xs font-semibold sm:text-sm",
                classic &&
                  "border-primary-foreground/40 bg-white/15 text-primary-foreground hover:bg-white/25",
              )}
              onClick={onFecharCaixa}
              disabled={processandoCaixa}
              aria-busy={processandoCaixa}
            >
              {processandoCaixa ? `${m.caixa.fechar}…` : m.caixa.fechar}
            </Button>
          ) : caixaStatus?.status === "ERRO" ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={cn(
                "text-xs font-semibold sm:text-sm",
                classic && "border-primary-foreground/40 bg-white/15 text-primary-foreground hover:bg-white/25",
              )}
              onClick={onAbrirCaixa}
              disabled={carregandoStatus}
            >
              {m.caixa.btn_tentar_novamente}
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={cn(
                "text-xs font-semibold sm:text-sm",
                classic && "border-primary-foreground/40 bg-white/15 text-primary-foreground hover:bg-white/25",
              )}
              onClick={onAbrirCaixa}
              disabled={processandoCaixa || carregandoStatus}
              aria-busy={processandoCaixa}
            >
              {processandoCaixa ? `${m.caixa.abrir}…` : m.caixa.abrir}
            </Button>
          )}
          <LanguageToggle idiomaAtual={idioma} variant="dragon" />
          <SignOutButton
            label={m.comum.sair}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium sm:text-sm",
              classic
                ? "border border-primary-foreground/35 bg-white/10 text-primary-foreground hover:bg-white/20"
                : "bg-jl-surface-soft text-jl-fg-1 border border-jl-border-1 hover:bg-jl-surface-elev",
            )}
          />
        </div>
      </div>
    </header>
  )
}
