'use client'

import { useState, type ButtonHTMLAttributes, type MouseEvent, type ReactNode } from 'react'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Button } from '@/components/ui/button'

type Props = Readonly<
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> & {
    confirmMessage: string
    confirmTitle?: string
    confirmLabel?: string
    cancelLabel?: string
    variant?: 'danger' | 'neutral'
    buttonVariant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
    onClick?: (event: MouseEvent<HTMLButtonElement>) => void
    children?: ReactNode
  }
>

/**
 * Botão com confirmação via ConfirmDialog (IX-CONFIRM).
 * Usa `Button` SSOT — sem `<button>` cru nem `admin-v2-btn-*`.
 */
export function ConfirmActionButton({
  confirmMessage,
  confirmTitle = 'Confirmar',
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'danger',
  buttonVariant = 'secondary',
  onClick,
  children,
  type = 'button',
  className,
  disabled,
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
    onClick({
      preventDefault() {},
      stopPropagation() {},
    } as MouseEvent<HTMLButtonElement>)
  }

  return (
    <>
      <Button
        {...props}
        type={type}
        disabled={disabled}
        className={className}
        variant={buttonVariant}
        size="sm"
        onClick={handleClick}
      >
        {children}
      </Button>
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
