import { redirect } from 'next/navigation'
import { legacyGerenteRedirect } from '@shared-core/navigation/routes'

export default async function GerenteRedirect({
  params,
}: {
  params: Promise<{ path?: string[] }>
}) {
  const { path } = await params
  const slug = (path ?? []).join('/')
  redirect(legacyGerenteRedirect(slug))
}
