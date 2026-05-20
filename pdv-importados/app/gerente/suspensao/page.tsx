import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import { SuspensaoPageClient } from './SuspensaoPageClient'

export const revalidate = 0

export default async function SuspensaoPage() {
  const { idioma } = await getUsuarioIdioma()
  return <SuspensaoPageClient idioma={idioma} />
}
