"use client"

import { memo } from "react"
import type { Mensagens } from "@/i18n/getMessages"
import type { VendaEmEsperaCard } from "@/app/caixa/actions"
import { caixaFmt } from "@/app/caixa/caixaI18n"
import { formatDecimalBRL } from "@/lib/format/money"
import { cn } from "@/lib/utils"

type Props = {
  m: Mensagens
  vendas: VendaEmEsperaCard[]
  carregando?: boolean
  layoutVariant?: "classic" | "default"
  onRetomar: (id: string) => void
  onDescartar: (id: string) => void
}

function CaixaEmAbertoListImpl({
  m,
  vendas,
  carregando,
  layoutVariant = "classic",
  onRetomar,
  onDescartar,
}: Props) {
  const classic = layoutVariant === "classic"
  const muted = classic ? "text-muted-foreground" : "text-jl-fg-3"
  const card = classic
    ? "border border-dashed border-border bg-card hover:border-primary/50"
    : "border border-dashed border-jl-border-1 bg-jl-surface-soft hover:border-amber-400/50"

  if (carregando) {
    return <p className={cn("text-xs", muted)}>{m.comum.carregando}</p>
  }

  if (vendas.length === 0) {
    return <p className={cn("text-xs italic", muted)}>{m.caixa.em_aberto_vazio}</p>
  }

  return (
    <ul className="flex flex-col gap-2">
      {vendas.map((v) => (
        <li key={v.id}>
          <div className={cn("rounded-md p-2", card)}>
            <button
              type="button"
              className="w-full text-left"
              onClick={() => onRetomar(v.id)}
              title={m.caixa.em_aberto_retomar}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold">
                  {caixaFmt(m.caixa.em_aberto_pedido, { n: String(v.numeroLocal) })}
                </span>
                <span className="text-sm font-bold tabular-nums">
                  {m.caixa.moeda_prefixo} {formatDecimalBRL(v.totalLiquido)}
                </span>
              </div>
              <p className={cn("mt-0.5 text-[11px]", muted)}>
                {v.qtdItens} {v.qtdItens === 1 ? m.caixa.em_aberto_item : m.caixa.em_aberto_itens}
                {v.nomeCliente ? ` · ${v.nomeCliente}` : ""}
              </p>
            </button>
            <button
              type="button"
              className={cn(
                "mt-1 text-[11px] underline-offset-2 hover:underline",
                classic ? "text-destructive" : "text-red-400",
              )}
              onClick={() => onDescartar(v.id)}
            >
              {m.caixa.em_aberto_descartar}
            </button>
          </div>
        </li>
      ))}
    </ul>
  )
}

export const CaixaEmAbertoList = memo(CaixaEmAbertoListImpl)
