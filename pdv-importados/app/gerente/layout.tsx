import React, { type ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { GerenteLayoutShell } from '@/components/gerente/GerenteLayoutShell'
import { resolveAdminSession } from '@/lib/admin/auth/resolveAdminSession'
import type { AdminSession } from '@/lib/admin/auth/types'
import { getMessages } from '@/i18n/getMessages'

/**
 * Layout /gerente — fallback de renderização (autorização no edge via adminPolicy).
 */
export default async function GerenteLayout({ children }: { children: ReactNode }) {
  let session: AdminSession | null = null
  try {
    session = await resolveAdminSession()
  } catch {
    redirect('/login?reason=erro_carregamento')
  }

  if (!session) {
    redirect('/caixa')
  }

  const m = getMessages(session.idioma)
  const logoSubtitle = m.brand?.logo_subtitle ?? '金龍'

  return (
    <GerenteLayoutShell
      idioma={session.idioma}
      perfil={session.perfil}
      m={m}
      logoSubtitle={logoSubtitle}
    >
      {children}
    </GerenteLayoutShell>
  )
}
