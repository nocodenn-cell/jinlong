import { type ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { getAdminContext } from '@/lib/admin/context/adminContext'
import { resolveAdminSession } from '@/lib/admin/auth/resolveAdminSession'
import type { AdminSession } from '@/lib/admin/auth/types'
import { AdminV2Shell } from '@/components/ui/admin-v2'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

/**
 * Layout UI — não decide autorização (feita no edge via adminPolicy).
 * Fallback de renderização: exige AdminSession resolvida para montar o shell.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  let session: AdminSession | null = null
  try {
    session = await resolveAdminSession()
  } catch {
    redirect('/login?reason=erro_carregamento')
  }

  if (!session) {
    redirect('/login?next=/admin')
  }

  const adminContext = getAdminContext(session, { pathname: '/admin', resource: 'route:/admin' })

  return <AdminV2Shell session={adminContext.session}>{children}</AdminV2Shell>
}
