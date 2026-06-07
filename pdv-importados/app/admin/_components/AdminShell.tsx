import { type ReactNode } from 'react'
import { SessionIdleLogout } from '@/components/security/SessionIdleLogout'
import { SignOutButton } from '@/components/auth/SignOutButton'
import { adminChineseUiEnabled } from '@/lib/i18n/adminChineseUiLabels'
import { painelGerencialHref } from '@/lib/navigation/painelGerencialNav'
import { getMessages, type Mensagens } from '@/i18n/getMessages'
import type { AdminSession } from '@/lib/admin/auth/types'
import { Logo } from '@/components/branding/Logo'
import { AdminSidebar } from './AdminSidebar'

type AdminShellProps = {
  session: AdminSession
  children: ReactNode
}

export function AdminShell({ session, children }: AdminShellProps) {
  const chineseThemeOn = adminChineseUiEnabled()
  const { idioma } = session
  const chineseLanguage = idioma !== 'pt'
  const m: Mensagens = getMessages(idioma)
  const admin = m.admin
  const signOutLabel = chineseLanguage ? admin.common.signOut.cn : admin.common.signOut.pt

  return (
    <div
      className={[
        'min-h-screen',
        chineseThemeOn ? `admin-chinese-theme bg-[#f5f0eb]` : 'bg-slate-100',
      ].join(' ')}
    >
      <SessionIdleLogout />

      <header
        className={
          chineseThemeOn
            ? 'relative overflow-hidden bg-gradient-to-r from-[#2d5a4a] to-[#1a3a2f] text-white'
            : 'border-b border-slate-200 bg-slate-900 text-white'
        }
      >
        {chineseThemeOn ? (
          <div
            className="pointer-events-none absolute inset-0 bg-[url('/images/chinese-mountains.svg')] bg-bottom bg-repeat-x [background-size:100%_auto]"
            aria-hidden
          />
        ) : null}
        <div className="relative mx-auto max-w-[1600px] px-4 py-5 md:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <h1 className="flex flex-wrap items-center gap-3 text-xl font-bold tracking-tight md:text-2xl">
                <Logo
                  variant="symbol"
                  href={painelGerencialHref('dashboard')}
                  aria-label={m.login.nav_marca}
                  className={chineseThemeOn ? 'text-amber-300' : 'text-amber-600'}
                />
                {chineseThemeOn ? (
                  <span
                    className="text-2xl"
                    aria-hidden
                    title="Lanterna chinesa — Painel Administrativo"
                  >
                    🏮
                  </span>
                ) : null}
                <span>{chineseLanguage ? admin.header.brand.cn : admin.header.brand.pt}</span>
                {chineseLanguage ? (
                  <span className="text-sm font-normal text-[#e8c547] md:text-base">
                    {admin.header.brand.pt}
                  </span>
                ) : null}
              </h1>
              <p className="mt-1 text-sm text-white/80">
                {chineseLanguage ? (
                  <>
                    {admin.header.tagline.cn}
                    <span className="mx-2 text-[#e8c547]/90">|</span>
                    <span className="text-white/70">{admin.header.tagline.pt}</span>
                  </>
                ) : (
                  admin.header.tagline.pt
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <SignOutButton
                label={signOutLabel}
                className={
                  chineseThemeOn
                    ? 'shrink-0 rounded-lg border border-white/30 bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20'
                    : 'shrink-0 rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700'
                }
              />
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto flex min-h-[calc(100vh-120px)] max-w-[1600px] flex-col lg:flex-row">
        <AdminSidebar
          admin={admin}
          chineseLanguage={chineseLanguage}
          chineseThemeOn={chineseThemeOn}
        />

        <main className="relative min-w-0 flex-1 bg-white lg:bg-transparent">
          {chineseThemeOn ? <div className="cloud-decoration" /> : null}
          <div
            className={
              chineseThemeOn
                ? 'admin-chinese-theme relative z-[1] min-h-full'
                : 'relative z-[1] min-h-full'
            }
          >
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
