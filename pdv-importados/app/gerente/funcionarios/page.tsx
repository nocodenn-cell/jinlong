import { FuncionariosPageClient } from './FuncionariosPageClient'
import { resolveAdminSession } from '@/lib/gerente/auth/resolveAdminSession'
import { redirect } from 'next/navigation'

export const metadata = {
  title: 'Funcionários',
}

export default async function FuncionariosPage() {
  const session = await resolveAdminSession()
  if (!session.ok) redirect('/login')

  return <FuncionariosPageClient idioma={session.session.idioma} />
}
