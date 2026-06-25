import { type ReactNode } from 'react'
import Link from 'next/link'
import '@/styles/admin-v2.css'
import { SessionIdleLogout } from '@/components/security/SessionIdleLogout'
import { ROUTES } from '@shared-core/navigation/routes'
import { getMessages, type Mensagens } from '@/i18n/getMessages'
import type { AdminSession } from '@/lib/admin/auth/types'
import { SidebarNav } from './SidebarNav'
import { SidebarUserFooter } from './SidebarUserFooter'
import { AdminTopbar } from './AdminTopbar'

type AdminV2ShellProps = {
  session: AdminSession
  children: ReactNode
  /** Observabilidade visual (flag `pdv_config.show_stock_alerts`): contagem de itens em estoque baixo. */
  stockAlertCount?: number
}

function resolveUserName(session: AdminSession): string {
  const metadata = session.user.user_metadata as Record<string, unknown> | null
  const fullName = typeof metadata?.full_name === 'string' ? metadata.full_name.trim() : ''
  if (fullName) return fullName
  const name = typeof metadata?.name === 'string' ? metadata.name.trim() : ''
  if (name) return name
  return session.user.email?.split('@')[0]?.trim() ?? 'Usuário'
}

function resolveUserCargo(session: AdminSession): string {
  if (session.perfil === 'DONO') return 'Dono'
  if (session.perfil === 'ADMIN') return 'Administrador'
  if (session.perfil === 'GERENTE') return 'Gerente'
  return 'Operador'
}

export function AdminV2Shell({ session, children, stockAlertCount }: AdminV2ShellProps) {
  const { idioma } = session
  const m: Mensagens = getMessages(idioma)
  const admin = m.admin
  const userName = resolveUserName(session)
  const userCargo = resolveUserCargo(session)

  return (
    <div data-admin-v2 className="isolate min-h-dvh min-h-screen bg-[var(--color-background-primary)] text-jl-fg-1">
      <SessionIdleLogout />
      <div className="mx-auto flex min-h-dvh max-w-[1600px] flex-col lg:flex-row">
        <aside className="admin-v2-sidebar flex w-full shrink-0 flex-col border-b border-[var(--admin-v2-border)] lg:w-72 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-center border-b border-[var(--admin-v2-border)] py-6 px-4">
            <Link
              href={ROUTES.admin.dashboard}
              aria-label={m.login.nav_marca}
              className="rounded-lg outline-none ring-offset-2 ring-offset-slate-800 focus-visible:ring-2 focus-visible:ring-blue-400/70"
            >
              <img
                src="/branding/brand-double-dragon.png"
                alt="FastProduct"
                className="h-10 w-auto"
                draggable={false}
              />
            </Link>
          </div>
          <SidebarNav admin={admin} stockAlertCount={stockAlertCount} />
          <SidebarUserFooter session={session} />
        </aside>

        <main className="admin-v2-main relative min-w-0 flex-1">
          <AdminTopbar userName={userName} userCargo={userCargo} />
          <div className="relative z-[1] min-h-full">{children}</div>
        </main>
      </div>
    </div>
  )
}
