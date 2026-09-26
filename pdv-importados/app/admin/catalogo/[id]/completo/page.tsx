import { notFound } from 'next/navigation'
import { ROUTES } from '@shared-core/navigation/routes'
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { getMessages } from '@/i18n/getMessages'
import {
  buscarProdutoGerentePorId,
  listarOpcoesFiltrosProdutos,
} from '@/app/gerente/produtos/actions'
import { ProdutoFormCompletoClient } from '@/components/gerente/produtos/ProdutoFormCompletoClient'

type PageProps = { params: Promise<{ id: string }> }

/** Cadastro Completo — editar produto existente. Substitui o antigo
 *  `ProdutosEditarCatalogoModal` (modal) como destino de "Editar" e
 *  "Duplicar" na tabela do catálogo. */
export default async function AdminCatalogoCompletoPage({ params }: PageProps) {
  const { id } = await params
  const { session } = await loadAdminContext({
    pathname: ROUTES.admin.catalogo,
    resource: `route:${ROUTES.admin.catalogo}`,
  })
  const { idioma } = session
  const m = getMessages(idioma)

  const [opcoesRes, produtoRes] = await Promise.all([
    listarOpcoesFiltrosProdutos(),
    buscarProdutoGerentePorId(id),
  ])

  if (!produtoRes.success) notFound()

  const opcoes = opcoesRes.success
    ? opcoesRes.data
    : { categorias: [], marcas: [], fornecedores: [] }

  return (
    <ProdutoFormCompletoClient
      produtoInicial={produtoRes.data}
      opcoes={opcoes}
      m={m}
      idioma={idioma}
    />
  )
}
