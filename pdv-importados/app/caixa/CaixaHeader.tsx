"use client"

import React, { useState, useEffect } from "react"
import type { Mensagens } from "@/i18n/getMessages"
import type { Idioma } from "@/idioma/normalizeIdioma"
import { CaixaPdvTopBar, type CaixaPdvLayoutVariant } from "@/app/caixa/CaixaPdvTopBar"
import { cn } from "@/lib/utils"

type Props = {
  m: Mensagens
  idioma: Idioma
  layoutVariant: CaixaPdvLayoutVariant
  operadorLabel: string
  caixaStatus:
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
  processandoCaixa: boolean
  onAbrirCaixa: () => void
  onFecharCaixa: () => void
}

export function CaixaHeader({
  m,
  idioma,
  layoutVariant,
  operadorLabel,
  caixaStatus,
  processandoCaixa,
  onAbrirCaixa,
  onFecharCaixa,
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

  const statusTop =
    caixaStatus?.aberto === true
      ? {
          aberto: true as const,
          caixaId: caixaStatus.caixaId,
          valorSistemaDinheiro: caixaStatus.valorSistemaDinheiro,
          blindClosureEnabled: caixaStatus.blindClosureEnabled,
        }
      : caixaStatus === null
        ? null
        : { aberto: false as const }

  return (
    <div className="shrink-0 flex flex-col" style={fontStack ? { fontFamily: fontStack } : undefined}>
      <CaixaPdvTopBar
        m={m}
        idioma={idioma}
        layoutVariant={layoutVariant}
        operadorLabel={operadorLabel}
        caixaStatus={statusTop}
        processandoCaixa={processandoCaixa}
        onAbrirCaixa={onAbrirCaixa}
        onFecharCaixa={onFecharCaixa}
      />
      {layoutVariant !== "classic" && currentDateTime ? (
        <div className="flex items-center gap-2 border-b border-jl-border-1 bg-jl-surface-base px-4 py-1 sm:px-6">
          <span className="inline-flex items-center rounded border border-jl-border-1 bg-jl-surface-soft px-2 py-0.5 text-[11px] tabular-nums text-jl-fg-3">
            {currentDateTime}
          </span>
          <span
            className={cn(
              "inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-medium",
              caixaStatus?.aberto === true
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                : "border-jl-border-1 bg-jl-surface-soft text-jl-fg-3",
            )}
          >
            {caixaStatus?.aberto === true ? m.caixa.status_aberto : m.caixa.status_fechado}
          </span>
        </div>
      ) : null}
    </div>
  )
}
