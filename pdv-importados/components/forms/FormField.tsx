'use client'

import React, { useId } from 'react'

/**
 * FormField - Accessible form field wrapper with WCAG 2.1 AA compliance
 *
 * Provides consistent labeling, error handling, and hint text patterns.
 * Handles aria-labelledby, aria-describedby, and aria-invalid automatically.
 */

interface FormFieldProps {
  id: string
  label: string
  hint?: string
  error?: string
  required?: boolean
  children: React.ReactElement
  /** Optional className for the wrapper */
  className?: string
}

export const FormField = React.forwardRef<HTMLDivElement, FormFieldProps>(
  ({ id, label, hint, error, required, children, className = '' }, ref) => {
    const hintId = hint ? `${id}-hint` : undefined
    const errorId = error ? `${id}-error` : undefined
    const descriptionIds = [hintId, errorId].filter(Boolean).join(' ')

    const enhancedChild = React.cloneElement(children, {
      id,
      'aria-describedby': descriptionIds || undefined,
      'aria-invalid': !!error,
      'aria-required': required || undefined,
      ...children.props,
    } as React.HTMLAttributes<HTMLElement>)

    return (
      <div ref={ref} className={`form-field ${className}`.trim()}>
        <label htmlFor={id} className="block text-sm font-medium mb-1">
          {label}
          {required && (
            <span aria-label="obrigatório" className="text-red-500 ml-1">
              *
            </span>
          )}
        </label>

        {enhancedChild}

        {hint && (
          <p id={hintId} className="mt-1 text-xs text-muted-foreground">
            {hint}
          </p>
        )}

        {error && (
          <p
            id={errorId}
            className="mt-1 text-xs text-destructive"
            role="alert"
          >
            {error}
          </p>
        )}
      </div>
    )
  }
)

FormField.displayName = 'FormField'
