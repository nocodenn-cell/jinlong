'use client'

import Link from 'next/link'
import { ROUTES } from '@shared-core/navigation/routes'
import { ProdutoFormSectionHeading } from '../ProdutoFormSectionHeading'
import { useProdutoFormContext } from '../ProdutoFormContext'

function LeituraCampo({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-jl-fg-3">{label}</p>
      <p className="mt-1 text-sm font-medium text-jl-fg-1">{value}</p>
      {hint ? <p className="mt-0.5 text-[10px] text-jl-fg-3">{hint}</p> : null}
    </div>
  )
}

export function EstoqueSection() {
  const ctx = useProdutoFormContext()
  const p = ctx.m.produtos
  const { disabled, inputClassName, readOnly } = ctx

  return (
    <section aria-labelledby="produto-secao-estoque">
      <ProdutoFormSectionHeading title={p.secao_estoque} />
      <div id="produto-secao-estoque" className="mt-3 space-y-3">
        <label className="block text-xs font-medium text-jl-fg-3">
          {p.localizacao_prateleira_label}
          <input
            className={`${inputClassName} mt-1`}
            value={ctx.localizacaoPrateleira}
            onChange={(e) => ctx.setLocalizacaoPrateleira(e.target.value)}
            disabled={disabled}
            placeholder={p.localizacao_prateleira_placeholder}
            autoComplete="off"
          />
        </label>

        <div className="grid grid-cols-2 gap-3 rounded-md border border-[var(--color-border-secondary)] bg-white/[.04] p-3">
          <LeituraCampo
            label={p.estoque_atual_label}
            value={readOnly.estoqueAtual !== null ? String(readOnly.estoqueAtual) : '—'}
          />
          <LeituraCampo
            label={p.estoque_minimo_label}
            value={readOnly.estoqueMinimo !== null ? String(readOnly.estoqueMinimo) : '—'}
            hint={p.estoque_minimo_hint}
          />
        </div>

        <Link
          href={ROUTES.admin.estoque}
          className="inline-flex text-[11px] font-medium text-jl-accent hover:underline"
        >
          {p.estoque_minimo_link}
        </Link>
      </div>
    </section>
  )
}
