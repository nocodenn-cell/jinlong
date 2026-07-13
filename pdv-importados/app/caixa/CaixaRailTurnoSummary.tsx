"use client"

import { memo, useEffect, useRef, useState } from "react"
import type { Mensagens } from "@/i18n/getMessages"
import type { Idioma } from "@/idioma/normalizeIdioma"
import { obterResumoVendasTurno } from "@/app/caixa/actions"
import { caixaFmt } from "@/app/caixa/caixaI18n"
import { formatDecimalBRL } from "@/lib/format/money"

type Props = {
  m: Mensagens
  idioma: Idioma
  caixaAberto: boolean
  layoutVariant: "classic" | "default"
  /** Incrementing this triggers a refresh (e.g. after each finalized sale). */
  refreshToken?: number
}

const POLL_MS = 30_000

function CaixaRailTurnoSummaryImpl({ m, caixaAberto, layoutVariant, refreshToken }: Props) {
  const [quantidadeVendas, setQuantidadeVendas] = useState(0)
  const [totalRecebido, setTotalRecebido] = useState(0)  // ✅ NOVO (Fase 6): Valor efetivamente recebido
  const [totalAReceber, setTotalAReceber] = useState(0)  // ✅ NOVO (Fase 6): Valor em crédito
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const classic = layoutVariant === "classic"
  useEffect(() => {
    if (!caixaAberto) return

    let cancelled = false
    async function load() {
      const res = await obterResumoVendasTurno()
      if (!cancelled && res.ok) {
        setQuantidadeVendas(res.quantidadeVendas)
        setTotalRecebido(res.totalRecebido)
        setTotalAReceber(res.totalAReceber)
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
      {/* ✅ FASE 6: Mostrar valor recebido em caixa (correto para pagamento parcial) */}
      <div className="flex justify-between gap-2">
        <dt className={labelCls}>{m.caixa.rail_turno_total}</dt>
        <dd className={valueCls}>{m.caixa.moeda_prefixo} {formatDecimalBRL(totalRecebido)}</dd>
      </div>
      {/* ✅ FASE 6: Mostrar saldo a receber se houver */}
      {totalAReceber > 0.009 && (
        <div className="flex justify-between gap-2 text-yellow-600">
          <dt className="text-xs">Saldo a Receber</dt>
          <dd className="font-semibold tabular-nums">{m.caixa.moeda_prefixo} {formatDecimalBRL(totalAReceber)}</dd>
        </div>
      )}
    </dl>
  )
}

export const CaixaRailTurnoSummary = memo(CaixaRailTurnoSummaryImpl)
