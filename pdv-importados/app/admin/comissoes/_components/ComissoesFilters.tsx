import Link from 'next/link'
import { ROUTES } from '@shared-core/navigation/routes'
import type { FiltroComissoes } from '@/app/gerente/comissoes/actions'

export type ComissoesFiltersLabels = {
  de: string
  ate: string
  status: string
  aplicar: string
  statusTodos: string
  statusPendente: string
  statusPago: string
}

export type PeriodoPreset = {
  id: '7d' | '30d' | 'mes'
  label: string
  de: string
  ate: string
}

type Props = {
  filtro: FiltroComissoes
  presets: PeriodoPreset[]
  activePresetId: PeriodoPreset['id'] | null
  labels: ComissoesFiltersLabels
}

function hrefFor(filtro: FiltroComissoes, patch: Partial<FiltroComissoes>): string {
  const next = { ...filtro, ...patch }
  const params = new URLSearchParams()
  if (next.de) params.set('de', next.de)
  if (next.ate) params.set('ate', next.ate)
  if (next.status && next.status !== 'todos') params.set('status', next.status)
  const qs = params.toString()
  return qs ? `${ROUTES.admin.comissoes}?${qs}` : ROUTES.admin.comissoes
}

/** Filtros URL-driven locais da tela de comissões (não altera FilterBar global). */
export function ComissoesFilters({ filtro, presets, activePresetId, labels }: Props) {
  return (
    <div id="comissoes-filtros" className="flex w-full flex-col gap-2">
      <div className="admin-v2-segmented flex flex-wrap">
        {presets.map((preset) => (
          <Link
            key={preset.id}
            href={hrefFor(filtro, { de: preset.de, ate: preset.ate })}
            data-active={activePresetId === preset.id}
            className="admin-v2-filter-pill rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
          >
            {preset.label}
          </Link>
        ))}
      </div>

      <form
        method="get"
        action={ROUTES.admin.comissoes}
        className="flex flex-wrap items-end gap-2 rounded-lg border border-[var(--color-border-secondary)] bg-jl-surface-soft p-3"
      >
        <label className="flex flex-col gap-1 text-[11px] text-jl-fg-3">
          {labels.de}
          <input
            name="de"
            type="date"
            defaultValue={filtro.de ?? ''}
            className="admin-v2-input px-2 py-1.5 text-xs"
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-jl-fg-3">
          {labels.ate}
          <input
            name="ate"
            type="date"
            defaultValue={filtro.ate ?? ''}
            className="admin-v2-input px-2 py-1.5 text-xs"
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-jl-fg-3">
          {labels.status}
          <select
            name="status"
            defaultValue={filtro.status}
            className="admin-v2-input px-2 py-1.5 text-xs"
          >
            <option value="todos">{labels.statusTodos}</option>
            <option value="pendente">{labels.statusPendente}</option>
            <option value="pago">{labels.statusPago}</option>
          </select>
        </label>
        <button type="submit" className="admin-v2-btn-primary">
          {labels.aplicar}
        </button>
      </form>
    </div>
  )
}
