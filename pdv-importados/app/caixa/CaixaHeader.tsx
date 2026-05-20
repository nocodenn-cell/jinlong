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
  carregandoRegras: boolean
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
  carregandoRegras,
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
      {layoutVariant !== "classic" ? (
        <div className="px-4 sm:px-6 py-2 border-b border-border bg-card/60 text-xs sm:text-sm text-foreground/90">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 min-w-0">
              <span className="tabular-nums text-foreground/95">
                {currentDateTime}
              </span>
              {caixaStatus?.aberto === true && (
                <span className="text-foreground/85">
                  Abertura:{" "}
                  {new Date(caixaStatus.dataAbertura).toLocaleString(localeString)}
                  {" · "}
                  Inicial: R$ {caixaStatus.valorInicial.toFixed(2)}
                </span>
              )}
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-border/60 space-y-1">
            <div>{m.caixa.atalhos_placeholder}</div>
            <div>
              {m.caixa.regras_catalogo} <code className="text-muted-foreground">regras_preco</code>
              {carregandoRegras ? ` · ${m.caixa.regras_carregando}` : ""}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
