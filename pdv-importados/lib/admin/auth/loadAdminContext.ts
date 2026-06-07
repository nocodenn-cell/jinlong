import 'server-only'
import { getAdminContext, type AdminContext, type AdminContextRequest } from '@/lib/admin/context/adminContext'
import { getAdminSession } from './getAdminSession'

/**
 * Carrega sessão cacheada + contexto agregado para páginas/actions/API.
 */
export async function loadAdminContext(request: AdminContextRequest = {}): Promise<AdminContext> {
  const session = await getAdminSession()
  return getAdminContext(session, request)
}
