'use client'

/**
 * FilterBar — filtros URL-driven Admin (Fase 2 · Onda 4, consolidado no DS).
 *
 * Padrão de filtros do Admin V2 (docs/claude-code-ux-roadmap.md): estado só na URL,
 * busca com debounce de 300 ms (Enter aplica na hora), Limpar só com filtro ativo e
 * `layout="grid"` para o grid responsivo (1 → 2 → 4 colunas). Presets de período
 * (7d / 30d / mês atual) entram como `pills`.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/forms'

export type FilterOption = { value: string; label: string }

export type FilterDef =
  | {
      type: 'pills'
      key: string
      label?: string
      options: FilterOption[]
      defaultValue?: string
    }
  | {
      type: 'select'
      key: string
      label?: string
      /** Opt-in: exibe `label` como texto visível ao lado do select (default: só aria-label). */
      showLabel?: boolean
      options: FilterOption[]
      defaultValue?: string
    }
  | {
      type: 'search'
      key: string
      label?: string
      placeholder?: string
      debounceMs?: number
      /** Classe do wrapper do campo de busca (opt-in; default preserva layout atual). */
      className?: string
      /** Classe do `<input>` (opt-in; default `w-44`). */
      inputClassName?: string
    }

const CHAVES_EXTRAS_VAZIAS: readonly string[] = []

/** Debounce padrão da busca (padrão de filtros do Admin V2). */
export const FILTER_SEARCH_DEBOUNCE_MS = 300

/**
 * `inline` (default): faixa compacta que quebra linha — contrato histórico dos consumidores.
 * `grid`: 1 coluna no mobile, 2 no `sm`, 4 no `lg`; cada controle ocupa a célula inteira.
 */
export type FilterBarLayout = 'inline' | 'grid'

const LAYOUT_CLASS: Record<FilterBarLayout, string> = {
  inline: 'flex flex-wrap items-center gap-2',
  grid: 'grid grid-cols-1 items-center gap-3 sm:grid-cols-2 lg:grid-cols-4',
}

function valorDeFiltroAtivo(filter: FilterDef, current: string | null): boolean {
  if (current === null || current.length === 0) return false
  if (filter.type !== 'search' && current === filter.defaultValue) return false
  return true
}

function haFiltroAtivo(
  filters: FilterDef[],
  get: (key: string) => string | null,
  extraClearKeys: readonly string[],
): boolean {
  if (filters.some((filter) => valorDeFiltroAtivo(filter, get(filter.key)))) return true
  return extraClearKeys.some((key) => {
    const current = get(key)
    return current !== null && current.length > 0
  })
}

type FilterBarProps = {
  filters: FilterDef[]
  clearable?: boolean
  clearLabel?: string
  /** Nome acessível da região. Default permanece o português histórico. */
  ariaLabel?: string
  /** Nome acessível do botão Limpar. Default permanece o português histórico. */
  clearAriaLabel?: string
  /**
   * Chaves extras removidas pelo Limpar (ex.: filtros avançados de outra barra).
   * Também fazem o botão aparecer quando só elas estão ativas.
   */
  extraClearKeys?: readonly string[]
  className?: string
  /**
   * Quando true, remove `page` da URL ao mudar/limpar filtros.
   * Opt-in: o default permanece o comportamento histórico (não reseta página).
   */
  resetPageOnChange?: boolean
  /** Disposição dos controles. Default `inline` (comportamento histórico). */
  layout?: FilterBarLayout
}

export function FilterBar({
  filters,
  clearable = true,
  clearLabel = 'Limpar',
  ariaLabel = 'Filtros de busca',
  clearAriaLabel = 'Limpar todos os filtros',
  extraClearKeys = CHAVES_EXTRAS_VAZIAS,
  className,
  resetPageOnChange = false,
  layout = 'inline',
}: FilterBarProps) {
  const fill = layout === 'grid'
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const setParam = useCallback(
    (key: string, value: string, defaultValue: string | undefined, replace: boolean) => {
      const params = new URLSearchParams(searchParams.toString())
      if (!value || value === defaultValue) {
        params.delete(key)
      } else {
        params.set(key, value)
      }
      if (resetPageOnChange) params.delete('page')
      const qs = params.toString()
      const url = qs ? `${pathname}?${qs}` : pathname
      if (replace) router.replace(url, { scroll: false })
      else router.push(url, { scroll: false })
    },
    [router, pathname, searchParams, resetPageOnChange],
  )

  const hasActive = haFiltroAtivo(filters, (key) => searchParams.get(key), extraClearKeys)

  const clearAll = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString())
    for (const f of filters) params.delete(f.key)
    for (const key of extraClearKeys) params.delete(key)
    if (resetPageOnChange) params.delete('page')
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [filters, extraClearKeys, searchParams, router, pathname, resetPageOnChange])

  return (
    <section
      role="search"
      aria-label={ariaLabel}
      data-layout={layout}
      className={cn(LAYOUT_CLASS[layout], className)}
    >
      {filters.map((filter) => {
        switch (filter.type) {
          case 'pills':
            return (
              <PillsControl
                key={filter.key}
                filter={filter}
                fill={fill}
                current={searchParams.get(filter.key) ?? filter.defaultValue ?? ''}
                onChange={(v) => setParam(filter.key, v, filter.defaultValue, false)}
              />
            )
          case 'select':
            return (
              <SelectControl
                key={filter.key}
                filter={filter}
                fill={fill}
                current={searchParams.get(filter.key) ?? filter.defaultValue ?? ''}
                onChange={(v) => setParam(filter.key, v, filter.defaultValue, false)}
              />
            )
          case 'search':
            return (
              <SearchControl
                key={filter.key}
                filter={filter}
                fill={fill}
                current={searchParams.get(filter.key) ?? ''}
                onCommit={(v) => setParam(filter.key, v, undefined, true)}
              />
            )
          default:
            return null
        }
      })}

      {clearable && hasActive ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={clearAll}
          aria-label={clearAriaLabel}
          className={cn('gap-1 text-caption text-fg-subtle', fill && 'justify-self-start')}
        >
          <X size={12} strokeWidth={2.5} aria-hidden />
          {clearLabel}
        </Button>
      ) : null}
    </section>
  )
}

function PillsControl({
  filter,
  fill,
  current,
  onChange,
}: {
  filter: Extract<FilterDef, { type: 'pills' }>
  fill: boolean
  current: string
  onChange: (value: string) => void
}) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-0.5 rounded-control border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-0.5',
        fill && 'w-full overflow-x-auto',
      )}
      role="group"
      aria-label={filter.label}
    >
      {filter.options.map((opt) => {
        const active = current === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            aria-label={`${opt.label}${active ? ' (ativo)' : ''}`}
            className={cn(
              'fp-focus-ring rounded-sm px-2.5 py-1 text-caption font-medium leading-none transition-colors',
              fill && 'shrink-0',
              active
                ? 'bg-[var(--color-info-bg)] text-brand'
                : 'text-fg-subtle hover:text-fg',
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

function SelectControl({
  filter,
  fill,
  current,
  onChange,
}: {
  filter: Extract<FilterDef, { type: 'select' }>
  fill: boolean
  current: string
  onChange: (value: string) => void
}) {
  const select = (
    <Select
      aria-label={filter.label}
      value={current}
      onChange={(e) => onChange(e.target.value)}
      controlSize="sm"
      className={fill ? 'w-full min-w-0' : 'w-auto min-w-[8rem]'}
    >
      {filter.options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </Select>
  )
  if (!filter.showLabel || !filter.label) return select
  return (
    <label
      className={cn(
        'inline-flex items-center gap-2 text-caption font-medium text-fg-subtle',
        fill && 'w-full',
      )}
    >
      <span>{filter.label}</span>
      {select}
    </label>
  )
}

function SearchControl({
  filter,
  fill,
  current,
  onCommit,
}: {
  filter: Extract<FilterDef, { type: 'search' }>
  fill: boolean
  current: string
  onCommit: (value: string) => void
}) {
  const [value, setValue] = useState(current)
  const debounceMs = filter.debounceMs ?? FILTER_SEARCH_DEBOUNCE_MS
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const committed = useRef(current)

  useEffect(() => {
    if (current !== committed.current) {
      committed.current = current
      setValue(current)
    }
  }, [current])

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  const schedule = (next: string) => {
    setValue(next)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      committed.current = next
      onCommit(next)
    }, debounceMs)
  }

  const flush = (next: string) => {
    if (timer.current) clearTimeout(timer.current)
    setValue(next)
    committed.current = next
    onCommit(next)
  }

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-control border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2.5 py-1.5',
        fill && 'w-full',
        filter.className,
      )}
    >
      <Search size={14} strokeWidth={2} aria-hidden className="text-fg-subtle" />
      <input
        type="text"
        value={value}
        placeholder={filter.placeholder ?? 'Buscar…'}
        aria-label={filter.label ?? filter.placeholder ?? 'Buscar'}
        onChange={(e) => schedule(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') flush(value)
        }}
        className={cn(
          'fp-focus-ring bg-transparent text-caption text-fg outline-none placeholder:text-fg-subtle',
          filter.inputClassName ?? (fill ? 'w-full min-w-0' : 'w-44'),
        )}
      />
      {value ? (
        <button
          type="button"
          onClick={() => flush('')}
          aria-label="Limpar busca"
          className="fp-focus-ring shrink-0 text-fg-subtle hover:text-fg"
        >
          <X size={12} strokeWidth={2.5} aria-hidden />
        </button>
      ) : null}
    </div>
  )
}
