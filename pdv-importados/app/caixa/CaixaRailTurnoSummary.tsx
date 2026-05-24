"use client"

import { memo, useEffect, useRef, useState } from "react"
import type { Mensagens } from "@/i18n/getMessages"
import type { Idioma } from "@/idioma/normalizeIdioma"
import { obterResumoVendasTurno } from "@/app/caixa/actions"
import { caixaFmt } from "@/app/caixa/caixaI18n"

type Props = {
  m: Mensagens
  idioma: Idioma
  caixaAberto: boolean
  layoutVariant: "classic" | "default"
  /** Incrementing this triggers a refresh (e.g. after each finalized sale). */
  refreshToken?: number
}

const POLL_MS = 30_000

export const CaixaRailTurnoSummary = memo(function CaixaRailTurnoSummary({ m, idioma, caixaAberto, layoutVariant, refreshToken }: Props) {
  const [quantidadeVendas, setQuantidadeVendas] = useState(0)
  const [totalLiquido, setTotalLiquido] = useState(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const classic = layoutVariant === "classic"
  const loc = idioma === "pt" ? "pt-BR" : "zh-CN"

  const fmt = (n: number) =>
    `${m.caixa.moeda_prefixo} ${n.toLocaleString(loc, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  useEffect(() => {
    if (!caixaAberto) return

    let cancelled = false
    async function load() {
      const res = await obterResumoVendasTurno()
      if (!cancelled && res.ok) {
        setQuantidadeVendas(res.quantidadeVendas)
        setTotalLiquido(res.totalLiquido)
      }
    }

    void load()
    timerRef.current = setInterval(() => { void load() }, POLL_MS)
    return () => {
      cancelled = true
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [caixaAberto, refreshToken])

  const labelCls = classic ? "text-muted-foreground" : "text-jl-fg-3"
  const valueCls = classic ? "font-semibold tabular-nums text-foreground" : "font-semibold tabular-nums text-jl-fg-1"

  if (!caixaAberto) {
    return (
      <p className={`text-xs ${labelCls}`}>{m.caixa.rail_turno_caixa_fechado}</p>
    )
  }

  return (
    <dl className="space-y-1 text-xs">
      <div className="flex justify-between gap-2">
        <dt className={labelCls}>
          {caixaFmt(m.caixa.rail_turno_vendas, { n: String(quantidadeVendas) })}
        </dt>
      </div>
      <div className="flex justify-between gap-2">
        <dt className={labelCls}>{m.caixa.rail_turno_total}</dt>
        <dd className={valueCls}>{fmt(totalLiquido)}</dd>
      </div>
    </dl>
  )
})

CaixaRailTurnoSummary.displayName = "CaixaRailTurnoSummary"
