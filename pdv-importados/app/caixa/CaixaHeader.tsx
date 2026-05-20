"use client"

import React, { useState, useEffect } from "react"
import type { Mensagens } from "@/i18n/getMessages"
import type { Idioma } from "@/idioma/normalizeIdioma"
import { CaixaPdvTopBar, type CaixaPdvLayoutVariant } from "@/app/caixa/CaixaPdvTopBar"

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
        <div className="flex items-center gap-3 border-b border-jl-border-1 bg-jl-surface-base px-4 py-1 text-[11px] text-jl-fg-3 sm:px-6">
          <span className="tabular-nums">{currentDateTime}</span>
          {caixaStatus?.aberto === true && (
            <span className="truncate">
              {new Date(caixaStatus.dataAbertura).toLocaleString(localeString)}
              {" · "}
              {m.caixa.moeda_prefixo} {caixaStatus.valorInicial.toFixed(2)}
            </span>
          )}
        </div>
      ) : null}
    </div>
  )
}
