import { type ReactNode } from 'react'
import '@/styles/admin-v2.css'
import { SessionIdleLogout } from '@/components/security/SessionIdleLogout'
import { SignOutButton } from '@/components/auth/SignOutButton'
import { painelGerencialHref } from '@/lib/navigation/painelGerencialNav'
import { getMessages, type Mensagens } from '@/i18n/getMessages'
import type { AdminSession } from '@/lib/admin/auth/types'
import { Logo } from '@/components/branding/Logo'
import { SidebarNav } from './SidebarNav'

type AdminV2ShellProps = {
  session: AdminSession
  children: ReactNode
}

export function AdminV2Shell({ session, children }: AdminV2ShellProps) {
  const { idioma } = session
  const chineseLanguage = idioma !== 'pt'
  const m: Mensagens = getMessages(idioma)
  const admin = m.admin
  const signOutLabel = chineseLanguage ? admin.common.signOut.cn : admin.common.signOut.pt

  return (
    <div data-admin-v2 className="isolate min-h-dvh min-h-screen bg-[#0a0a0a] text-jl-fg-1">
      <SessionIdleLogout />

      <header className="border-b border-[#242424] bg-[#0f0f0f]">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between md:px-8">
          <div className="min-w-0 flex-1">
            <h1 className="flex flex-wrap items-center gap-3 text-lg font-bold tracking-tight text-jl-fg-1 md:text-xl">
              <Logo
                variant="symbol"
                href={painelGerencialHref('dashboard')}
                aria-label={m.login.nav_marca}
                className="text-jl-accent"
              />
              <span>{chineseLanguage ? admin.header.brand.cn : admin.header.brand.pt}</span>
              {chineseLanguage ? (
                <span className="text-sm font-normal text-jl-fg-3 md:text-base">
                  {admin.header.brand.pt}
                </span>
              ) : null}
            </h1>
            <p className="mt-1 text-sm text-jl-fg-3">
              {chineseLanguage ? (
                <>
                  {admin.header.tagline.cn}
                  <span className="mx-2 text-jl-fg-3/70">|</span>
                  <span>{admin.header.tagline.pt}</span>
                </>
              ) : (
                admin.header.tagline.pt
              )}
            </p>
          </div>
          <SignOutButton
            label={signOutLabel}
            className="shrink-0 rounded-lg border border-[#242424] bg-[#111111] px-4 py-2 text-sm font-medium text-jl-fg-1 transition-colors hover:border-jl-accent/40 hover:bg-jl-card-l1-accent"
          />
        </div>
      </header>

      <div className="mx-auto flex min-h-[calc(100dvh-88px)] max-w-[1600px] flex-col lg:flex-row">
        <aside className="admin-v2-sidebar w-full shrink-0 border-b border-[#242424] lg:w-60 lg:border-b-0 lg:border-r">
          <SidebarNav admin={admin} chineseLanguage={chineseLanguage} />
        </aside>

        <main className="admin-v2-main relative min-w-0 flex-1">
          <div className="relative z-[1] min-h-full">{children}</div>
        </main>
      </div>
    </div>
  )
}
