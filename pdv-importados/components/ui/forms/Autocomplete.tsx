'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { Input } from './Input'

export type AutocompleteOption = {
  value: string
  label: string
}

export type AutocompleteProps = {
  id?: string
  value: string
  onChange: (value: string) => void
  options: AutocompleteOption[]
  placeholder?: string
  disabled?: boolean
  readOnly?: boolean
  className?: string
  emptyLabel?: string
  'aria-label'?: string
}

/**
 * Autocomplete nativo (listbox) — sem Radix Combobox ainda.
 * Mesmo Field/focus/tamanho dos demais controles.
 */
export function Autocomplete({
  id,
  value,
  onChange,
  options,
  placeholder,
  disabled,
  readOnly,
  className,
  emptyLabel = 'Nenhuma opção',
  'aria-label': ariaLabel,
}: AutocompleteProps) {
  const listId = id ? `${id}-list` : undefined
  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(value.trim().toLowerCase()),
  )
  const showList = value.trim().length > 0 && !readOnly && !disabled

  return (
    <div className={cn('relative', className)}>
      <Input
        id={id}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        value={value}
        disabled={disabled}
        readOnly={readOnly}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
      />
      {showList ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-[var(--z-dropdown)] mt-1 max-h-48 w-full overflow-auto rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-md)]"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-caption text-[var(--color-fg-subtle)]">{emptyLabel}</li>
          ) : (
            filtered.map((opt) => (
              <li key={opt.value} role="option" aria-selected={false}>
                <button
                  type="button"
                  className="fp-focus-ring w-full px-3 py-2 text-left text-body text-[var(--color-fg)] hover:bg-[var(--color-surface-soft)]"
                  onClick={() => onChange(opt.label)}
                >
                  {opt.label}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  )
}
