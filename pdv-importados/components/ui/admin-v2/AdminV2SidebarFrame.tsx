'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Preferência só visual (localStorage); não afeta sessão, permissões ou dados. */
export const SIDEBAR_COLLAPSED_STORAGE_KEY = 'jl.admin.sidebar.collapsed'

type AdminV2SidebarFrameProps = {
  children: ReactNode
  labelRecolher: string
  labelExpandir: string
}

/**
 * Moldura do menu lateral (>= lg): alterna entre largo (w-72) e recolhido (só ícones).
 * Os rótulos ficam no DOM (tooltip via `title`); o CSS em admin-v2.css os oculta quando recolhido.
 */
export function AdminV2SidebarFrame({ children, labelRecolher, labelExpandir }: AdminV2SidebarFrameProps) {
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === '1')
    } catch {
      /* storage indisponível: mantém expandido */
    }
  }, [])

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev
      try {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, next ? '1' : '0')
      } catch {
        /* ignora */
      }
      return next
    })
  }

  const label = collapsed ? labelExpandir : labelRecolher
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose

  return (
    <aside
      role="complementary"
      aria-label="Navegação"
      data-collapsed={collapsed ? 'true' : 'false'}
      data-testid="admin-v2-sidebar"
      className={cn(
        'admin-v2-sidebar sticky top-0 hidden h-dvh shrink-0 flex-col overflow-y-auto border-[var(--admin-v2-border)] transition-[width] duration-200 lg:flex lg:border-r',
        collapsed ? 'lg:w-[4.5rem]' : 'lg:w-72',
      )}
    >
      <div className="flex justify-end px-2 pt-2">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-label={label}
          title={label}
          data-testid="admin-v2-sidebar-toggle"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-jl-fg-3 transition-colors hover:bg-[var(--color-background-tertiary)] hover:text-jl-fg-1"
        >
          <Icon className="h-4 w-4" aria-hidden />
        </button>
      </div>
      {children}
    </aside>
  )
}
