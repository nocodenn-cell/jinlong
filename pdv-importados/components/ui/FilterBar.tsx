'use client'

/**
 * FastProduct Admin — FilterBar (Fase 2)
 *
 * Barra de filtros do painel /admin. O estado vive INTEIRAMENTE na URL
 * (useSearchParams + useRouter) — nada de useState isolado para os valores.
 * Isso é deliberado: o gerente precisa copiar a URL com os filtros aplicados
 * e reabrir em outra aba / compartilhar.
 *
 * Tipos de controle suportados:
 *   - 'pills'  → grupo de opções mutuamente exclusivas (segmented control)
 *   - 'select' → dropdown nativo
 *   - 'search' → input de texto com debounce (usa replace p/ não poluir histórico)
 *
 * Convenção: quando um filtro volta ao `defaultValue` (ou vazio), a chave é
 * REMOVIDA da query — URLs ficam limpas e o "estado zero" é a URL sem params.
 *
 * IMPORTANTE: por usar useSearchParams, a página que monta este componente deve
 * envolvê-lo num <Suspense> (exigência do Next 15 App Router).
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
      /** ms de debounce antes de escrever na URL. Default 350. */
      debounceMs?: number
    }

type FilterBarProps = {
  filters: FilterDef[]
  /** Mostra o botão "Limpar" quando há ao menos um filtro ativo. Default true. */
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

  /** Escreve um valor na URL; remove a chave se vazio ou igual ao default. */
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
    [router, pathname, searchParams]
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
          className="inline-flex items-center gap-1 rounded-[6px] px-2 py-1.5 text-[11px] font-medium transition-colors"
          style={{ color: 'var(--fp-text-muted)' }}
        >
          <X size={12} strokeWidth={2.5} aria-hidden />
          {clearLabel}
        </button>
      ) : null}
    </div>
  )
}

// ─── Pills (segmented control) ──────────────────────────────────────────────

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
      className="inline-flex items-center gap-0.5 rounded-[6px] p-[3px]"
      style={{
        background: 'var(--fp-bg-secondary)',
        border: '1px solid var(--fp-border)',
      }}
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
            className="rounded-[5px] px-2.5 py-1 text-[11px] font-medium leading-none transition-colors"
            style={{
              background: active ? 'var(--fp-bg-active)' : 'transparent',
              color: active ? 'var(--fp-text-primary)' : 'var(--fp-text-muted)',
            }}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

// ─── Select (dropdown nativo) ───────────────────────────────────────────────

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
      className="rounded-[6px] px-2.5 py-[7px] text-[12px] outline-none transition-colors"
      style={{
        background: 'var(--fp-bg-secondary)',
        border: '1px solid var(--fp-border)',
        color: 'var(--fp-text-primary)',
      }}
    >
      {filter.options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  )
}

// ─── Search (input com debounce) ────────────────────────────────────────────

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
  // Última string já enviada à URL — evita re-commit em sync externo (back/forward).
  const committed = useRef(current)

  // Sincroniza quando a URL muda por fora (navegação, limpar tudo).
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
      className="inline-flex items-center gap-1.5 rounded-[6px] px-2.5 py-[7px]"
      style={{
        background: 'var(--fp-bg-secondary)',
        border: '1px solid var(--fp-border)',
      }}
    >
      <Search size={13} strokeWidth={2} aria-hidden style={{ color: 'var(--fp-text-muted)' }} />
      <input
        type="text"
        value={value}
        placeholder={filter.placeholder ?? 'Buscar…'}
        aria-label={filter.label ?? filter.placeholder ?? 'Buscar'}
        onChange={(e) => schedule(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') flush(value)
        }}
        className="w-44 bg-transparent text-[12px] outline-none placeholder:text-[var(--fp-text-muted)]"
        style={{ color: 'var(--fp-text-primary)' }}
      />
      {value ? (
        <button
          type="button"
          onClick={() => flush('')}
          aria-label="Limpar busca"
          className="shrink-0"
          style={{ color: 'var(--fp-text-muted)' }}
        >
          <X size={12} strokeWidth={2.5} aria-hidden />
        </button>
      ) : null}
    </div>
  )
}
