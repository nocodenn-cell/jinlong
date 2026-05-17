"use client"

import type { Mensagens } from "@/i18n/getMessages"
import type { MetodoPagamentoUi } from "@/app/caixa/caixaMetodoPagamento"
import type { PagamentoLinha } from "@/app/caixa/hooks/useCaixaPagamentos"
import { CaixaPdvMetodoPagamentoSelector } from "@/app/caixa/CaixaPdvMetodoPagamentoSelector"
import { caixaFmt } from "@/app/caixa/caixaI18n"
import { cn } from "@/lib/utils"

type Props = Readonly<{
  m: Mensagens
  linhas: PagamentoLinha[]
  totalLiquidoComGerente: number
  restante: number
  valido: boolean
  disabled: boolean
  variant?: "default" | "classic"
  onSetMetodo: (id: string, metodo: MetodoPagamentoUi) => void
  onSetValor: (id: string, valor: string) => void
  onAdicionarLinha: () => void
  onRemoverLinha: (id: string) => void
}>

export function CaixaSplitPagamentos({
  m,
  linhas,
  totalLiquidoComGerente,
  restante,
  valido,
  disabled,
  variant = "default",
  onSetMetodo,
  onSetValor,
  onAdicionarLinha,
  onRemoverLinha,
}: Props) {
  const classic = variant === "classic"

  const restanteColor = valido
    ? classic
      ? "text-green-300"
      : "text-green-600"
    : classic
      ? "text-red-300"
      : "text-red-600"

  return (
    <div className="flex flex-col gap-3">
      <span
        className={cn(
          "text-xs font-semibold uppercase tracking-wide",
          classic ? "text-blue-100/85" : "text-foreground/80",
        )}
      >
        {m.caixa.pdv_pgto_parcelas_titulo}
      </span>

      <div className="flex flex-col gap-3">
        {linhas.map((linha, idx) => (
          <div key={linha.id} className="flex flex-col gap-1.5">
            <CaixaPdvMetodoPagamentoSelector
              m={m}
              value={linha.metodo}
              onChange={(metodo) => onSetMetodo(linha.id, metodo)}
              disabled={disabled}
              variant={variant}
            />
            <div className="flex items-center gap-2">
              <label className="sr-only" htmlFor={`parcela-valor-${linha.id}`}>
                {caixaFmt(m.caixa.aria_parcela_valor, { n: idx + 1 })}
              </label>
              <input
                id={`parcela-valor-${linha.id}`}
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={linha.valor}
                onChange={(e) => onSetValor(linha.id, e.target.value)}
                disabled={disabled}
                aria-label={caixaFmt(m.caixa.aria_parcela_valor, { n: idx + 1 })}
                className={cn(
                  "w-full rounded-md border px-3 py-2 text-sm tabular-nums disabled:cursor-not-allowed disabled:opacity-50",
                  classic
                    ? "border-white/30 bg-white/10 text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-white/60"
                    : "border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring",
                )}
              />
              <button
                type="button"
                onClick={() => onRemoverLinha(linha.id)}
                disabled={disabled || linhas.length <= 1}
                aria-label={caixaFmt(m.caixa.aria_remover_parcela, { n: idx + 1 })}
                className={cn(
                  "shrink-0 rounded-md px-2 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40",
                  classic
                    ? "border border-white/30 bg-white/10 text-white hover:bg-white/20"
                    : "app-btn-neutral",
                )}
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onAdicionarLinha}
        disabled={disabled}
        aria-label={m.caixa.aria_adicionar_parcela}
        className={cn(
          "w-full rounded-md py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50",
          classic
            ? "border border-white/30 bg-white/10 text-white hover:bg-white/20"
            : "app-btn-neutral",
        )}
      >
        + {m.caixa.aria_adicionar_parcela}
      </button>

      <div
        className={cn(
          "flex items-center justify-between rounded-md px-3 py-2 text-sm font-semibold tabular-nums",
          classic ? "bg-white/10" : "bg-muted",
        )}
      >
        <span className={classic ? "text-blue-100/85" : "text-foreground/80"}>
          {m.caixa.pdv_pgto_soma_parcelas}
        </span>
        <span className={restanteColor}>
          {restante === 0
            ? "✓"
            : restante > 0
              ? `− R$ ${restante.toFixed(2)}`
              : `+ R$ ${Math.abs(restante).toFixed(2)}`}
        </span>
      </div>
    </div>
  )
}
