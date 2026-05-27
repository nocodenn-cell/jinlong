import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import { getMessages } from '@/i18n/getMessages'
import { localeFromIdioma } from '@/lib/idioma/localeFromIdioma'
import { GerenteFilterBar } from '@/components/gerente/GerenteFilterBar'
import { listarCategoriasAction } from './actions'
import { CategoriasListClient } from './CategoriasListClient'

export default async function CategoriasPage() {
  const { idioma } = await getUsuarioIdioma()
  const locale = localeFromIdioma(idioma)
  const m = getMessages(idioma)

  const r = await listarCategoriasAction()
  const categoriasIniciais = r.ok ? r.categorias : []

  return (
    <div className="mx-auto max-w-[1000px] px-4 py-6 sm:px-6">
      <GerenteFilterBar title={m.categorias.titulo} />
      <p className="gerente-fin-muted mb-4 text-sm">{m.categorias.subtitulo}</p>

      <CategoriasListClient
        idioma={idioma}
        locale={locale}
        categoriasIniciais={categoriasIniciais}
      />
    </div>
  )
}
