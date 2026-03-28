import type { ReactNode } from 'react'
import Link from 'next/link'
import { getUsuarioIdioma, isGerenteOuDono } from '@/src/lib/idioma/usuarioIdioma'
import { getMessages } from '@/src/lib/i18n/getMessages'
import LanguageToggle from './idioma/LanguageToggle'

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
            <Link href="/gerente" style={{ color: '#111827' }}>
              {m.gerente.inicio}
            </Link>
            <Link href="/gerente/produtos" style={{ color: '#111827' }}>
              {m.produtos.titulo}
            </Link>
            <Link href="/gerente/estoque" style={{ color: '#111827' }}>
              {m.estoque.titulo}
            </Link>
            <Link href="/gerente/vendas" style={{ color: '#111827' }}>
              {m.gerente.nav_vendas}
            </Link>
            <Link href="/gerente/caixas" style={{ color: '#111827' }}>
              {m.gerente.nav_caixas}
            </Link>
            <Link href="/gerente/relatorios" style={{ color: '#111827' }}>
              {m.gerente.nav_relatorios}
            </Link>
          </nav>
        </div>

        {podeTrocarIdioma ? <LanguageToggle idiomaAtual={idioma} /> : null}
      </header>

      <main>{children}</main>
    </div>
  )
}

