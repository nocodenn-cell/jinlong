'use client'

import { useEffect, useId, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type RowMenuItem = {
  id: string
  label: string
  href?: string
  onClick?: () => void
  disabled?: boolean
  danger?: boolean
  testId?: string
}

type Props = {
  label: string
  items: RowMenuItem[]
  onBeforeNavigate?: () => void
}

export function RowActionsMenu({ label, items, onBeforeNavigate }: Props) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  useMenuDismiss(open, btnRef, menuRef, () => fecharMenu(setOpen, btnRef, true))

  if (items.length === 0) return null

  return (
    <span className="inline-flex" onClick={(e) => e.stopPropagation()}>
      <Button
        ref={btnRef}
        type="button"
        size="icon"
        variant="ghost"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={label}
        onClick={() => setOpen((atual) => !atual)}
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden />
      </Button>
      {open ? (
        <MenuPortal
          menuId={menuId}
          label={label}
          items={items}
          menuRef={menuRef}
          anchor={btnRef.current?.getBoundingClientRect() ?? null}
          onBeforeNavigate={onBeforeNavigate}
          onClose={() => fecharMenu(setOpen, btnRef, false)}
        />
      ) : null}
    </span>
  )
}

function fecharMenu(
  setOpen: (v: boolean) => void,
  btnRef: RefObject<HTMLButtonElement | null>,
  devolverFoco: boolean,
) {
  setOpen(false)
  if (devolverFoco) btnRef.current?.focus()
}

function useMenuDismiss(
  open: boolean,
  btnRef: RefObject<HTMLButtonElement | null>,
  menuRef: RefObject<HTMLDivElement | null>,
  onEscape: () => void,
) {
  const onEscapeRef = useRef(onEscape)
  onEscapeRef.current = onEscape
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      onEscapeRef.current()
    }
    const onPointer = (e: MouseEvent) => {
      if (!cliqueFora(e.target, btnRef.current, menuRef.current)) return
      onEscapeRef.current()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onPointer)
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onPointer)
    }
  }, [open, btnRef, menuRef])
}

function cliqueFora(alvo: EventTarget | null, botao: Node | null, menu: Node | null): boolean {
  if (!(alvo instanceof Node)) return false
  if (botao?.contains(alvo) || menu?.contains(alvo)) return false
  return true
}

function MenuPortal({
  menuId,
  label,
  items,
  menuRef,
  anchor,
  onBeforeNavigate,
  onClose,
}: {
  menuId: string
  label: string
  items: RowMenuItem[]
  menuRef: RefObject<HTMLDivElement | null>
  anchor: DOMRect | null
  onBeforeNavigate?: () => void
  onClose: () => void
}) {
  if (!anchor || typeof document === 'undefined') return null
  return createPortal(
    <div
      ref={menuRef}
      id={menuId}
      role="menu"
      aria-label={label}
      style={posicaoMenu(anchor)}
      className="fixed z-[var(--z-popover)] min-w-[12rem] overflow-hidden rounded-control border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-md"
    >
      {items.map((item) => (
        <ItemMenu key={item.id} item={item} onBeforeNavigate={onBeforeNavigate} onClose={onClose} />
      ))}
    </div>,
    document.body,
  )
}

function posicaoMenu(anchor: DOMRect): { top: number; left: number } {
  const largura = 192
  const left = Math.min(Math.max(8, anchor.right - largura), window.innerWidth - largura - 8)
  return { top: anchor.bottom + 4, left }
}

function ItemMenu({
  item,
  onBeforeNavigate,
  onClose,
}: {
  item: RowMenuItem
  onBeforeNavigate?: () => void
  onClose: () => void
}) {
  const className = cn(
    'flex w-full items-center px-3 py-2 text-left text-small',
    item.danger ? 'text-[var(--color-danger-strong)]' : 'text-fg',
    'hover:bg-[var(--color-surface-soft)]',
    item.disabled && 'pointer-events-none opacity-40',
  )
  if (item.href && !item.disabled) {
    return (
      <Link
        href={item.href}
        role="menuitem"
        data-testid={item.testId}
        className={className}
        onClick={() => {
          onBeforeNavigate?.()
          onClose()
        }}
      >
        {item.label}
      </Link>
    )
  }
  return (
    <button
      type="button"
      role="menuitem"
      data-testid={item.testId}
      disabled={item.disabled}
      className={className}
      onClick={() => {
        item.onClick?.()
        onClose()
      }}
    >
      {item.label}
    </button>
  )
}
