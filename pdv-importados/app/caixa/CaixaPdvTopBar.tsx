"use client"

import { Button } from "@/components/ui/button"
import { SignOutButton } from "@/components/auth/SignOutButton"
import type { Mensagens } from "@/i18n/getMessages"
import type { Idioma } from "@/idioma/normalizeIdioma"
import LanguageToggle from "@/app/caixa/idioma/LanguageToggle"
import { caixaFmt } from "@/app/caixa/caixaI18n"
import { turnoNumeroDeCaixaId } from "@/app/caixa/caixaPdvTurnoDisplay"
import { Menu, SquareTerminal } from "lucide-react"
import { cn } from "@/lib/utils"

export type CaixaPdvLayoutVariant = "default" | "classic"

type CaixaStatusTop =
  | {
      aberto: true
      caixaId: string
      valorSistemaDinheiro: number
      blindClosureEnabled: boolean
    }
  | { aberto: false }
  | null

type Props = {
  m: Mensagens
  idioma: Idioma
  layoutVariant: CaixaPdvLayoutVariant
  operadorLabel: string
  caixaStatus: CaixaStatusTop
  processandoCaixa: boolean
  onAbrirCaixa: () => void
  onFecharCaixa: () => void
}

export function CaixaPdvTopBar({
  m,
  idioma,
  layoutVariant,
  operadorLabel,
  caixaStatus,
  processandoCaixa,
  onAbrirCaixa,
  onFecharCaixa,
}: Props) {
  const fontStack =
    idioma === "zh"
      ? 'var(--font-noto-sc),"Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif'
      : undefined

  const localeString = idioma === "pt" ? "pt-BR" : "zh-CN"
  const turnoText =
    caixaStatus?.aberto === true
      ? caixaFmt(m.caixa.topbar_turno_aberto, {
          n: turnoNumeroDeCaixaId(caixaStatus.caixaId),
        })
      : m.caixa.topbar_turno_fechado
  const operadorText = caixaFmt(m.caixa.topbar_operador, { nome: operadorLabel })
  const fundoText =
    caixaStatus?.aberto !== true || caixaStatus.blindClosureEnabled
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
          ? "border-blue-800/80 bg-gradient-to-r from-blue-900 via-blue-800 to-blue-700 text-white shadow-sm"
          : "border-border bg-card text-foreground",
      )}
      style={fontStack ? { fontFamily: fontStack } : undefined}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            "shrink-0 h-9 w-9",
            classic ? "text-white hover:bg-white/15 hover:text-white" : "text-foreground",
          )}
          aria-label={m.caixa.topbar_menu_aria}
          title={m.caixa.topbar_menu_aria}
          disabled
        >
          <Menu className="h-5 w-5" aria-hidden />
        </Button>
        <span
          className={cn(
            "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border",
            classic ? "border-white/25 bg-white/10 text-white" : "border-border bg-muted/40 text-foreground",
          )}
          aria-hidden
        >
          <SquareTerminal className="h-5 w-5" aria-hidden />
        </span>
        <h1 className={cn("min-w-0 truncate text-base font-semibold tracking-tight sm:text-lg", classic && "text-white")}>
          {m.caixa.topbar_titulo}
        </h1>
      </div>

      <div className="flex w-full min-w-0 flex-wrap items-center justify-end gap-x-2 gap-y-2 sm:w-auto sm:flex-nowrap">
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5 text-xs sm:text-sm">
          <span
            className={cn(
              "max-w-[11rem] truncate rounded-md border px-2 py-1 font-medium tabular-nums",
              classic ? "border-white/30 bg-white/10" : "border-border bg-muted/30",
            )}
            title={turnoText}
          >
            {turnoText}
          </span>
          <span
            className={cn(
              "max-w-[14rem] truncate rounded-md border px-2 py-1 font-medium",
              classic ? "border-white/30 bg-white/10" : "border-border bg-muted/30",
            )}
            title={operadorText}
          >
            {operadorText}
          </span>
          <span
            className={cn(
              "max-w-[12rem] truncate rounded-md border px-2 py-1 font-medium tabular-nums",
              classic ? "border-white/30 bg-white/10" : "border-border bg-muted/30",
            )}
            title={fundoText}
          >
            {fundoText}
          </span>
        </div>

        <div
          className={cn(
            "flex shrink-0 items-center gap-1.5 border-l pl-2 sm:pl-3",
            classic ? "border-white/25" : "border-border/60",
          )}
        >
          {caixaStatus?.aberto ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={cn(
                "text-xs font-semibold sm:text-sm",
                classic &&
                  "border-amber-200/80 bg-amber-500/20 text-amber-50 hover:bg-amber-500/30 hover:text-white",
              )}
              onClick={onFecharCaixa}
              disabled={processandoCaixa}
              aria-busy={processandoCaixa}
            >
              {processandoCaixa ? `${m.caixa.fechar}…` : m.caixa.fechar}
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={cn(
                "text-xs font-semibold sm:text-sm",
                classic && "border-emerald-200/70 bg-emerald-500/20 text-emerald-50 hover:bg-emerald-500/30",
              )}
              onClick={onAbrirCaixa}
              disabled={processandoCaixa}
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
                ? "border border-white/35 bg-white/10 text-white hover:bg-white/20"
                : "bg-secondary text-secondary-foreground border border-border",
            )}
          />
        </div>
      </div>
    </header>
  )
}
