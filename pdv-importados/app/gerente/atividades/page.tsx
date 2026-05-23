import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import { localeFromIdioma } from '@/lib/idioma/localeFromIdioma'
import { AtividadesPageClient } from './AtividadesPageClient'

export const metadata = { title: 'Histórico de Atividades' }

export default async function AtividadesPage() {
  const { idioma } = await getUsuarioIdioma()
  const locale = localeFromIdioma(idioma)

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-jl-fg-1">Histórico de Atividades</h1>
        <p className="mt-1 text-sm text-jl-fg-3">
          Vendas, movimentações de caixa e eventos fiscais
        </p>
      </div>
      <AtividadesPageClient locale={locale} />
    </div>
  )
}
