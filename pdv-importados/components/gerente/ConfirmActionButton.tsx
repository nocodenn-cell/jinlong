'use client'

import type { ButtonHTMLAttributes, MouseEvent } from 'react'
import { useConfirmDialog } from '@/components/ui/useConfirmDialog'

type Props = Readonly<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    confirmMessage: string
  }
>

/**
 * Botão com confirmação contextual padrão para ações destrutivas.
 *
 * A confirmação é o diálogo do Design System (`useConfirmDialog` → `DragonModal`), não
 * `confirm()` do navegador (sprint UX 2026-11-27, onda A). Como o diálogo é assíncrono, o
 * clique original é sempre interrompido; após "Confirmar":
 *  - `type="button"`: chama `onClick` com o evento original;
 *  - `submit` (padrão do `<button>`): chama `onClick` e reenvia o formulário com `requestSubmit`
 *    usando este botão como submitter (preserva `name`/`value`/`formAction`).
 */
export function ConfirmActionButton({ confirmMessage, onClick, ...props }: Props) {
  const { confirmar, dialogo } = useConfirmDialog()

  const handleClick = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const botao = event.currentTarget
    if (!(await confirmar({ titulo: confirmMessage }))) return
    onClick?.(event)
    const tipo = props.type ?? 'submit'
    if (tipo === 'submit' && botao.form) {
      botao.form.requestSubmit(botao)
    }
  }

  return (
    <>
      <button {...props} onClick={handleClick} />
      {dialogo}
    </>
  )
}
