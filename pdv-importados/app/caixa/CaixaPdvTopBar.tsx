"use client"

import { Button } from "@/components/ui/button"
import { SignOutButton } from "@/components/auth/SignOutButton"
import type { Mensagens } from "@/i18n/getMessages"
import type { Idioma } from "@/idioma/normalizeIdioma"
import type { ThermalStatus } from "@/hooks/useThermalPrinter"
import { caixaFmt } from "@/app/caixa/caixaI18n"
import { turnoNumeroDeCaixaId } from "@/app/caixa/caixaPdvTurnoDisplay"
import type { CaixaStatusUi } from "@/app/caixa/hooks/useCaixaStatusMovimentacoes"
import { isCaixaAberto } from "@/app/caixa/hooks/useCaixaStatusMovimentacoes"
import { DragonEmblemIcon } from "@/components/icons/DragonEmblemIcon"
import { CaixaKeyboardShortcutsReference } from "@/app/caixa/CaixaKeyboardShortcutsReference"
import { cn } from "@/lib/utils"
import { formatDecimalBRL } from "@/lib/format/money"

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
          valor: `${m.caixa.moeda_prefixo} ${formatDecimalBRL(caixaStatus.valorSistemaDinheiro)}`,
        })

  const classic = layoutVariant === "classic"

  return (
    <header
      className={cn(
        "shrink-0 px-4 sm:px-6 py-2.5 border-b flex flex-wrap items-center gap-x-4 gap-y-2",
        classic
          ? "border-gray-200 bg-white text-gray-900 shadow-sm"
          : "border-jl-border-1 bg-white text-gray-900",
      )}
      style={fontStack ? { fontFamily: fontStack } : undefined}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
        <span
          className={cn(
            "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border-2",
            classic
              ? "border-amber-400/60 bg-amber-50"
              : "border-amber-400/60 bg-amber-50",
          )}
          title={m.caixa.topbar_titulo}
        >
          <DragonEmblemIcon className="h-6 w-6 text-amber-600" />
        </span>
        <h1 className={cn("min-w-0 text-lg font-bold tracking-tight", classic ? "text-gray-900" : "text-gray-900")}>
          {m.caixa.topbar_titulo}
        </h1>
      </div>

      <div className="flex w-full min-w-0 flex-wrap items-center justify-end gap-x-2 gap-y-2 sm:w-auto sm:flex-nowrap">
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 text-xs sm:text-sm">
          <span
            className={cn(
              "max-w-[11rem] truncate rounded-md border px-2 py-1 font-medium tabular-nums",
              classic
                ? "border-gray-300 bg-gray-50 text-gray-700"
                : "border-gray-300 bg-gray-50 text-gray-700",
            )}
            title={turnoText}
          >
            {turnoText}
          </span>
          <span
            className={cn(
              "max-w-[14rem] truncate rounded-md border px-2 py-1 font-medium",
              classic
                ? "border-gray-300 bg-gray-50 text-gray-700"
                : "border-gray-300 bg-gray-50 text-gray-700",
            )}
            title={operadorText}
          >
            {operadorText}
          </span>
          {printerStatus && printerStatus !== "idle" && (
            <span
              title={printerDeviceName ?? "Impressora"}
              className={cn(
                "max-w-[10rem] truncate rounded-md border px-2 py-1 text-xs font-medium",
                printerStatus === "connected"
                  ? "border-emerald-400/60 bg-emerald-50 text-emerald-700"
                  : printerStatus === "error"
                    ? "border-red-400/60 bg-red-50 text-red-700"
                    : "border-gray-300 bg-gray-50 text-gray-700",
              )}
            >
              {printerStatus === "connected" ? "🖨 OK" : printerStatus === "error" ? "🖨 Erro" : "🖨 …"}
            </span>
          )}
        </div>

        <div
          className={cn(
            "flex shrink-0 items-center gap-2 border-l pl-3 sm:pl-4",
            classic ? "border-gray-200" : "border-gray-200",
          )}
        >
          {aberto ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={cn(
                "text-xs font-semibold sm:text-sm border-gray-300 bg-white text-gray-700 hover:bg-gray-100",
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
                "text-xs font-semibold sm:text-sm border-gray-300 bg-white text-gray-700 hover:bg-gray-100",
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
                "text-xs font-semibold sm:text-sm border-gray-300 bg-white text-gray-700 hover:bg-gray-100",
              )}
              onClick={onAbrirCaixa}
              disabled={processandoCaixa || carregandoStatus}
              aria-busy={processandoCaixa}
            >
              {processandoCaixa ? `${m.caixa.abrir}…` : m.caixa.abrir}
            </Button>
          )}
          <CaixaKeyboardShortcutsReference m={m} variant={classic ? "classic" : "default"} />
          <SignOutButton
            label={m.comum.sair}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium sm:text-sm border border-gray-300 bg-white text-gray-700 hover:bg-gray-100",
            )}
          />
        </div>
      </div>
    </header>
  )
}