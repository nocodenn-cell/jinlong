"use client"

import React, { memo, useState, useEffect } from "react"
import type { Mensagens } from "@/i18n/getMessages"
import type { Idioma } from "@/idioma/normalizeIdioma"
import type { ThermalStatus } from "@/hooks/useThermalPrinter"
import { CaixaPdvTopBar, type CaixaPdvLayoutVariant } from "@/app/caixa/CaixaPdvTopBar"
import type { CaixaStatusUi } from "@/app/caixa/hooks/useCaixaStatusMovimentacoes"
import { isCaixaAberto } from "@/app/caixa/hooks/useCaixaStatusMovimentacoes"
import { cn } from "@/lib/utils"

type Props = {
  m: Mensagens
  idioma: Idioma
  layoutVariant: CaixaPdvLayoutVariant
  operadorLabel: string
  caixaStatus: CaixaStatusUi | null
  carregandoStatus: boolean
  processandoCaixa: boolean
  onAbrirCaixa: () => void
  onFecharCaixa: () => void
  onTentarStatusNovamente: () => void
  printerStatus?: ThermalStatus
  printerDeviceName?: string | null
}

function CaixaHeaderImpl({
  m,
  idioma,
  layoutVariant,
  operadorLabel,
  caixaStatus,
  carregandoStatus,
  processandoCaixa,
  onAbrirCaixa,
  onFecharCaixa,
  onTentarStatusNovamente,
  printerStatus,
  printerDeviceName,
}: Props) {
  const [currentDateTime, setCurrentDateTime] = useState<string>("")

  const fontStack =
    idioma === "zh"
      ? 'var(--font-noto-sc),"Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif'
      : undefined

  const localeString = idioma === "pt" ? "pt-BR" : "zh-CN"

  useEffect(() => {
    setCurrentDateTime(new Date().toLocaleString(localeString))
    const interval = setInterval(() => {
      setCurrentDateTime(new Date().toLocaleString(localeString))
    }, 60000)
    return () => clearInterval(interval)
  }, [localeString])

  const badgeLabel = carregandoStatus
    ? m.caixa.status_carregando
    : caixaStatus?.status === "ERRO"
      ? m.caixa.status_indisponivel
      : isCaixaAberto(caixaStatus)
        ? m.caixa.status_aberto
        : m.caixa.status_fechado

  return (
    <div className="shrink-0 flex flex-col" style={fontStack ? { fontFamily: fontStack } : undefined}>
      <CaixaPdvTopBar
        m={m}
        idioma={idioma}
        layoutVariant={layoutVariant}
        operadorLabel={operadorLabel}
        caixaStatus={caixaStatus}
        carregandoStatus={carregandoStatus}
        processandoCaixa={processandoCaixa}
        onAbrirCaixa={caixaStatus?.status === "ERRO" ? onTentarStatusNovamente : onAbrirCaixa}
        onFecharCaixa={onFecharCaixa}
        printerStatus={printerStatus}
        printerDeviceName={printerDeviceName}
      />
      {layoutVariant !== "classic" && currentDateTime ? (
        <div className="flex items-center gap-2 border-b border-jl-border-1 bg-jl-surface-base px-4 py-1 sm:px-6">
          <span className="inline-flex items-center rounded border border-jl-border-1 bg-jl-surface-soft px-2 py-0.5 text-[11px] tabular-nums text-jl-fg-3">
            {currentDateTime}
          </span>
          <span
            className={cn(
              "inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-medium",
              isCaixaAberto(caixaStatus)
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                : caixaStatus?.status === "ERRO"
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                  : "border-jl-border-1 bg-jl-surface-soft text-jl-fg-3",
            )}
          >
            {badgeLabel}
          </span>
        </div>
      ) : null}
    </div>
  )
}

export const CaixaHeader = memo(CaixaHeaderImpl)
