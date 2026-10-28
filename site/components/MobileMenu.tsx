'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export interface MenuLink {
  href: string
  label: string
}

interface MobileMenuProps {
  links: readonly MenuLink[]
  loginHref: string
  loginLabel: string
  openLabel: string
  closeLabel: string
}

const FOCUSABLE = 'a[href], button:not([disabled])'

function trapTab(event: KeyboardEvent, panel: HTMLElement | null, button: HTMLElement | null) {
  const items = [button, ...(panel?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])].filter(
    (item): item is HTMLElement => item !== null
  )
  const first = items[0]
  const last = items[items.length - 1]
  if (!first || !last) return
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

/** Menu hambúrguer: aria-expanded, foco preso, Esc fecha e devolve o foco ao botão. */
export function MobileMenu({ links, loginHref, loginLabel, openLabel, closeLabel }: MobileMenuProps) {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false)
    if (restoreFocus) buttonRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close(true)
      if (event.key === 'Tab') trapTab(event, panelRef.current, buttonRef.current)
    }
    document.addEventListener('keydown', onKey)
    panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [open, close])

  return (
    <>
      <button
        ref={buttonRef}
        className="jl-menu-btn"
        type="button"
        aria-expanded={open}
        aria-controls="menu-mobile"
        aria-label={open ? closeLabel : openLabel}
        onClick={() => setOpen((value) => !value)}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>
      <div id="menu-mobile" ref={panelRef} className="jl-mobile-menu" data-open={open}>
        <ul>
          {links.map((link) => (
            <li key={link.href}>
              <a href={link.href} onClick={() => close(false)}>
                {link.label}
              </a>
            </li>
          ))}
        </ul>
        <a className="jl-menu-login" href={loginHref}>
          {loginLabel}
        </a>
      </div>
    </>
  )
}
