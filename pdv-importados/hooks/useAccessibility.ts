import { useId } from 'react'

/**
 * useAccessibility - Utility hook for accessibility ID generation
 *
 * Generates consistent IDs for aria-describedby, aria-labelledby, and aria-controls
 */

export function useAccessibility(baseId?: string) {
  const uniqueId = useId()
  const id = baseId || uniqueId

  return {
    id,
    labelId: `${id}-label`,
    descriptionId: `${id}-description`,
    errorId: `${id}-error`,
    hintId: `${id}-hint`,
    statusId: `${id}-status`,
  }
}

/**
 * Combine multiple IDs for aria-describedby
 * Filters out undefined/null values
 */
export function combineAriaIds(...ids: (string | undefined)[]): string | undefined {
  const filtered = ids.filter(Boolean) as string[]
  return filtered.length > 0 ? filtered.join(' ') : undefined
}

/**
 * Get sr-only className for screen reader only text
 * Usage: <span className={srOnlyClass}>Text for screen readers only</span>
 */
export const srOnlyClass = 'sr-only'
