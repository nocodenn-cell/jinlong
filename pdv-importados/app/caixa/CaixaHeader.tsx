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
    </div>
  )
}

export const CaixaHeader = memo(CaixaHeaderImpl)
