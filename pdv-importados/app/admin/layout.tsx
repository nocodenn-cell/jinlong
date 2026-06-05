import { type ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import { isPerfilPainelGerencial } from '@/lib/auth/painelGerencial'

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { perfil } = await getUsuarioIdioma()
  if (!isPerfilPainelGerencial(perfil)) redirect('/caixa')

  return <>{children}</>
}
