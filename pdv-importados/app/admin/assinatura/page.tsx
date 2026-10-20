import { carregarAssinaturaAction } from './actions'
import { AssinaturaContent } from './_components/AssinaturaContent'
import { resolveAdminSession } from '@/lib/admin/auth/resolveAdminSession'

export const dynamic = 'force-dynamic'

export default async function AdminAssinaturaPage() {
  const session = await resolveAdminSession().catch(() => null)
  const res = await carregarAssinaturaAction()
  if (!res.ok) {
    return <main className="p-6 text-sm text-red-700" role="alert">{res.error}</main>
  }
  return <AssinaturaContent idioma={session?.idioma ?? 'pt'} {...res.data} />
}
