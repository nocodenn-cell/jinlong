'use client'

import { useMemo } from 'react'
import { formatBRL } from '@/lib/format/money'
import { ProdutoFormSectionHeading } from '../ProdutoFormSectionHeading'
import { useProdutoFormContext } from '../ProdutoFormContext'

function formatMargem(varejo: number | null, custo: number | null): string {
  if (varejo == null || varejo <= 0 || custo == null) return '—'
  const pct = ((varejo - custo) / varejo) * 100
  return `${pct.toFixed(1)}%`
}

export function PrecosSection() {
  const ctx = useProdutoFormContext()
  const p = ctx.m.produtos
  const { disabled, inputMonoClassName } = ctx

  const varejo = ctx.precoVarejoInput.parse()
  const custo = ctx.precoCustoInput.parse()
  const margem = useMemo(() => formatMargem(varejo, custo), [varejo, custo])
  const margemValor =
    varejo != null && varejo > 0 && custo != null ? formatBRL(varejo - custo) : '—'

  return (
    <section aria-labelledby="produto-secao-precos">
      <ProdutoFormSectionHeading title={p.secao_precificacao} />
      <p className="mt-1 text-[11px] text-jl-fg-3">{p.hint_precos_publicar}</p>
      <div id="produto-secao-precos" className="mt-3 space-y-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="block text-xs font-medium text-jl-fg-3">
            {p.preco_custo}
            <input
              type="text"
              inputMode="decimal"
              className={`${inputMonoClassName} mt-1`}
              value={ctx.precoCustoInput.display}
              onChange={ctx.precoCustoInput.onChange}
              disabled={disabled}
              placeholder="—"
            />
            <span className="mt-0.5 block text-[10px] text-jl-fg-3">{p.hint_preco_custo}</span>
          </label>
          <label className="block text-xs font-medium text-jl-fg-3">
            {p.preco_varejo} *
            <input
              type="text"
              inputMode="decimal"
              className={`${inputMonoClassName} mt-1`}
              value={ctx.precoVarejoInput.display}
              onChange={ctx.precoVarejoInput.onChange}
              disabled={disabled}
              placeholder="0,00"
            />
            <span className="mt-0.5 block text-[10px] text-jl-fg-3">{p.hint_preco_varejo}</span>
          </label>
          <label className="block text-xs font-medium text-jl-fg-3">
            {p.preco_atacado}
            <input
              type="text"
              inputMode="decimal"
              className={`${inputMonoClassName} mt-1`}
              value={ctx.precoAtacadoInput.display}
              onChange={ctx.precoAtacadoInput.onChange}
              disabled={disabled}
              placeholder="—"
            />
          </label>
          <label className="block text-xs font-medium text-jl-fg-3">
            {p.margem_label}
            <div className="mt-1 flex h-9 items-center rounded-md border border-jl-border-1 bg-jl-surface-soft px-3 font-mono text-sm text-jl-fg-1">
              {margemValor} ({margem})
            </div>
          </label>
        </div>

        <label className="block text-xs font-medium text-jl-fg-3 sm:max-w-[12rem]">
          {p.qtd_gatilho_atacado}
          <input
            type="text"
            inputMode="numeric"
            className={`${inputMonoClassName} mt-1`}
            value={ctx.quantidadeGatilho}
            onChange={(e) => ctx.setQuantidadeGatilho(e.target.value.replace(/\D/g, ''))}
            disabled={disabled}
            placeholder="—"
          />
          <span className="mt-0.5 block text-[10px] text-jl-fg-3">{p.hint_atacado_faixa}</span>
        </label>
      </div>
    </section>
  )
}
