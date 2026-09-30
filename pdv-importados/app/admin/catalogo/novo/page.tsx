import { redirect } from 'next/navigation'
import { ROUTES, pathWithQuery } from '@/lib/navigation/routes'

/** Deep-link legado → modal de criação no catálogo canônico. */
export default function AdminCatalogoNovoRedirectPage() {
  const q = new URLSearchParams({ modal: 'novo' })
  redirect(pathWithQuery(ROUTES.admin.catalogo, q))
}
