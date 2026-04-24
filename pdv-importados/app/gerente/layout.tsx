import type { ReactNode } from 'react'
import { GerenteLayoutShell } from '@/components/gerente/GerenteLayoutShell'
import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import { getMessages } from '@/i18n/getMessages'

export default async function GerenteLayout({ children }: { children: ReactNode }) {
  const { idioma, perfil } = await getUsuarioIdioma()
  const m = getMessages(idioma)
  const logoSubtitle = m.brand?.logo_subtitle ?? 'Dragon POS'

  return (
    <GerenteLayoutShell idioma={idioma} perfil={perfil} m={m} logoSubtitle={logoSubtitle}>
      {children}
    </GerenteLayoutShell>
  )
}
