import type { ReactNode } from 'react'
import '@/styles/estoque-operacional.css'
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { getMessages } from '@/i18n/getMessages'
import { ROUTES } from '@/lib/navigation/routes'
import { cn } from '@/lib/utils'
import { EstoqueHubChrome } from './_components/EstoqueHubChrome'

export default async function EstoqueLayout({ children }: { children: ReactNode }) {
  const { session } = await loadAdminContext({
    pathname: ROUTES.admin.estoque,
    resource: `route:${ROUTES.admin.estoque}`,
  })
  const m = getMessages(session.idioma)

  return (
    <EstoqueHubChrome
      title={m.estoque.titulo}
      subtitle={m.estoque.subtitulo}
      className={cn(session.idioma === 'zh' && 'font-chinese')}
    >
      {children}
    </EstoqueHubChrome>
  )
}
