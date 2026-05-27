import { GerenteFilterBar } from '@/components/gerente/GerenteFilterBar'
import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import { getMessages } from '@/i18n/getMessages'
import { localeFromIdioma } from '@/lib/idioma/localeFromIdioma'
import { buscarFornecedoresPaginadosAction } from './actions'
import { FornecedoresListClient } from './FornecedoresListClient'

export default async function GerenteFornecedoresPage() {
  const { idioma } = await getUsuarioIdioma()
  const locale = localeFromIdioma(idioma)
  const m = getMessages(idioma)

  const inicial = await buscarFornecedoresPaginadosAction(1)
  const fornecedoresIniciais = inicial.ok ? inicial.fornecedores : []
  const hasMoreInicial = inicial.ok ? inicial.hasMore : false

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6">
      <GerenteFilterBar title={m.fornecedores.titulo} />

      <FornecedoresListClient
        idioma={idioma}
        locale={locale}
        fornecedoresIniciais={fornecedoresIniciais}
        hasMoreInicial={hasMoreInicial}
      />
    </div>
  )
}
