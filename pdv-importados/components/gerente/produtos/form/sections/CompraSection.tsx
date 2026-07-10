'use client'

import { formatBRL } from '@/lib/format/money'
import { ProdutoFormSectionHeading } from '../ProdutoFormSectionHeading'
import { useProdutoFormContext } from '../ProdutoFormContext'

export function CompraSection() {
  const ctx = useProdutoFormContext()
  const p = ctx.m.produtos
  const { disabled, readOnly } = ctx

  return (
    <section aria-labelledby="produto-secao-compra">
      <ProdutoFormSectionHeading title={p.secao_compra} />
      <div id="produto-secao-compra" className="mt-3 space-y-3">
        <label className="flex h-9 cursor-pointer items-center gap-2 text-xs font-medium text-jl-fg-3">
          <input
            type="checkbox"
            className="h-4 w-4 accent-amber-400"
            checked={ctx.permitirAbaixoCusto}
            onChange={(e) => ctx.setPermitirAbaixoCusto(e.target.checked)}
            disabled={disabled}
          />
          {p.permitir_abaixo_custo}
        </label>

        <div className="rounded-md border border-[var(--color-border-secondary)] bg-white/[.04] p-3">
          <p className="text-xs font-medium text-jl-fg-3">{p.custo_medio_label}</p>
          <p className="mt-1 text-sm font-medium text-jl-fg-1">
            {readOnly.custoMedio !== null ? formatBRL(readOnly.custoMedio) : '—'}
          </p>
          <p className="mt-0.5 text-[10px] text-jl-fg-3">{p.custo_medio_hint}</p>
        </div>
      </div>
    </section>
  )
}
