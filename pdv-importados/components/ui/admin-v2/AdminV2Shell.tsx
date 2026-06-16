import { type ReactNode } from 'react'
import '@/styles/admin-v2.css'
import { SessionIdleLogout } from '@/components/security/SessionIdleLogout'
import { ROUTES } from '@shared-core/navigation/routes'
import { getMessages, type Mensagens } from '@/i18n/getMessages'
import type { AdminSession } from '@/lib/admin/auth/types'
import { Logo } from '@/components/branding/Logo'
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
    <div data-admin-v2 className="isolate min-h-dvh min-h-screen bg-[#0a0a0a] text-jl-fg-1">
      <SessionIdleLogout />
      <div className="mx-auto flex min-h-dvh max-w-[1600px] flex-col lg:flex-row">
        <aside className="admin-v2-sidebar flex w-full shrink-0 flex-col border-b border-[var(--admin-v2-border)] lg:w-72 lg:border-b-0 lg:border-r">
          <div className="border-b border-[var(--admin-v2-border)] p-4">
            <Logo
              variant="symbol"
              href={ROUTES.admin.dashboard}
              aria-label={m.login.nav_marca}
              className="text-jl-accent"
            />
          </div>
          <SidebarNav admin={admin} chineseLanguage={chineseLanguage} stockAlertCount={stockAlertCount} />
          <SidebarUserFooter session={session} />
        </aside>

        <main className="admin-v2-main relative min-w-0 flex-1">
          <div className="relative z-[1] min-h-full">{children}</div>
        </main>
      </div>
    </div>
  )
}
