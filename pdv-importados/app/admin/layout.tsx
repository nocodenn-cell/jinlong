import type { ReactNode } from 'react'
import Link from 'next/link'
import {
  ArrowRightLeft,
  Building2,
  Coins,
  Inbox,
  LayoutDashboard,
  LayoutGrid,
  LineChart,
  Package,
  ShoppingBag,
  ShoppingCart,
} from 'lucide-react'
import { SessionIdleLogout } from '@/components/security/SessionIdleLogout'
import { SignOutButton } from '@/components/auth/SignOutButton'
import { adminChineseUiEnabled } from '@/lib/i18n/adminChineseUiLabels'
import { getUsuarioIdioma, isGerenteOuDono } from '@/src/lib/idioma/usuarioIdioma'
import { getMessages } from '@/src/lib/i18n/getMessages'
import LanguageToggle from '@/app/gerente/idioma/LanguageToggle'
import '@/styles/chinese-theme.css'

const adminNavItems = [
  { href: '/admin/dashboard', labelKey: 'dashboard' as const, icon: LayoutDashboard },
  { href: '/gerente', labelKey: 'gerente' as const, icon: LayoutGrid },
  { href: '/gerente/produtos', labelKey: 'produtos' as const, icon: ShoppingBag },
  { href: '/gerente/vendas', labelKey: 'vendas' as const, icon: ShoppingCart },
  { href: '/gerente/estoque', labelKey: 'estoque' as const, icon: Package },
  { href: '/gerente/recebimento', labelKey: 'recebimento' as const, icon: Inbox },
  { href: '/gerente/transferencias', labelKey: 'transferencias' as const, icon: ArrowRightLeft },
  { href: '/gerente/financeiro', labelKey: 'financeiro' as const, icon: Coins },
  { href: '/gerente/caixas', labelKey: 'caixas' as const, icon: Building2 },
  { href: '/gerente/relatorios', labelKey: 'relatorios' as const, icon: LineChart },
] as const

type BilingualLine = { pt: string; cn: string }

function lineBoth(line: BilingualLine): string {
  return `${line.cn} · ${line.pt}`
}

function navLabels(line: BilingualLine, chineseLanguage: boolean): { primary: string; secondary: string } {
  if (!chineseLanguage) return { primary: line.pt, secondary: '' }
  return { primary: line.cn, secondary: line.pt }
}

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const chineseThemeOn = adminChineseUiEnabled()
  const { idioma, perfil } = await getUsuarioIdioma()
  const m = getMessages(idioma)
  const admin = m.admin
  const chineseLanguage = idioma !== 'pt'
  const signOutLabel = chineseLanguage ? admin.common.signOut.cn : admin.common.signOut.pt
  const podeTrocarIdioma = isGerenteOuDono(perfil)

  return (
    <div
      className={[
        'min-h-screen',
        chineseThemeOn
          ? `admin-chinese-theme bg-[#f5f0eb]`
          : 'bg-slate-100',
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
              <h1 className="flex flex-wrap items-center gap-2 text-xl font-bold tracking-tight md:text-2xl">
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
              {podeTrocarIdioma ? <LanguageToggle idiomaAtual={idioma} /> : null}
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
        <aside
          className={
            chineseThemeOn
              ? 'relative w-full border-b border-[#3d3d3d] bg-[#2c2c2c] text-white lg:w-64 lg:border-b-0 lg:border-r'
              : 'relative w-full border-b border-slate-200 bg-white lg:w-56 lg:border-b-0 lg:border-r'
          }
        >
          <nav className="flex flex-wrap gap-1 p-3 lg:flex-col lg:gap-0.5">
            {adminNavItems.map((item) => {
              const line = admin.nav[item.labelKey]
              const { primary, secondary } = navLabels(line, chineseLanguage)
              const hint = admin.navHints[item.labelKey]
              const label = chineseLanguage ? lineBoth(line) : line.pt
              const linkTitle = `${label} — ${hint}`
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={linkTitle}
                  className={
                    chineseThemeOn
                      ? 'group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-[#c42e2e] lg:px-4'
                      : 'flex items-center gap-3 rounded-lg px-3 py-2.5 text-slate-800 transition-colors hover:bg-slate-100 lg:px-4'
                  }
                >
                  <item.icon
                    className={
                      chineseThemeOn
                        ? 'h-5 w-5 shrink-0 opacity-75 group-hover:opacity-100'
                        : 'h-5 w-5 shrink-0 text-slate-500'
                    }
                    strokeWidth={1.75}
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-medium leading-tight">{primary}</div>
                    {secondary ? (
                      <div
                        className={
                          chineseThemeOn
                            ? 'text-[11px] leading-tight text-white/55'
                            : 'text-[11px] leading-tight text-slate-500'
                        }
                      >
                        {secondary}
                      </div>
                    ) : null}
                  </div>
                </Link>
              )
            })}
          </nav>
          {chineseThemeOn ? (
            <div
              className="pointer-events-none absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-black/25 to-transparent lg:block"
              aria-hidden
            />
          ) : null}
        </aside>

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
