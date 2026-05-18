import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import { getMessages } from '@/i18n/getMessages'

export default async function ConfiguracoesPage() {
  const { idioma } = await getUsuarioIdioma()
  const m = getMessages(idioma)

  return (
    <div className="px-4 py-8 text-center opacity-60">
      <p className="text-sm">{m.gerente.nav_configuracoes}</p>
    </div>
  )
}
