'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Loader2, Search, X } from 'lucide-react'
import { useDebounce } from '@/lib/hooks/useDebounce'
import { cn } from '@/lib/utils'
import { Input } from './Input'

export type EntityLookupOption = {
  value: string
  label: string
  description?: string
}

type EntityLookupProps = {
  value: string | null
  selectedLabel?: string
  onSelect: (option: EntityLookupOption | null) => void
  /** Busca async — SSOT de lookup remoto (IX-LOOKUP). */
  onSearch: (query: string) => Promise<EntityLookupOption[]>
  placeholder?: string
  disabled?: boolean
  debounceMs?: number
  minChars?: number
  emptyLabel?: string
  minCharsLabel?: string
  clearLabel?: string
  className?: string
  'aria-label'?: string
}

/**
 * EntityLookup — autocomplete async de entidade (Sprint 0 / UX-S0-24).
 * Não usar `Autocomplete` client-only para catálogos remotos.
 */
export function EntityLookup({
  value,
  selectedLabel,
  onSelect,
  onSearch,
  placeholder = 'Buscar…',
  disabled,
  debounceMs = 300,
  minChars = 2,
  emptyLabel = 'Nenhum resultado',
  minCharsLabel = 'Digite ao menos 2 caracteres',
  clearLabel = 'Limpar',
  className,
  'aria-label': ariaLabel,
}: EntityLookupProps) {
  const listId = useId()
  const [termo, setTermo] = useState(selectedLabel ?? '')
  const [opcoes, setOpcoes] = useState<EntityLookupOption[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const debounced = useDebounce(termo, debounceMs)
  const wrapRef = useRef<HTMLDivElement>(null)
  const onSearchRef = useRef(onSearch)
  onSearchRef.current = onSearch

  useEffect(() => {
    if (selectedLabel != null) setTermo(selectedLabel)
  }, [selectedLabel])

  useEffect(() => {
    let cancelled = false
    const q = debounced.trim()
    if (q.length < minChars) {
      setOpcoes([])
      setLoading(false)
      return
    }
    setLoading(true)
    void onSearchRef
      .current(q)
      .then((rows) => {
        if (!cancelled) {
          setOpcoes(rows)
          setActive(0)
          setOpen(true)
        }
      })
      .catch(() => {
        if (!cancelled) setOpcoes([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [debounced, minChars])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const showList = open && !disabled && termo.trim().length >= minChars

  const pick = (opt: EntityLookupOption) => {
    onSelect(opt)
    setTermo(opt.label)
    setOpen(false)
  }

  const clear = () => {
    onSelect(null)
    setTermo('')
    setOpcoes([])
    setOpen(false)
  }

  return (
    <div ref={wrapRef} className={cn('relative', className)}>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle"
          aria-hidden
        />
        <Input
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label={ariaLabel}
          aria-activedescendant={showList && opcoes[active] ? `${listId}-${active}` : undefined}
          value={termo}
          disabled={disabled}
          placeholder={placeholder}
          className="pl-8 pr-8"
          autoComplete="off"
          onChange={(e) => {
            setTermo(e.target.value)
            if (value) onSelect(null)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (!showList || opcoes.length === 0) return
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActive((i) => Math.min(i + 1, opcoes.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((i) => Math.max(i - 1, 0))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              const opt = opcoes[active]
              if (opt) pick(opt)
            } else if (e.key === 'Escape') {
              e.preventDefault()
              setOpen(false)
            }
          }}
        />
        {loading ? (
          <Loader2
            className="absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-fg-subtle"
            aria-hidden
          />
        ) : termo ? (
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg"
            aria-label={clearLabel}
            onClick={clear}
          >
            <X className="size-3.5" aria-hidden />
          </button>
        ) : null}
      </div>
      {showList ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-[var(--z-dropdown)] mt-1 max-h-56 w-full overflow-auto rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-md)]"
        >
          {termo.trim().length < minChars ? (
            <li className="px-3 py-2 text-caption text-fg-subtle">{minCharsLabel}</li>
          ) : loading ? (
            <li className="px-3 py-2 text-caption text-fg-subtle">…</li>
          ) : opcoes.length === 0 ? (
            <li className="px-3 py-2 text-caption text-fg-subtle">{emptyLabel}</li>
          ) : (
            opcoes.map((opt, idx) => (
              <li
                key={opt.value}
                id={`${listId}-${idx}`}
                role="option"
                aria-selected={idx === active}
              >
                <button
                  type="button"
                  className={cn(
                    'fp-focus-ring w-full px-3 py-2 text-left text-body hover:bg-[var(--color-surface-soft)]',
                    idx === active && 'bg-[var(--color-surface-soft)]',
                  )}
                  onMouseEnter={() => setActive(idx)}
                  onClick={() => pick(opt)}
                >
                  <span className="block text-fg">{opt.label}</span>
                  {opt.description ? (
                    <span className="block text-caption text-fg-subtle">{opt.description}</span>
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
      {value ? <input type="hidden" name="entity_lookup_id" value={value} readOnly /> : null}
    </div>
  )
}
