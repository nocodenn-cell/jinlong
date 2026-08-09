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
      /** Classe extra do input (ex.: ampliar busca em telas operacionais). */
      inputClassName?: string
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
      const qs = params.toString()
      const url = qs ? `${pathname}?${qs}` : pathname
      if (replace) router.replace(url, { scroll: false })
      else router.push(url, { scroll: false })
    },
    [router, pathname, searchParams],
  )

  const hasActive = filters.some((f) => {
    const current = searchParams.get(f.key)
    if (current === null) return false
    if (f.type !== 'search' && current === f.defaultValue) return false
    return current.length > 0
  })

  const clearAll = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString())
    for (const f of filters) params.delete(f.key)
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
    <div className="inline-flex items-center gap-1.5">
      {filter.label ? (
        <span className="shrink-0 text-caption text-fg-subtle">{filter.label}</span>
      ) : null}
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
    <div
      className={cn(
        'inline-flex min-w-0 items-center gap-1.5 rounded-control border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2.5 py-1.5',
        filter.inputClassName ? 'flex-1 sm:flex-none' : null,
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
          'fp-focus-ring w-44 min-w-0 bg-transparent text-caption text-fg outline-none placeholder:text-fg-subtle',
          filter.inputClassName,
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
