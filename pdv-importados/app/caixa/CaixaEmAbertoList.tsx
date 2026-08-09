"use client"

import { memo } from "react"
import type { Mensagens } from "@/i18n/getMessages"
import type { VendaEmEsperaCard } from "@/app/caixa/actions"
import { caixaFmt } from "@/app/caixa/caixaI18n"
import { formatDecimalBRL } from "@/lib/format/money"
import { cn } from "@/lib/utils"
import { EmptyState, Loading } from "@/components/ui/feedback"

type Props = {
  m: Mensagens
  vendas: VendaEmEsperaCard[]
  carregando?: boolean
  onRetomar: (id: string) => void
  onDescartar: (id: string) => void
}

function CaixaEmAbertoListImpl({
  m,
  vendas,
  carregando,
  onRetomar,
  onDescartar,
}: Props) {
  const muted = "text-muted-foreground"
  const card = "border border-dashed border-border bg-card hover:border-primary/50"

  if (carregando) {
    return <Loading label={m.comum.carregando} className="min-h-0 py-4" size="sm" />
  }

  if (vendas.length === 0) {
    return <EmptyState title={m.caixa.em_aberto_vazio} className="py-4" />
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
              <p className={cn("mt-0.5 text-small", muted)}>
                {v.qtdItens} {v.qtdItens === 1 ? m.caixa.em_aberto_item : m.caixa.em_aberto_itens}
              </p>
            </button>
            <button
              type="button"
              className="mt-1 text-small underline-offset-2 hover:underline text-destructive"
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
