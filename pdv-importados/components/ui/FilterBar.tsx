'use client'

/**
 * FastProduct Admin — FilterBar (Admin V2)
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

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
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
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
        <button
          type="button"
          onClick={clearAll}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-medium text-jl-fg-3 transition-colors hover:text-jl-fg-1"
        >
          <X size={12} strokeWidth={2.5} aria-hidden />
          {clearLabel}
        </button>
      ) : null}
    </div>
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
      className="inline-flex items-center gap-0.5 rounded-md border border-[#242424] bg-[#111111] p-[3px]"
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
            className={cn(
              'rounded-[5px] px-2.5 py-1 text-[11px] font-medium leading-none transition-colors',
              active
                ? 'bg-jl-card-l1-accent text-jl-accent'
                : 'text-jl-fg-3 hover:text-jl-fg-1',
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
    <select
      aria-label={filter.label}
      value={current}
      onChange={(e) => onChange(e.target.value)}
      className="admin-v2-input rounded-md px-2.5 py-[7px] text-[12px] outline-none transition-colors"
    >
      {filter.options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
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
    <div className="inline-flex items-center gap-1.5 rounded-md border border-[#242424] bg-[#111111] px-2.5 py-[7px]">
      <Search size={13} strokeWidth={2} aria-hidden className="text-jl-fg-3" />
      <input
        type="text"
        value={value}
        placeholder={filter.placeholder ?? 'Buscar…'}
        aria-label={filter.label ?? filter.placeholder ?? 'Buscar'}
        onChange={(e) => schedule(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') flush(value)
        }}
        className="w-44 bg-transparent text-[12px] text-jl-fg-1 outline-none placeholder:text-jl-fg-3"
      />
      {value ? (
        <button
          type="button"
          onClick={() => flush('')}
          aria-label="Limpar busca"
          className="shrink-0 text-jl-fg-3 hover:text-jl-fg-1"
        >
          <X size={12} strokeWidth={2.5} aria-hidden />
        </button>
      ) : null}
    </div>
  )
}
