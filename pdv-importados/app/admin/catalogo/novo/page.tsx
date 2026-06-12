import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { ROUTES } from '@shared-core/navigation/routes'
import { listarOpcoesFiltrosProdutos } from '@/app/gerente/produtos/actions'
import { getMessages } from '@/i18n/getMessages'
import { NovoProdutoClientPage } from './NovoProdutoClientPage'

export default async function AdminCatalogoNovoPage() {
  const { session } = await loadAdminContext({
    pathname: ROUTES.admin.catalogoNovo,
    resource: `route:${ROUTES.admin.catalogo}`,
  })

  const opcoesRes = await listarOpcoesFiltrosProdutos()
  const opcoes = opcoesRes.success
    ? opcoesRes.data
    : { categorias: [], marcas: [], fornecedores: [] }

  const m = getMessages(session.idioma)

  return <NovoProdutoClientPage m={m} opcoes={opcoes} />
}
