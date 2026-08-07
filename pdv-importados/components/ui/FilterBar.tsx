'use client'

/**
 * FilterBar — filtros URL-driven Admin (Fase 2 · Onda 4, consolidado no DS).
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
      options: FilterOption[]
      defaultValue?: string
    }
  | {
      type: 'search'
      key: string
      label?: string
      placeholder?: string
      debounceMs?: number
    }
  | {
      /** Intervalo de datas (from/to) — Sprint 0 / IX-FILTER. */
      type: 'daterange'
      keyFrom: string
      keyTo: string
      label?: string
      fromLabel?: string
      toLabel?: string
    }

type FilterBarProps = {
  filters: FilterDef[]
  clearable?: boolean
  clearLabel?: string
  className?: string
}

export function FilterBar({
  filters,
  clearable = true,
  clearLabel = 'Limpar',
  className,
}: FilterBarProps) {
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
      // IX-FILTER / UX-S0-25: mudança de filtro reseta página.
      params.delete('page')
      const qs = params.toString()
      const url = qs ? `${pathname}?${qs}` : pathname
      if (replace) router.replace(url, { scroll: false })
      else router.push(url, { scroll: false })
    },
    [router, pathname, searchParams],
  )

  const setDateRange = useCallback(
    (keyFrom: string, keyTo: string, from: string, to: string, replace: boolean) => {
      const params = new URLSearchParams(searchParams.toString())
      if (!from) params.delete(keyFrom)
      else params.set(keyFrom, from)
      if (!to) params.delete(keyTo)
      else params.set(keyTo, to)
      params.delete('page')
      const qs = params.toString()
      const url = qs ? `${pathname}?${qs}` : pathname
      if (replace) router.replace(url, { scroll: false })
      else router.push(url, { scroll: false })
    },
    [router, pathname, searchParams],
  )

  const hasActive = filters.some((f) => {
    if (f.type === 'daterange') {
      return Boolean(searchParams.get(f.keyFrom) || searchParams.get(f.keyTo))
    }
    const current = searchParams.get(f.key)
    if (current === null) return false
    if (f.type !== 'search' && current === f.defaultValue) return false
    return current.length > 0
  })

  const clearAll = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString())
    for (const f of filters) {
      if (f.type === 'daterange') {
        params.delete(f.keyFrom)
        params.delete(f.keyTo)
      } else {
        params.delete(f.key)
      }
    }
    params.delete('page')
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [filters, searchParams, router, pathname])

  return (
    <section
      role="search"
      aria-label="Filtros de busca"
      className={cn('flex flex-wrap items-center gap-2', className)}
    >
      {filters.map((filter) => {
        switch (filter.type) {
          case 'pills':
            return (
              <PillsControl
                key={filter.key}
                filter={filter}
                current={searchParams.get(filter.key) ?? filter.defaultValue ?? ''}
                onChange={(v) => setParam(filter.key, v, filter.defaultValue, false)}
              />
            )
          case 'select':
            return (
              <SelectControl
                key={filter.key}
                filter={filter}
                current={searchParams.get(filter.key) ?? filter.defaultValue ?? ''}
                onChange={(v) => setParam(filter.key, v, filter.defaultValue, false)}
              />
            )
          case 'search':
            return (
              <SearchControl
                key={filter.key}
                filter={filter}
                current={searchParams.get(filter.key) ?? ''}
                onCommit={(v) => setParam(filter.key, v, undefined, true)}
              />
            )
          case 'daterange':
            return (
              <DateRangeControl
                key={`${filter.keyFrom}-${filter.keyTo}`}
                filter={filter}
                from={searchParams.get(filter.keyFrom) ?? ''}
                to={searchParams.get(filter.keyTo) ?? ''}
                onCommit={(from, to) =>
                  setDateRange(filter.keyFrom, filter.keyTo, from, to, true)
                }
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
          aria-label="Limpar todos os filtros"
          className="gap-1 text-caption text-fg-subtle"
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
  current,
  onChange,
}: {
  filter: Extract<FilterDef, { type: 'pills' }>
  current: string
  onChange: (value: string) => void
}) {
  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-control border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-0.5"
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
  current,
  onChange,
}: {
  filter: Extract<FilterDef, { type: 'select' }>
  current: string
  onChange: (value: string) => void
}) {
  return (
    <Select
      aria-label={filter.label}
      value={current}
      onChange={(e) => onChange(e.target.value)}
      controlSize="sm"
      className="w-auto min-w-[8rem]"
    >
      {filter.options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </Select>
  )
}

function DateRangeControl({
  filter,
  from,
  to,
  onCommit,
}: {
  filter: Extract<FilterDef, { type: 'daterange' }>
  from: string
  to: string
  onCommit: (from: string, to: string) => void
}) {
  return (
    <div
      className="inline-flex flex-wrap items-center gap-1.5 rounded-control border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2 py-1"
      role="group"
      aria-label={filter.label ?? 'Período'}
    >
      <label className="flex items-center gap-1 text-caption text-fg-subtle">
        <span className="sr-only">{filter.fromLabel ?? 'De'}</span>
        <input
          type="date"
          value={from}
          aria-label={filter.fromLabel ?? 'Data inicial'}
          onChange={(e) => onCommit(e.target.value, to)}
          className="fp-focus-ring bg-transparent text-caption text-fg outline-none"
        />
      </label>
      <span aria-hidden className="text-fg-subtle">
        –
      </span>
      <label className="flex items-center gap-1 text-caption text-fg-subtle">
        <span className="sr-only">{filter.toLabel ?? 'Até'}</span>
        <input
          type="date"
          value={to}
          aria-label={filter.toLabel ?? 'Data final'}
          onChange={(e) => onCommit(from, e.target.value)}
          className="fp-focus-ring bg-transparent text-caption text-fg outline-none"
        />
      </label>
    </div>
  )
}

function SearchControl({
  filter,
  current,
  onCommit,
}: {
  filter: Extract<FilterDef, { type: 'search' }>
  current: string
  onCommit: (value: string) => void
}) {
  const [value, setValue] = useState(current)
  const debounceMs = filter.debounceMs ?? 350
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
    committed.current = next
    onCommit(next)
  }

  return (
    <div className="inline-flex items-center gap-1.5 rounded-control border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2.5 py-1.5">
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
        className="fp-focus-ring w-44 bg-transparent text-caption text-fg outline-none placeholder:text-fg-subtle"
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
