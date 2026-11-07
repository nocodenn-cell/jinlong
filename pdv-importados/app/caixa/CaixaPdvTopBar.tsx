"use client"

import type { ReactNode } from "react"
import { Printer } from "lucide-react"
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
  /** Referência de atalhos — estado no CaixaPageClient para o F1 poder alternar. */
  atalhosAbertos: boolean
  onAtalhosOpenChange: (open: boolean) => void
  /** Troca de operador (Turno de / Bloquear / Trocar operador), montada pelo CaixaPageClient. */
  trocaSlot?: ReactNode
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
  atalhosAbertos,
  onAtalhosOpenChange,
  trocaSlot,
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
        "border-border bg-jl-surface-elev text-jl-fg-1 shadow-sm",
      )}
      style={fontStack ? { fontFamily: fontStack } : undefined}
    >
      {/* Identidade sem moldura: 金龍 é a marca, não um ícone dentro de caixa.
          "Venda PDV" saiu — o operador sabe onde está; o rótulo só ocupava
          espaço no canto mais nobre da tela. */}
      <div className="flex min-w-0 flex-1 items-baseline gap-2">
        <span
          className="shrink-0 text-2xl leading-none tracking-[0.08em] sm:text-[1.75rem] text-[var(--color-dragon-gold-luxury)]"
        >
          金龍
        </span>
        <span className="truncate text-caption font-medium uppercase tracking-[0.22em] text-jl-fg-3">
          Jinlong
        </span>
      </div>

      <div className="flex w-full min-w-0 flex-wrap items-center justify-end gap-x-2 gap-y-2 sm:w-auto sm:flex-nowrap">
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5 text-xs sm:text-sm">
          {aberto ? (
            <span
              className="max-w-44 truncate rounded-md border px-2 py-1 font-medium tabular-nums border-jl-border-1 bg-jl-surface-soft"
              title={turnoText}
            >
              {turnoText}
            </span>
          ) : null}
          <span
            className="max-w-56 truncate rounded-md border px-2 py-1 font-medium border-jl-border-1 bg-jl-surface-soft"
            title={operadorText}
          >
            {operadorText}
          </span>
          {aberto && !caixaStatus.blindClosureEnabled ? (
            <span
              className="max-w-48 truncate rounded-md border px-2 py-1 font-medium tabular-nums border-jl-border-1 bg-jl-surface-soft"
              title={fundoText}
            >
              {fundoText}
            </span>
          ) : null}
          {printerStatus && printerStatus !== "idle" && (
            <span
              title={printerDeviceName ?? "Impressora"}
              className={cn(
                "max-w-40 truncate rounded-md border px-2 py-1 text-xs font-medium",
                printerStatus === "connected"
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700"
                  : printerStatus === "error"
                    ? "border-destructive/40 bg-destructive/10 text-destructive"
                    : "border-jl-border-1 bg-jl-surface-soft",
              )}
            >
              <Printer className="mr-1 inline h-3.5 w-3.5" aria-hidden />
              {printerStatus === "connected" ? "OK" : printerStatus === "error" ? "Erro" : "…"}
            </span>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-l pl-2 sm:pl-3 border-jl-border-1">
          {trocaSlot}
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
              className="text-xs font-semibold sm:text-sm border-jl-border-1"
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
              className="text-xs font-semibold sm:text-sm border-jl-border-1"
              onClick={onAbrirCaixa}
              disabled={processandoCaixa || carregandoStatus}
              aria-busy={processandoCaixa}
            >
              {processandoCaixa ? `${m.caixa.abrir}…` : m.caixa.abrir}
            </Button>
          )}
          <CaixaKeyboardShortcutsReference
            m={m}
            variant="classic"
            open={atalhosAbertos}
            onOpenChange={onAtalhosOpenChange}
          />
          {/* "Trocar senha" saiu da barra do PDV: é tarefa de conta, feita uma vez
              na vida, ocupando espaço permanente na tela de venda. Continua
              acessível em /auth/alterar-senha e pelo rodapé do admin. */}
          <SignOutButton
            label={m.comum.sair}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium sm:text-sm",
              "bg-jl-surface-soft text-jl-fg-1 border border-jl-border-1 hover:bg-jl-surface-elev",
            )}
          />
        </div>
      </div>
    </header>
  )
}