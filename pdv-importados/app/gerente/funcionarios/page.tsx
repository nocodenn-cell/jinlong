import { FuncionariosPageClient } from './FuncionariosPageClient'
import { resolveAdminSession } from '@/lib/admin/auth/resolveAdminSession'
import { redirect } from 'next/navigation'

export const metadata = {
  title: 'Funcionários',
}

export default async function FuncionariosPage() {
  const session = await resolveAdminSession()
  if (!session) redirect('/login')

  return <FuncionariosPageClient idioma={session.idioma} />
}
