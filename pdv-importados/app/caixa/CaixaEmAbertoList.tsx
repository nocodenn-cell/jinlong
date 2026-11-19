"use client"

import { memo, useState } from "react"
import type { Mensagens } from "@/i18n/getMessages"
import type { VendaEmEsperaCard } from "@/app/caixa/actions"
import { caixaFmt } from "@/app/caixa/caixaI18n"
import { formatDecimalBRL } from "@/lib/format/money"
import { cn } from "@/lib/utils"
import { EmptyState, Loading } from "@/components/ui/feedback"

type Props = {
  m: Mensagens
  vendas: VendaEmEsperaCard[]
  disabled?: boolean
  carregando?: boolean
  onRetomar: (id: string) => void
  /** RN-03: o descarte só é enviado com motivo (o servidor também exige). */
  onDescartar: (id: string, motivo: string) => void
}

function CaixaEmAbertoListImpl({
  m,
  vendas,
  carregando,
  disabled = false,
  onRetomar,
  onDescartar,
}: Props) {
  const [descartandoId, setDescartandoId] = useState<string | null>(null)
  const [motivo, setMotivo] = useState("")
  const motivoValido = motivo.trim().length >= 3
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
              disabled={disabled}
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
            {descartandoId === v.id ? (
              <form
                className="mt-1 flex flex-col gap-1"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (!motivoValido || disabled) return
                  onDescartar(v.id, motivo.trim())
                  setDescartandoId(null)
                  setMotivo("")
                }}
              >
                <label className="text-small">
                  {m.caixa.em_aberto_motivo_label}
                  <input
                    autoFocus
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    maxLength={200}
                    className="mt-0.5 block w-full rounded-md border border-border bg-background px-2 py-1 text-small"
                  />
                </label>
                {!motivoValido && motivo.length > 0 ? (
                  <p className="text-small text-destructive">{m.caixa.em_aberto_motivo_minimo}</p>
                ) : null}
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={disabled || !motivoValido}
                    className="text-small underline-offset-2 hover:underline text-destructive disabled:opacity-50"
                  >
                    {m.caixa.em_aberto_motivo_confirmar}
                  </button>
                  <button
                    type="button"
                    className="text-small underline-offset-2 hover:underline text-muted-foreground"
                    onClick={() => {
                      setDescartandoId(null)
                      setMotivo("")
                    }}
                  >
                    {m.caixa.em_aberto_motivo_cancelar}
                  </button>
                </div>
              </form>
            ) : (
              <button
                disabled={disabled}
                type="button"
                className="mt-1 text-small underline-offset-2 hover:underline text-destructive"
                onClick={() => {
                  setDescartandoId(v.id)
                  setMotivo("")
                }}
              >
                {m.caixa.em_aberto_descartar}
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}

export const CaixaEmAbertoList = memo(CaixaEmAbertoListImpl)
