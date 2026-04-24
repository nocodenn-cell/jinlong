'use client'

import type { ReactNode } from 'react'
import { SignOutButton } from '@/components/auth/SignOutButton'
import { Logo } from '@/components/branding/Logo'
import { GerenteHeaderNav } from '@/components/gerente/GerenteHeaderNav'
import { GerenteToastViewport } from '@/components/gerente/GerenteToastViewport'
import { SessionIdleLogout } from '@/components/security/SessionIdleLogout'
import { GerenteThemeToggle } from '@/components/gerente/GerenteThemeToggle'
import { GerenteUiThemeProvider, useGerenteUiTheme } from '@/components/gerente/GerenteThemeContext'
import { isGerenteLightChrome } from '@/components/gerente/gerenteUiTheme'
import type { Mensagens } from '@/i18n/getMessages'
import type { Idioma } from '@/idioma/normalizeIdioma'
import type { PerfilUsuario } from '@/idioma/usuarioIdioma'
import { isPerfilPainelGerencial } from '@/lib/auth/painelGerencial'
import LanguageToggle from '@/app/gerente/idioma/LanguageToggle'
import { cn } from '@/lib/utils'

type Props = Readonly<{
  children: ReactNode
  idioma: Idioma
  perfil: PerfilUsuario
  m: Mensagens
  logoSubtitle: string
}>

function GerenteLayoutInner({ children, idioma, perfil, m, logoSubtitle }: Props) {
  const { theme } = useGerenteUiTheme()
  const chromeLight = isGerenteLightChrome(theme)
  const podeTrocarIdioma = isPerfilPainelGerencial(perfil)
  const langToggleVariant = chromeLight ? 'dragon-light' : 'dragon'

  const FONT_FAMILY: Record<string, string> = {
    zh: 'var(--font-noto-sc),"Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif',
    'zh-HK':
      'var(--font-noto-tc),"Noto Sans TC","MingLiU","Microsoft JhengHei",sans-serif',
  }

  return (
    <div
      data-gerente-ui-theme={theme}
      className={cn(
        'gerente-shell relative min-h-screen antialiased transition-[background-color,color] duration-200',
        theme === 'dragon-dark' && 'bg-slate-950 text-slate-100',
        theme === 'dragon-light' && 'bg-stone-50 text-slate-900',
      )}
      style={{
        fontFamily: FONT_FAMILY[idioma] ?? 'inherit',
      }}
    >
      <SessionIdleLogout />
      <GerenteToastViewport />

      <header
        className={cn(
          'relative overflow-hidden border-b bg-oriental-clouds',
          theme === 'dragon-dark' && 'border-slate-700/50',
          theme === 'dragon-light' && 'border-amber-200/40',
        )}
      >
        <div
          className={cn(
            'pointer-events-none absolute inset-0 z-0 dragon-glass-backdrop',
            theme === 'dragon-dark' && 'opacity-[0.82]',
            chromeLight && 'opacity-[0.55]',
          )}
          aria-hidden
        />
        <div className="relative z-[1] flex flex-wrap items-start justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-end sm:gap-6">
            <Logo
              variant="full"
              logoSubtitle={logoSubtitle}
              href="/gerente"
              aria-label={m.login.nav_marca}
              className={cn('shrink-0 sm:items-end', theme === 'dragon-dark' ? 'text-amber-500' : 'text-amber-700')}
            />
            <div className="flex min-w-0 flex-col gap-2">
              <div
                className={cn(
                  'text-xs font-semibold uppercase tracking-wide',
                  theme === 'dragon-dark' && 'text-slate-400',
                  chromeLight && 'text-slate-600',
                )}
              >
                {m.gerente.titulo_painel}
              </div>
              <GerenteHeaderNav m={m} />
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 sm:gap-3">
            <GerenteThemeToggle
              labelDark={m.gerente.theme_escuro}
              labelLight={m.gerente.theme_claro}
              ariaLabel={m.gerente.theme_toggle_aria}
            />
            {podeTrocarIdioma ? <LanguageToggle idiomaAtual={idioma} variant={langToggleVariant} /> : null}
            <SignOutButton
              label={m.comum.sair}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-semibold shadow-sm backdrop-blur-sm transition-colors',
                theme === 'dragon-dark' &&
                  'border border-amber-500/35 bg-slate-950/60 text-amber-100 hover:border-amber-400/60 hover:bg-slate-900/80 hover:text-amber-50',
                theme === 'dragon-light' &&
                  'border border-amber-600/40 bg-white/90 text-amber-950 hover:border-amber-500/70 hover:bg-amber-50/90',
              )}
            />
          </div>
        </div>
      </header>

      <main className="relative z-[1]">{children}</main>

      <div
        className={cn(
          'gerente-watermark-char pointer-events-none fixed bottom-4 right-2 z-0 select-none font-serif text-9xl leading-none',
          theme === 'dragon-dark' && 'text-amber-500/[0.05]',
          theme === 'dragon-light' && 'text-amber-700/[0.06]',
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
    <GerenteUiThemeProvider>
      <GerenteLayoutInner {...props} />
    </GerenteUiThemeProvider>
  )
}