'use client'

import type { ReactNode } from 'react'
import { useEffect, useRef } from 'react'
import { SignOutButton } from '@/components/auth/SignOutButton'
import { Logo } from '@/components/branding/Logo'
import { GerenteHeaderNav } from '@/components/gerente/GerenteHeaderNav'
import { GerenteToastViewport } from '@/components/gerente/GerenteToastViewport'
import { SessionIdleLogout } from '@/components/security/SessionIdleLogout'
import { GerenteThemeToggle } from '@/components/gerente/GerenteThemeToggle'
import { useGerenteUiTheme } from '@/components/gerente/GerenteThemeContext'
import { isGerenteLightChrome } from '@/components/gerente/gerenteUiTheme'
import type { Mensagens } from '@/i18n/getMessages'
import type { Idioma } from '@/idioma/normalizeIdioma'
import type { PerfilUsuario } from '@/idioma/usuarioIdioma'
import { normalizePerfilUsuario } from '@/idioma/normalizePerfilUsuario'
import { isPerfilPainelGerencial } from '@/lib/auth/painelGerencial'
import LanguageToggle from '@/app/gerente/idioma/LanguageToggle'
import { GerenteTableDensityProvider } from '@/components/gerente/GerenteTableDensityContext'
import { GerenteTableDensityToggle } from '@/components/gerente/GerenteTableDensityToggle'
import { cn } from '@/lib/utils'

type Props = Readonly<{
  children: ReactNode
  idioma: Idioma
  perfil: PerfilUsuario
  m: Mensagens
  logoSubtitle: string
}>

function GerenteLayoutInner({ children, idioma, perfil, m, logoSubtitle }: Props) {
  const shellRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLElement>(null)
  const { theme } = useGerenteUiTheme()
  const chromeLight = isGerenteLightChrome(theme)
  const podeTrocarIdioma = isPerfilPainelGerencial(normalizePerfilUsuario(perfil))
  const langToggleVariant = chromeLight ? 'dragon-light' : 'dragon'
  const roleBadgeLabel =
    perfil === 'DONO'
      ? m.gerente.badge_dono
      : perfil === 'ADMIN'
        ? m.gerente.badge_admin
        : m.gerente.badge_gerente
  const roleBadgeClass = cn(
    'inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wide',
    perfil === 'DONO' ? 'app-badge-warn' : perfil === 'ADMIN' ? 'app-chip' : 'app-badge-positive',
  )

  const FONT_FAMILY: Record<string, string> = {
    zh: 'var(--font-noto-sc),"Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif',
  }

  useEffect(() => {
    const shell = shellRef.current
    const header = headerRef.current
    if (!shell || !header || typeof ResizeObserver === 'undefined') return

    const applyStickyTop = () => {
      const h = header.getBoundingClientRect().height
      const gapPx = 8
      shell.style.setProperty('--gerente-sticky-top', `${Math.max(Math.ceil(h + gapPx), 48)}px`)
    }

    applyStickyTop()
    const ro = new ResizeObserver(applyStickyTop)
    ro.observe(header)
    return () => ro.disconnect()
  }, [theme, idioma])

  return (
    <div
      ref={shellRef}
      data-app-theme={theme}
      data-gerente-ui-theme={theme === 'novem' ? 'dragon-light' : 'dragon-dark'}
      className={cn(
        'gerente-shell relative min-h-screen overflow-x-visible overflow-y-visible antialiased transition-[background-color,color] duration-200',
        theme === 'noturno' && 'app-surface app-surface-text',
        theme === 'novem' && 'app-surface app-surface-text',
      )}
      style={{
        fontFamily: FONT_FAMILY[idioma] ?? 'inherit',
      }}
    >
      <SessionIdleLogout />
      <GerenteToastViewport />

      <header
        ref={headerRef}
        className={cn(
          'gerente-compact-header sticky top-0 z-30 relative overflow-hidden border-b bg-oriental-clouds print:hidden',
          'app-divider shadow-sm',
        )}
      >
        <div
          className={cn(
            'pointer-events-none absolute inset-0 z-0 dragon-glass-backdrop',
            theme === 'noturno' && 'opacity-[0.82]',
            chromeLight && 'opacity-[0.55]',
          )}
          aria-hidden
        />
        <div className="relative z-[1] flex flex-wrap items-start justify-between gap-3 px-4 py-2.5 sm:px-6">
          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-end sm:gap-4">
            <Logo
              variant="full"
              logoSubtitle={logoSubtitle}
              href="/gerente"
              aria-label={m.login.nav_marca}
              className={cn('gerente-compact-brand shrink-0 sm:items-end app-accent-text')}
            />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5 overflow-hidden sm:min-w-[12rem]">
              <div
                className={cn(
                  'text-[11px] font-semibold uppercase tracking-wide',
                  'app-muted',
                )}
              >
                {m.gerente.titulo_painel}
              </div>
              <GerenteHeaderNav m={m} />
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5 sm:gap-2">
            <span className={roleBadgeClass}>{roleBadgeLabel}</span>
            <GerenteThemeToggle
              labelDark={m.gerente.theme_escuro}
              labelLight={m.gerente.theme_claro}
              ariaLabel={m.gerente.theme_toggle_aria}
            />
            <GerenteTableDensityToggle m={m} />
            {podeTrocarIdioma ? <LanguageToggle idiomaAtual={idioma} variant={langToggleVariant} /> : null}
            <SignOutButton
              label={m.comum.sair}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-semibold shadow-sm backdrop-blur-sm transition-colors',
                'app-btn-neutral',
              )}
            />
          </div>
        </div>
      </header>

      {/*
        Sticky (ex.: GerenteStickyToolbar) ancora ao viewport; um ancestral com overflow
        não-visible quebra esse comportamento. Manter overflow visível no main.
      */}
      <main className="relative z-[1] overflow-x-visible overflow-y-visible">{children}</main>

      <div
        className={cn(
          'gerente-watermark-char pointer-events-none fixed bottom-4 right-2 z-0 select-none font-serif text-9xl leading-none print:hidden',
          'app-subtle opacity-35',
        )}
        aria-hidden
      >
        祿
      </div>
    </div>
  )
}

export function GerenteLayoutShell(props: Props) {
  return (
    <GerenteTableDensityProvider>
      <GerenteLayoutInner {...props} />
    </GerenteTableDensityProvider>
  )
}