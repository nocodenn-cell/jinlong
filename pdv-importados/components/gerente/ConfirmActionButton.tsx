'use client'

import type { ButtonHTMLAttributes, MouseEvent } from 'react'

type Props = Readonly<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    confirmMessage: string
  }
>

/**
 * Botão com confirmação contextual padrão para ações destrutivas.
 * Mantém semântica nativa (submit/button) e cancela ação se usuário negar.
 */
export function ConfirmActionButton({ confirmMessage, onClick, ...props }: Props) {
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    const ok = window.confirm(confirmMessage)
    if (!ok) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    onClick?.(event)
  }

  return <button {...props} onClick={handleClick} />
}
