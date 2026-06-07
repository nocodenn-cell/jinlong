import { type ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { resolveAdminSession } from '@/lib/admin/auth/resolveAdminSession'
import { AdminShell } from './_components/AdminShell'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

export default async function AdminLayout({ children }: { children: ReactNode }) {
  let session
  try {
    session = await resolveAdminSession()
  } catch {
    redirect('/login?reason=erro_carregamento')
  }

  if (!session) {
    redirect('/login?next=/admin')
  }

  return <AdminShell session={session}>{children}</AdminShell>
}
