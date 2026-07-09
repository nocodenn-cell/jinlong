import { type ReactNode } from 'react'
import Link from 'next/link'
import '@/styles/admin-v2.css'
import { SessionIdleLogout } from '@/components/security/SessionIdleLogout'
import { ROUTES } from '@shared-core/navigation/routes'
import { getMessages, type Mensagens } from '@/i18n/getMessages'
import type { AdminSession } from '@/lib/admin/auth/types'
import LanguageToggle from '@/app/gerente/idioma/LanguageToggle'
import { SidebarNav } from './SidebarNav'
import { SidebarUserFooter } from './SidebarUserFooter'

type AdminV2ShellProps = {
  session: AdminSession
  children: ReactNode
  /** Observabilidade visual (flag `pdv_config.show_stock_alerts`): contagem de itens em estoque baixo. */
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
        {/* ARIA landmark: complementary (sidebar navigation) */}
        <aside
          role="complementary"
          aria-label="Navegação"
          className="admin-v2-sidebar flex w-full shrink-0 flex-col border-b border-[var(--admin-v2-border)] lg:w-72 lg:border-b-0 lg:border-r"
        >
          <div className="flex items-center justify-center border-b border-[var(--admin-v2-border)] py-6 px-4">
            <Link
              href={ROUTES.admin.dashboard}
              aria-label={m.login.nav_marca}
              className="rounded-lg outline-none ring-offset-2 ring-offset-slate-950 focus-visible:ring-2 focus-visible:ring-amber-400/70"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- brand logo estático; dimensões fixas no CSS */}
              <img
                src="/branding/brand-double-dragon.png"
                alt="Jīn Lóng"
                className="h-28 w-auto drop-shadow-[0_0_12px_rgba(251,191,36,0.25)]"
                draggable={false}
              />
            </Link>
          </div>
          <SidebarNav admin={admin} chineseLanguage={chineseLanguage} stockAlertCount={stockAlertCount} />
          <div className="flex justify-center px-4 pb-1">
            <LanguageToggle idiomaAtual={idioma} />
          </div>
          <SidebarUserFooter session={session} />
        </aside>

        {/* ARIA landmark: main content area */}
        <main id="main-content" className="admin-v2-main relative min-w-0 flex-1">
          <div className="relative z-[1] min-h-full">{children}</div>
        </main>
      </div>
    </div>
  )
}
