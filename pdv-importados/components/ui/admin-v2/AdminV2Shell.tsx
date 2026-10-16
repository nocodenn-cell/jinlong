import { Suspense, type ReactNode } from 'react'
import Link from 'next/link'
import '@/styles/admin-v2.css'
import { SessionIdleLogout } from '@/components/security/SessionIdleLogout'
import { ROUTES } from '@/lib/navigation/routes'
import { getMessages, type Mensagens } from '@/i18n/getMessages'
import type { AdminSession } from '@/lib/admin/auth/types'
import { AdminV2SessionProvider } from './AdminV2SessionContext'
import { AdminV2MobileNavDrawer } from './AdminV2MobileNavDrawer'
import { SidebarNav } from './SidebarNav'
import { SidebarUserFooter } from './SidebarUserFooter'
import { CommandPalette } from './CommandPalette'
import { CommandPaletteTrigger } from './CommandPaletteTrigger'

function SidebarNavFallback() {
  return <nav className="flex flex-col gap-6 p-3 lg:p-4" aria-busy="true" aria-label="Navegação" />
}

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
    // Provider no topo: o rodapé do menu (idioma/Sair) também lê o idioma da sessão.
    <AdminV2SessionProvider idioma={idioma}>
    <div data-admin-v2 className="isolate min-h-dvh min-h-screen bg-[var(--color-background-primary)] text-jl-fg-1">
      <SessionIdleLogout />
      <CommandPalette idioma={idioma} showAdminOnlyItems={session.perfil === 'ADMIN'} />

      {/* Top bar só < lg: marca compacta + hamburger, já que o <aside> fica oculto nesse breakpoint. */}
      <div className="flex items-center justify-between border-b border-[var(--admin-v2-border)] px-4 py-2.5 lg:hidden">
        <Link
          href={ROUTES.admin.dashboard}
          aria-label={m.login.nav_marca}
          className="rounded-lg outline-none ring-offset-2 ring-offset-slate-950 focus-visible:ring-2 focus-visible:ring-amber-400/70"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- brand logo estático; dimensões fixas no CSS */}
          <img
            src="/branding/brand-double-dragon.png"
            alt="Jīn Lóng"
            className="h-10 w-auto"
            draggable={false}
          />
        </Link>
        <div className="flex items-center gap-2">
        <CommandPaletteTrigger compact label={m.admin_ui.command_palette_trigger} />
        <AdminV2MobileNavDrawer
          session={session}
          m={m}
          chineseLanguage={chineseLanguage}
          stockAlertCount={stockAlertCount}
          showAdminOnlyItems={session.perfil === 'ADMIN'}
        />
        </div>
      </div>

      <div className="mx-auto flex min-h-dvh max-w-[1600px] flex-col lg:flex-row">
        {/* ARIA landmark: complementary (sidebar navigation) — só >= lg; < lg usa AdminV2MobileNavDrawer */}
        <aside
          role="complementary"
          aria-label="Navegação"
          className="admin-v2-sidebar hidden shrink-0 flex-col border-[var(--admin-v2-border)] lg:flex lg:w-72 lg:border-r"
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
          <div className="px-3 pt-3 lg:px-4">
            <CommandPaletteTrigger label={m.admin_ui.command_palette_trigger} />
          </div>
          <Suspense fallback={<SidebarNavFallback />}>
            <SidebarNav
              admin={admin}
              chineseLanguage={chineseLanguage}
              stockAlertCount={stockAlertCount}
              showAdminOnlyItems={session.perfil === 'ADMIN'}
            />
          </Suspense>
          <SidebarUserFooter session={session} />
        </aside>

        {/* ARIA landmark: main content area */}
        <main id="main-content" className="admin-v2-main relative min-w-0 flex-1">
          <div className="relative z-[1] min-h-full">{children}</div>
        </main>
      </div>
    </div>
    </AdminV2SessionProvider>
  )
}
