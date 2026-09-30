'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, X } from 'lucide-react'
import { ROUTES } from '@/lib/navigation/routes'
import type { AdminSession } from '@/lib/admin/auth/types'
import type { Mensagens } from '@/i18n/getMessages'
import { SidebarNav } from './SidebarNav'
import { SidebarUserFooter } from './SidebarUserFooter'

type Props = Readonly<{
  session: AdminSession
  m: Mensagens
  chineseLanguage: boolean
  /** Observabilidade visual (flag `pdv_config.show_stock_alerts`): contagem de itens em estoque baixo. */
  stockAlertCount?: number
  /** Exibe itens `adminOnly` (wizard de provisionamento, etc.). */
  showAdminOnlyItems?: boolean
}>

/**
 * Navegação mobile do admin-v2. Abaixo de `lg` o `<aside>` fica oculto (não
 * cabe/não colapsa sozinho); um hamburger abre um drawer lateral com a mesma
 * `SidebarNav`/`SidebarUserFooter` já usadas no desktop — sem duplicar a
 * lista de itens de navegação. Espelha o padrão de `GerenteMobileNavDrawer`.
 */
export function AdminV2MobileNavDrawer({
  session,
  m,
  chineseLanguage,
  stockAlertCount,
  showAdminOnlyItems = false,
}: Props) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const closeBtnRef = useRef<HTMLButtonElement>(null)

  // Escape + trava de scroll + trap de Tab enquanto aberto.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        return
      }
      if (e.key !== 'Tab' || !panelRef.current) return
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (focusables.length === 0) return
      const first = focusables[0]!
      const last = focusables[focusables.length - 1]!
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open])

  // Foco entra no drawer ao abrir (botão fechar) e volta pro hamburger ao
  // fechar — mas só depois de já ter aberto uma vez: no mount inicial
  // `open` já começa false, e sem essa guarda o hamburger roubaria foco da
  // página sozinho, sem o usuário ter interagido com nada.
  const abriuAlgumaVezRef = useRef(false)
  useEffect(() => {
    if (open) {
      abriuAlgumaVezRef.current = true
      closeBtnRef.current?.focus()
    } else if (abriuAlgumaVezRef.current) {
      triggerRef.current?.focus()
    }
  }, [open])

  // Fecha ao navegar (mudança de rota).
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Navegação"
        aria-expanded={open}
        aria-haspopup="dialog"
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md text-jl-fg-2 transition-colors hover:bg-white/[0.05] hover:text-jl-fg-1"
      >
        <Menu className="h-5 w-5" aria-hidden />
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] lg:hidden" role="dialog" aria-modal="true" aria-label="Navegação">
          <div className="dragon-glass-backdrop absolute inset-0" onClick={() => setOpen(false)} aria-hidden />
          <div
            ref={panelRef}
            className="absolute inset-y-0 left-0 flex w-[82%] max-w-[20rem] flex-col overflow-y-auto bg-[var(--color-background-primary)] shadow-xl"
          >
            <div className="flex items-center justify-between gap-2 border-b border-[var(--admin-v2-border)] px-4 py-3">
              <Link
                href={ROUTES.admin.dashboard}
                aria-label={m.login.nav_marca}
                onClick={() => setOpen(false)}
                className="rounded-lg outline-none ring-offset-2 ring-offset-slate-950 focus-visible:ring-2 focus-visible:ring-amber-400/70"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- brand logo estático; dimensões fixas no CSS */}
                <img
                  src="/branding/brand-double-dragon.png"
                  alt="Jīn Lóng"
                  className="h-9 w-auto"
                  draggable={false}
                />
              </Link>
              <button
                ref={closeBtnRef}
                type="button"
                onClick={() => setOpen(false)}
                aria-label={m.comum.fechar}
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-jl-fg-3 transition-colors hover:bg-white/[0.06] hover:text-jl-fg-1"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            <SidebarNav
              admin={m.admin}
              chineseLanguage={chineseLanguage}
              stockAlertCount={stockAlertCount}
              showAdminOnlyItems={showAdminOnlyItems}
            />
            <SidebarUserFooter session={session} />
          </div>
        </div>
      )}
    </>
  )
}
