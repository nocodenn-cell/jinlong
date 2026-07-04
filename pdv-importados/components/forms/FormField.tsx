'use client'

import React, { useId } from 'react'

/**
 * FormField - Accessible form field wrapper with WCAG 2.1 AA compliance
 *
 * Wraps form inputs with automatic aria attribute handling for:
 * - Label associations (htmlFor/id)
 * - Error messages (aria-invalid + aria-describedby)
 * - Helper text (aria-describedby)
 * - Required field indicators (aria-required)
 *
 * Usage:
 * ```tsx
 * <FormField
 *   id="email"
 *   label="Email"
 *   hint="Your work email"
 *   error={errors.email}
 *   required
 * >
 *   <input type="email" />
 * </FormField>
 * ```
 */

interface FormFieldProps {
  id: string
  label: string
  hint?: string
  error?: string
  required?: boolean
  children: React.ReactElement<any>
  className?: string
}

export const FormField = React.forwardRef<HTMLDivElement, FormFieldProps>(
  ({ id, label, hint, error, required, children, className = '' }, ref) => {
    const hintId = hint ? `${id}-hint` : undefined
    const errorId = error ? `${id}-error` : undefined
    const descriptionIds = [hintId, errorId].filter(Boolean).join(' ')

    // Clone child with ARIA attributes for accessibility
    const enhancedChild = React.cloneElement(children, {
      id,
      'aria-describedby': descriptionIds || undefined,
      'aria-invalid': !!error,
      'aria-required': required || undefined,
    })

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
