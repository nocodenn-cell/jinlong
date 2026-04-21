import type { ReactNode } from 'react'
import Link from 'next/link'
import { GerenteToastViewport } from '@/components/gerente/GerenteToastViewport'
import { SessionIdleLogout } from '@/components/security/SessionIdleLogout'
import { SignOutButton } from '@/components/auth/SignOutButton'
import { getUsuarioIdioma, isGerenteOuDono } from '@/src/lib/idioma/usuarioIdioma'
import { getMessages } from '@/src/lib/i18n/getMessages'
import LanguageToggle from './idioma/LanguageToggle'
import {
  GERENTE_HEADER_NAV_ORDER,
  gerenteNavLabel,
  painelGerencialHref,
} from '@/lib/navigation/painelGerencialNav'

export default async function GerenteLayout({
  children,
}: {
  children: ReactNode
}) {
  const { idioma, perfil } = await getUsuarioIdioma()
  const m = getMessages(idioma)
  const podeTrocarIdioma = isGerenteOuDono(perfil)

  const FONT_FAMILY: Record<string, string> = {
    zh: 'var(--font-noto-sc),"Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif',
    'zh-HK':
      'var(--font-noto-tc),"Noto Sans TC","MingLiU","Microsoft JhengHei",sans-serif',
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#ffffff',
        fontFamily: FONT_FAMILY[idioma] ?? 'inherit',
      }}
    >
      <SessionIdleLogout />
      <GerenteToastViewport />
      <header
        style={{
          borderBottom: '1px solid #e5e7eb',
          padding: '12px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>
            {m.gerente.titulo_painel}
          </div>
          <nav style={{ display: 'flex', gap: 12, fontSize: 13, flexWrap: 'wrap' }}>
            {GERENTE_HEADER_NAV_ORDER.map((key) => (
              <Link key={key} href={painelGerencialHref(key)} style={{ color: '#111827' }}>
                {gerenteNavLabel(m, key)}
              </Link>
            ))}
          </nav>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          {podeTrocarIdioma ? <LanguageToggle idiomaAtual={idioma} /> : null}
          <SignOutButton
            label={m.comum.sair}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50"
          />
        </div>
      </header>

      <main>{children}</main>
    </div>
  )
}

