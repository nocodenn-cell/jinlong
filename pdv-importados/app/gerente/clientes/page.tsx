import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import { getMessages } from '@/i18n/getMessages'
import { localeFromIdioma } from '@/lib/idioma/localeFromIdioma'
import { GerenteFilterBar } from '@/components/gerente/GerenteFilterBar'
import { buscarClientesPaginadosAction } from './actions'
import { ClientesListClient } from './ClientesListClient'

/**
 * Server component — `/gerente/clientes`.
 * Busca a primeira página e delega ao client.
 * Botão "+ Novo cliente" mora dentro do ListClient porque precisa do estado de modal aberto.
 */
export default async function GerenteClientesPage() {
  const { idioma } = await getUsuarioIdioma()
  const m = getMessages(idioma)
  const locale = localeFromIdioma(idioma)

  const inicial = await buscarClientesPaginadosAction(1)
  const clientesIniciais = inicial.ok ? inicial.clientes : []
  const hasMoreInicial = inicial.ok ? inicial.hasMore : false

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6">
      <GerenteFilterBar title={m.clientes.titulo} />

      <ClientesListClient
        idioma={idioma}
        locale={locale}
        clientesIniciais={clientesIniciais}
        hasMoreInicial={hasMoreInicial}
      />
    </div>
  )
}
