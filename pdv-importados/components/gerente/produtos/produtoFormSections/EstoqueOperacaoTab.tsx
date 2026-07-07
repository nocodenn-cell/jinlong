'use client'

import Link from 'next/link'
import { ROUTES } from '@shared-core/navigation/routes'
import type { Mensagens } from '@/i18n/getMessages'

type Props = Readonly<{
  p: Mensagens['produtos']
  localizacaoPrateleira: string
  onChangeLocalizacaoPrateleira: (value: string) => void
  disabled: boolean
  /** null = produto ainda não salvo (estoque só existe após criar). */
  estoqueAtual: number | null
  estoqueMinimo: number | null
  inputClassName: string
}>

function LeituraCampo({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-jl-fg-3">{label}</p>
      <p className="mt-1 text-sm font-medium text-jl-fg-1">{value}</p>
      {hint ? <p className="mt-0.5 text-[10px] text-jl-fg-3">{hint}</p> : null}
    </div>
  )
}

/** Aba "Estoque e operação": localização é editável; saldo/mínimo são somente leitura
 *  (a edição de saldo/mínimo fica na tela de Estoque, que já audita o ajuste). */
export function EstoqueOperacaoTab({
  p,
  localizacaoPrateleira,
  onChangeLocalizacaoPrateleira,
  disabled,
  estoqueAtual,
  estoqueMinimo,
  inputClassName,
}: Props) {
  return (
    <div className="space-y-4">
      <label className="block text-xs font-medium text-jl-fg-3">
        {p.localizacao_prateleira_label}
        <input
          className={`${inputClassName} mt-1`}
          value={localizacaoPrateleira}
          onChange={(e) => onChangeLocalizacaoPrateleira(e.target.value)}
          disabled={disabled}
          placeholder={p.localizacao_prateleira_placeholder}
          autoComplete="off"
        />
      </label>

      <div className="grid grid-cols-2 gap-3 rounded-md border border-[var(--color-border-secondary)] bg-white/[.04] p-3">
        <LeituraCampo
          label={p.estoque_atual_label}
          value={estoqueAtual !== null ? String(estoqueAtual) : '—'}
        />
        <LeituraCampo
          label={p.estoque_minimo_label}
          value={estoqueMinimo !== null ? String(estoqueMinimo) : '—'}
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
  )
}
