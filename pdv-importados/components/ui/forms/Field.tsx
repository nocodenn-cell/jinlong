'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

export type FieldProps = {
  id: string
  label: string
  hint?: string
  error?: string
  success?: string
  required?: boolean
  className?: string
  children: React.ReactElement<Record<string, unknown>>
}

/**
 * Field — contrato único de label / helper / erro / sucesso (Onda 2).
 */
export const Field = React.forwardRef<HTMLDivElement, FieldProps>(
  ({ id, label, hint, error, success, required, className, children }, ref) => {
    const hintId = hint ? `${id}-hint` : undefined
    const errorId = error ? `${id}-error` : undefined
    const successId = success ? `${id}-success` : undefined
    const describedBy = [hintId, errorId, successId].filter(Boolean).join(' ') || undefined
    const invalid = Boolean(error)

    const control = React.cloneElement(children, {
      id,
      'aria-invalid': invalid || undefined,
      'aria-required': required || undefined,
      'aria-describedby': describedBy,
      'data-invalid': invalid ? 'true' : undefined,
      'data-success': success && !error ? 'true' : undefined,
    })

    return (
      <div ref={ref} className={cn('flex flex-col gap-1.5', className)}>
        <label htmlFor={id} className="text-small font-medium text-[var(--color-fg)]">
          {label}
          {required ? (
            <span className="ml-0.5 text-[var(--color-danger)]" aria-hidden>
              *
            </span>
          ) : null}
        </label>
        {control}
        {hint && !error && !success ? (
          <p id={hintId} className="text-caption text-[var(--color-fg-subtle)]">
            {hint}
          </p>
        ) : null}
        {error ? (
          <p id={errorId} role="alert" className="text-caption text-[var(--color-danger)]">
            {error}
          </p>
        ) : null}
        {success && !error ? (
          <p id={successId} className="text-caption text-[var(--color-success-strong)]">
            {success}
          </p>
        ) : null}
      </div>
    )
  },
)
Field.displayName = 'Field'
