import { Suspense, type ReactNode } from 'react'
import Link from 'next/link'
import '@/styles/admin-v2.css'
import '@/styles/admin-theme.css'
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
import { AdminV2UtilityBar } from './AdminV2UtilityBar'
import { AdminV2SidebarFrame } from './AdminV2SidebarFrame'
import { AdminV2Topbar, type AdminV2TopbarContext } from './AdminV2Topbar'

function SidebarNavFallback() {
  return <nav className="flex flex-col gap-6 p-3 lg:p-4" aria-busy="true" aria-label="Navegação" />
}

type AdminV2ShellProps = {
  session: AdminSession
  children: ReactNode
  /** Observabilidade visual (flag `pdv_config.show_stock_alerts`): contagem de itens em estoque baixo. */
  stockAlertCount?: number
  /** Empresa ativa para a barra superior (best-effort, opcional). */
  topbar?: AdminV2TopbarContext
}

export function AdminV2Shell({ session, children, stockAlertCount, topbar }: AdminV2ShellProps) {
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
        {/* Mobile: idioma/Sair sempre à mão (no desktop moram no rodapé do menu lateral). */}
        <AdminV2UtilityBar compact />
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
        {/* ARIA landmark: complementary (sidebar navigation, recolhível) — só >= lg; < lg usa AdminV2MobileNavDrawer */}
        <AdminV2SidebarFrame
          labelRecolher={m.admin_ui.sidebar_recolher}
          labelExpandir={m.admin_ui.sidebar_expandir}
        >
          <div className="admin-v2-sidebar-brand flex items-center justify-center border-b border-[var(--admin-v2-border)] pb-4 pt-1 px-4">
            <Link
              href={ROUTES.admin.dashboard}
              aria-label={m.login.nav_marca}
              className="rounded-lg outline-none ring-offset-2 ring-offset-slate-950 focus-visible:ring-2 focus-visible:ring-amber-400/70"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- brand logo estático; dimensões fixas no CSS */}
              <img
                src="/branding/brand-double-dragon.png"
                alt="Jīn Lóng"
                className="admin-v2-sidebar-logo h-20 w-auto"
                draggable={false}
              />
            </Link>
          </div>
          <Suspense fallback={<SidebarNavFallback />}>
            <SidebarNav
              admin={admin}
              chineseLanguage={chineseLanguage}
              stockAlertCount={stockAlertCount}
              showAdminOnlyItems={session.perfil === 'ADMIN'}
            />
          </Suspense>
          <div className="admin-v2-sidebar-footer mt-auto">
            <SidebarUserFooter session={session} showUtilityBar={false} />
          </div>
        </AdminV2SidebarFrame>

        {/* ARIA landmark: main content area */}
        <main id="main-content" className="admin-v2-main relative min-w-0 flex-1">
          <AdminV2Topbar
            ui={m.admin_ui}
            stockAlertCount={stockAlertCount}
            empresaNome={topbar?.empresaNome}
            podeTrocarEmpresa={topbar?.podeTrocarEmpresa}
          />
          <div className="relative z-[1] min-h-full">{children}</div>
        </main>
      </div>
    </div>
    </AdminV2SessionProvider>
  )
}
