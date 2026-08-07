'use client'

import { useState, type ButtonHTMLAttributes, type MouseEvent, type ReactNode } from 'react'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

type Props = Readonly<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    confirmMessage: string
    confirmTitle?: string
    confirmLabel?: string
    cancelLabel?: string
    variant?: 'danger' | 'neutral'
    children?: ReactNode
  }
>

/**
 * Botão com confirmação via ConfirmDialog (IX-CONFIRM / Sprint 0).
 * Substitui `window.confirm` / `globalThis.confirm`.
 */
export function ConfirmActionButton({
  confirmMessage,
  confirmTitle = 'Confirmar',
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'danger',
  onClick,
  children,
  type = 'button',
  ...props
}: Props) {
  const [open, setOpen] = useState(false)

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    setOpen(true)
  }

  const handleConfirm = () => {
    setOpen(false)
    if (!onClick) return
    // Consumidores atuais ignoram o evento; sintetizamos para manter a tipagem.
    onClick({
      preventDefault() {},
      stopPropagation() {},
    } as MouseEvent<HTMLButtonElement>)
  }

  return (
    <>
      <button {...props} type={type} onClick={handleClick}>
        {children}
      </button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={handleConfirm}
        title={confirmTitle}
        description={confirmMessage}
        confirmLabel={confirmLabel}
        cancelLabel={cancelLabel}
        variant={variant}
      />
    </>
  )
}
