'use client'

import { formatBRL } from '@/lib/format/money'
import { ProdutoFormSectionHeading } from '../ProdutoFormSectionHeading'
import { useProdutoFormContext } from '../ProdutoFormContext'
import { HistoricoPrecosPanel } from '../../produtoFormSections/HistoricoPrecosPanel'

export function CompraSection() {
  const ctx = useProdutoFormContext()
  const p = ctx.m.produtos
  const { disabled, inputClassName, readOnly } = ctx

  const custo = ctx.precoCustoInput.parse()
  const varejo = ctx.precoVarejoInput.parse()
  const margem = custo != null && varejo != null && varejo > 0
    ? ((varejo - custo) / varejo) * 100
    : null

  return (
    <section aria-labelledby="produto-secao-compra">
      <ProdutoFormSectionHeading title={p.secao_compra} />
      <div id="produto-secao-compra" className="mt-3 space-y-3">
        <label className="block text-xs font-medium text-jl-fg-3">
          {p.custo_compra_label}
          <input
            type="text"
            inputMode="decimal"
            className={`${inputClassName} mt-1 font-mono`}
            value={ctx.precoCustoInput.display}
            onChange={ctx.precoCustoInput.onChange}
            disabled={disabled}
            placeholder="—"
          />
        </label>

        <label className="flex h-9 cursor-pointer items-center gap-2 text-xs font-medium text-jl-fg-3">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[color:var(--accent)]"
            checked={ctx.permitirAbaixoCusto}
            onChange={(e) => ctx.setPermitirAbaixoCusto(e.target.checked)}
            disabled={disabled}
          />
          {p.permitir_abaixo_custo}
        </label>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-md border border-[var(--color-border-secondary)] bg-white/[.04] p-3">
            <p className="text-xs font-medium text-jl-fg-3">{p.custo_medio_label}</p>
            <p className="mt-1 text-sm font-medium text-jl-fg-1">
              {readOnly.custoMedio !== null ? formatBRL(readOnly.custoMedio) : '—'}
            </p>
            <p className="mt-0.5 text-[10px] text-jl-fg-3">{p.custo_medio_hint}</p>
          </div>

          <div className="rounded-md border border-[var(--color-border-secondary)] bg-white/[.04] p-3">
            <p className="text-xs font-medium text-jl-fg-3">{p.margem_lucro_label}</p>
            <p
              className={`mt-1 text-sm font-medium ${
                margem !== null && margem < 0 ? 'text-destructive' : 'text-jl-fg-1'
              }`}
            >
              {margem !== null ? `${margem.toFixed(1).replace('.', ',')}%` : '—'}
            </p>
            <p className="mt-0.5 text-[10px] text-jl-fg-3">
              {margem !== null ? p.margem_lucro_hint : p.margem_lucro_indisponivel}
            </p>
          </div>
        </div>

        {readOnly.produtoId !== null ? (
          <div className="rounded-md border border-[var(--color-border-secondary)] bg-white/[.03] p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-jl-fg-3">
              {p.historico_precos_titulo}
            </p>
            <HistoricoPrecosPanel produtoId={readOnly.produtoId} p={p} />
          </div>
        ) : null}
      </div>
    </section>
  )
}
