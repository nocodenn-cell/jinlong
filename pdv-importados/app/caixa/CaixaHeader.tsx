"use client"

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
  const fontStack =
    idioma === "zh"
      ? 'var(--font-noto-sc),"Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif'
      : undefined

  const localeString = idioma === "pt" ? "pt-BR" : "zh-CN"

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

  const abertoAs =
    layoutVariant !== "classic" && caixaStatus?.aberto === true
      ? new Date(caixaStatus.dataAbertura).toLocaleTimeString(localeString, {
          hour: "2-digit",
          minute: "2-digit",
        })
      : null

  const fundoInicial =
    abertoAs && caixaStatus?.aberto === true && !caixaStatus.blindClosureEnabled
      ? `${m.caixa.moeda_prefixo} ${caixaStatus.valorInicial.toLocaleString(localeString, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`
      : null

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
      {abertoAs ? (
        <div className="flex items-center gap-2 border-b border-jl-border-1 bg-jl-surface-base px-4 py-1 text-[11px] text-jl-fg-3 sm:px-6">
          <span className="font-medium">{m.caixa.topbar_aberto_as}</span>
          <span className="tabular-nums font-semibold text-jl-fg-2">{abertoAs}</span>
          {fundoInicial && (
            <>
              <span className="text-jl-fg-3/40" aria-hidden>·</span>
              <span className="tabular-nums text-jl-fg-2">{fundoInicial}</span>
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}
