'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Valor suportado por campos declarativos do filtro lateral. */
export type CampoFiltroValor = string | number | string[]

export type CampoFiltroTipo = 'select' | 'radio' | 'search'

export type CampoFiltro = Readonly<{
  id: string
  label: string
  tipo: CampoFiltroTipo
  opcoes?: ReadonlyArray<{ value: string; label: string }>
  valor: CampoFiltroValor
  onChange: (valor: CampoFiltroValor) => void
  placeholder?: string
}>

export type FiltroLateralCadastroProps = Readonly<{
  title: string
  onFiltrar: () => void
  onLimpar: () => void
  labelFiltrar: string
  labelLimpar: string
  className?: string
  /** Conteúdo legado (campos montados no pai). Ignorado se `campos` tiver itens. */
  filtros?: ReactNode
  /** Campos declarativos (select, radio, search). */
  campos?: ReadonlyArray<CampoFiltro>
}>

function CampoFiltroCampo({
  campo,
  finIn,
  finSelect,
}: Readonly<{
  campo: CampoFiltro
  finIn: string
  finSelect: string
}>) {
  const id = `filtro-lateral-${campo.id}`

  if (campo.tipo === 'search') {
    const v = typeof campo.valor === 'string' ? campo.valor : ''
    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={id} className="gerente-fin-label text-[11px] font-medium app-muted">
          {campo.label}
        </label>
        <input
          id={id}
          type="search"
          value={v}
          placeholder={campo.placeholder}
          onChange={(e) => campo.onChange(e.target.value)}
          className={`${finIn} h-8`}
        />
      </div>
    )
  }

  if (campo.tipo === 'select') {
    const v = typeof campo.valor === 'string' ? campo.valor : ''
    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={id} className="gerente-fin-label text-[11px] font-medium app-muted">
          {campo.label}
        </label>
        <select
          id={id}
          value={v}
          onChange={(e) => campo.onChange(e.target.value)}
          className={`${finSelect} h-8`}
        >
          {(campo.opcoes ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    )
  }

  if (campo.tipo === 'radio') {
    const v = typeof campo.valor === 'string' ? campo.valor : ''
    return (
      <fieldset className="flex flex-col gap-1.5 border-0 p-0">
        <legend className="gerente-fin-label mb-0.5 text-[11px] font-medium app-muted">{campo.label}</legend>
        <div className="flex flex-col gap-1.5">
          {(campo.opcoes ?? []).map((o) => {
            const rid = `${id}-${o.value}`
            return (
              <label key={o.value} htmlFor={rid} className="flex cursor-pointer items-center gap-2 text-xs">
                <input
                  id={rid}
                  type="radio"
                  name={id}
                  value={o.value}
                  checked={v === o.value}
                  onChange={() => campo.onChange(o.value)}
                  className="h-3.5 w-3.5 app-border app-surface-soft"
                />
                <span>{o.label}</span>
              </label>
            )
          })}
        </div>
      </fieldset>
    )
  }

  return null
}

/**
 * Painel lateral de filtros (cadastro/listagens gerente).
 * Preferir `campos` para configuração declarativa; `filtros` permanece para compatibilidade.
 */
export function FiltroLateralCadastro({
  title,
  filtros,
  campos,
  onFiltrar,
  onLimpar,
  labelFiltrar,
  labelLimpar,
  className,
}: FiltroLateralCadastroProps) {
  const finIn = 'h-9 rounded-md px-3 text-xs app-input'
  const finSelect = 'h-9 rounded-md px-3 text-xs app-select'
  const usarCampos = (campos?.length ?? 0) > 0

  return (
    <aside
      className={cn(
        'dragon-glass-card flex flex-col gap-3 rounded-xl border p-4 app-border lg:sticky lg:top-4',
        className,
      )}
    >
      <h2 className="text-sm font-semibold tracking-wide app-accent-text">{title}</h2>
      <div className="flex flex-col gap-3">
        {usarCampos
          ? (campos ?? []).map((c) => <CampoFiltroCampo key={c.id} campo={c} finIn={finIn} finSelect={finSelect} />)
          : filtros}
      </div>
      <div className="mt-1 flex flex-col gap-2 border-t pt-3 app-divider sm:flex-row sm:flex-wrap sm:justify-end">
        <button
          type="button"
          className="rounded-lg px-3 py-2 text-xs font-semibold app-muted transition hover:underline"
          onClick={onLimpar}
        >
          {labelLimpar}
        </button>
        <button
          type="button"
          className="inline-flex min-h-[40px] min-w-[120px] items-center justify-center rounded-lg border px-4 py-2 text-sm font-semibold shadow-sm transition hover:opacity-90 app-border app-accent-text"
          onClick={onFiltrar}
        >
          {labelFiltrar}
        </button>
      </div>
    </aside>
  )
}
