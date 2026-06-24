import { type ReactNode } from 'react'
import Link from 'next/link'
import '@/styles/admin-v2.css'
import { SessionIdleLogout } from '@/components/security/SessionIdleLogout'
import { ROUTES } from '@shared-core/navigation/routes'
import { getMessages, type Mensagens } from '@/i18n/getMessages'
import type { AdminSession } from '@/lib/admin/auth/types'
import { SidebarNav } from './SidebarNav'
import { SidebarUserFooter } from './SidebarUserFooter'

type AdminV2ShellProps = {
  session: AdminSession
  children: ReactNode
  stockAlertCount?: number
}

export function AdminV2Shell({ session, children, stockAlertCount }: AdminV2ShellProps) {
  const { idioma } = session
  const chineseLanguage = idioma !== 'pt'
  const m: Mensagens = getMessages(idioma)
  const admin = m.admin

  return (
    <div data-admin-v2 className="isolate min-h-dvh min-h-screen bg-[var(--color-background-primary)] text-jl-fg-1">
      <SessionIdleLogout />
      <div className="mx-auto flex min-h-dvh max-w-[1600px] flex-col lg:flex-row">

        {/* ── Sidebar ────────────────────────────────────────────────────── */}
        <aside className="admin-v2-sidebar flex w-full shrink-0 flex-col border-b border-[var(--admin-v2-border)] lg:w-64 lg:border-b-0 lg:border-r">

          {/* Header compacto — estilo Bling: logo pequeno + nome do sistema */}
          <div className="flex items-center gap-3 border-b border-[var(--admin-v2-border)] px-4 py-3">
            <Link
              href={ROUTES.admin.dashboard}
              aria-label={m.login.nav_marca}
              className="flex items-center gap-3 rounded-md outline-none ring-offset-2 ring-offset-slate-950 focus-visible:ring-2 focus-visible:ring-amber-400/70"
            >
              <img
                src="/branding/brand-double-dragon.png"
                alt="Jīn Lóng"
                className="h-9 w-auto shrink-0 drop-shadow-[0_0_8px_rgba(251,191,36,0.2)]"
                draggable={false}
              />
              <div className="flex flex-col gap-0.5">
                <span className="text-[13px] font-semibold leading-none text-jl-fg-1">FastProduct</span>
                <span className="text-[10px] leading-none text-jl-fg-3">Gestão de loja</span>
              </div>
            </Link>
          </div>

          {/* Navegação — scroll interno para menus longos */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <SidebarNav admin={admin} chineseLanguage={chineseLanguage} stockAlertCount={stockAlertCount} />
          </div>

          <SidebarUserFooter session={session} />
        </aside>

        {/* ── Conteúdo principal ─────────────────────────────────────────── */}
        <main className="admin-v2-main relative min-w-0 flex-1">
          <div className="relative z-[1] min-h-full">{children}</div>
        </main>

      </div>
    </div>
  )
}
