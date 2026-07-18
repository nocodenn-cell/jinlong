import type { KeyboardEvent } from 'react'

/** Enter avança foco — cadastro rápido (scanner-first). */
export function focusOnEnter(
  e: KeyboardEvent<HTMLElement>,
  next: HTMLElement | null | undefined,
): void {
  if (e.key !== 'Enter') return
  e.preventDefault()
  next?.focus()
  if (next instanceof HTMLInputElement) next.select()
}
