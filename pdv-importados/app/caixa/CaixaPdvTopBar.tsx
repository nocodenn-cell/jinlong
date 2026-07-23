"use client"

import Link from "next/link"
import { Monitor } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SignOutButton } from "@/components/auth/SignOutButton"
import type { Mensagens } from "@/i18n/getMessages"
import type { Idioma } from "@/idioma/normalizeIdioma"
import type { ThermalStatus } from "@/hooks/useThermalPrinter"
import { caixaFmt } from "@/app/caixa/caixaI18n"
import { turnoNumeroDeCaixaId } from "@/app/caixa/caixaPdvTurnoDisplay"
import type { CaixaStatusUi } from "@/app/caixa/hooks/useCaixaStatusMovimentacoes"
import { isCaixaAberto } from "@/app/caixa/hooks/useCaixaStatusMovimentacoes"
import { CaixaKeyboardShortcutsReference } from "@/app/caixa/CaixaKeyboardShortcutsReference"
import { cn } from "@/lib/utils"
import { formatDecimalBRL } from "@/lib/format/money"
import { ROUTES } from "@shared-core/navigation/routes"

type Props = {
  m: Mensagens
  idioma: Idioma
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

  return (
    <header
      className={cn(
        "shrink-0 px-3 sm:px-5 py-2 border-b flex flex-wrap items-center gap-x-3 gap-y-1.5",
        "border-border bg-card text-foreground shadow-sm",
      )}
      style={fontStack ? { fontFamily: fontStack } : undefined}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-primary/10 text-primary">
          <Monitor className="h-5 w-5" aria-hidden />
        </span>
        <h1 className="min-w-0 truncate text-base font-bold tracking-tight sm:text-lg text-primary">
          {m.caixa.topbar_titulo}
        </h1>
      </div>

      <div className="flex w-full min-w-0 flex-wrap items-center justify-end gap-x-2 gap-y-2 sm:w-auto sm:flex-nowrap">
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2.5 text-xs sm:text-sm">
          <span
            className={cn(
              "inline-flex max-w-44 items-center gap-1.5 truncate rounded-full border px-2.5 py-1 font-semibold tabular-nums",
              aberto
                ? "border-success/30 bg-success/10 text-success"
                : "border-border bg-muted text-muted-foreground",
            )}
            title={turnoText}
          >
            {aberto && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-success" aria-hidden />}
            {turnoText}
          </span>
          <span className="max-w-56 truncate font-medium text-muted-foreground" title={operadorText}>
            {operadorText}
          </span>
          <span className="max-w-48 truncate font-medium tabular-nums text-muted-foreground" title={fundoText}>
            {fundoText}
          </span>
          {printerStatus && printerStatus !== "idle" && (
            <span
              title={printerDeviceName ?? "Impressora"}
              className={cn(
                "max-w-40 truncate rounded-full border px-2.5 py-1 text-xs font-medium",
                printerStatus === "connected"
                  ? "border-success/30 bg-success/10 text-success"
                  : printerStatus === "error"
                    ? "border-destructive/40 bg-destructive/10 text-destructive"
                    : "border-border bg-muted text-muted-foreground",
              )}
            >
              {printerStatus === "connected" ? "🖨 OK" : printerStatus === "error" ? "🖨 Erro" : "🖨 …"}
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5 border-l pl-2 sm:pl-3 border-border">
          {aberto ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="text-xs font-semibold sm:text-sm"
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
              className="text-xs font-semibold sm:text-sm"
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
              className="text-xs font-semibold sm:text-sm"
              onClick={onAbrirCaixa}
              disabled={processandoCaixa || carregandoStatus}
              aria-busy={processandoCaixa}
            >
              {processandoCaixa ? `${m.caixa.abrir}…` : m.caixa.abrir}
            </Button>
          )}
          <CaixaKeyboardShortcutsReference m={m} variant="classic" />
          <Link
            href={ROUTES.auth.changePassword}
            className="rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground sm:text-sm"
          >
            {m.login.link_trocar_senha}
          </Link>
          <SignOutButton
            label={m.comum.sair}
            className="rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground sm:text-sm"
          />
        </div>
      </div>
    </header>
  )
}