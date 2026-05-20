'use client'

import type { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { GerenteHeaderNav } from '@/components/gerente/GerenteHeaderNav'
import { GerenteToastViewport } from '@/components/gerente/GerenteToastViewport'
import { SessionIdleLogout } from '@/components/security/SessionIdleLogout'
import { performClientLogout } from '@/lib/auth/clientLogout'
import { resetCarrinhoPersistido } from '@/lib/caixa/resetCarrinhoPersistido'
import type { Mensagens } from '@/i18n/getMessages'
import type { Idioma } from '@/idioma/normalizeIdioma'
import type { PerfilUsuario } from '@/idioma/usuarioIdioma'
import { normalizePerfilUsuario } from '@/idioma/normalizePerfilUsuario'
import { isPerfilPainelGerencial } from '@/lib/auth/painelGerencial'
import { cn } from '@/lib/utils'

type Props = Readonly<{
  children: ReactNode
  idioma: Idioma
  perfil: PerfilUsuario
  m: Mensagens
  logoSubtitle: string
}>

const FONT_FAMILY: Record<string, string> = {
  zh:    'var(--font-noto-sc),"Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif',
  'zh-HK': 'var(--font-noto-tc),"Noto Sans TC","MingLiU","Microsoft JhengHei",sans-serif',
}

function GerenteLayoutInner({ children, idioma, perfil, m, logoSubtitle }: Props) {
  const router = useRouter()
  const podeTrocarIdioma = isPerfilPainelGerencial(normalizePerfilUsuario(perfil))

  async function handleSignOut() {
    const res = await performClientLogout()
    if (!res.ok) return
    resetCarrinhoPersistido()
    router.push('/login')
    router.refresh()
  }

  return (
    <div
      data-app-theme="noturno"
      data-gerente-ui-theme="dragon-dark"
      className={cn(
        'gerente-shell relative min-h-screen overflow-x-visible overflow-y-visible antialiased transition-[background-color,color] duration-200',
        'app-surface app-surface-text',
      )}
      style={{
        fontFamily: FONT_FAMILY[idioma] ?? 'inherit',
        '--gerente-sticky-top': '52px',
      } as React.CSSProperties}
    >
      <SessionIdleLogout />
      <GerenteToastViewport />

      <GerenteHeaderNav
        logoSubtitle={logoSubtitle}
        perfil={perfil}
        m={m}
        idioma={idioma}
        podeTrocarIdioma={podeTrocarIdioma}
        onSignOut={handleSignOut}
      />

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
  return <GerenteLayoutInner {...props} />
}
