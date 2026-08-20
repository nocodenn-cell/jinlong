'use client'

import { formatBRL } from '@/lib/format/money'
import type { LiquidacaoResultado } from '@/app/gerente/comissoes/actions'
import type { ComissoesLabels } from './comissoesLabels'

type Props = {
  resultado: LiquidacaoResultado
  labels: ComissoesLabels
  onClose: () => void
}

/**
 * Resultado REAL de `liquidar_comissoes` (DB-05A) após uma liquidação —
 * bruto, quanto foi compensado por ajustes já lançados e o líquido que de
 * fato saiu. Nenhum valor aqui é calculado no frontend; tudo vem direto da
 * resposta da RPC.
 */
export function LiquidacaoResultModal({ resultado, labels, onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="liquidacao-resultado-titulo"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="admin-v2-panel w-full max-w-sm rounded-2xl p-5" onMouseDown={(e) => e.stopPropagation()}>
        <h2 id="liquidacao-resultado-titulo" className="text-[15px] font-semibold text-jl-fg-1">
          {labels.liquidacaoTitulo}
        </h2>

        {resultado.idempotentReplay ? (
          <p className="mt-2 text-[12px] text-jl-fg-3">{labels.liquidacaoReplay}</p>
        ) : null}

        <dl className="mt-4 flex flex-col gap-2 text-[13px]">
          <div className="flex items-center justify-between">
            <dt className="text-jl-fg-3">{labels.liquidacaoBruto}</dt>
            <dd className="tabular-nums text-jl-fg-1">{formatBRL(resultado.valorBruto)}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-jl-fg-3">{labels.liquidacaoCompensado}</dt>
            <dd className="tabular-nums text-[var(--color-warning-strong)]">
              −{formatBRL(resultado.valorCompensado)}
            </dd>
          </div>
          <div className="flex items-center justify-between border-t border-[var(--color-border-secondary)] pt-2">
            <dt className="font-medium text-jl-fg-1">{labels.liquidacaoLiquido}</dt>
            <dd className="tabular-nums text-[15px] font-semibold text-[var(--color-success-strong)]">
              {formatBRL(resultado.valorLiquido)}
            </dd>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <dt className="text-jl-fg-3">{labels.liquidacaoPagamentoId}</dt>
            <dd className="font-mono text-jl-fg-3">{resultado.pagamentoId.slice(0, 8)}…</dd>
          </div>
        </dl>

        <button
          type="button"
          onClick={onClose}
          className="admin-v2-btn-primary mt-5 w-full justify-center"
        >
          {labels.liquidacaoFechar}
        </button>
      </div>
    </div>
  )
}
