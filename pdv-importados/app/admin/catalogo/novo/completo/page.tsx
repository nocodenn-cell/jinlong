import { ROUTES } from '@shared-core/navigation/routes'
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { getMessages } from '@/i18n/getMessages'
import {
  buscarProdutoGerentePorId,
  listarOpcoesFiltrosProdutos,
} from '@/app/gerente/produtos/actions'
import { ProdutoFormCompletoClient } from '@/components/gerente/produtos/ProdutoFormCompletoClient'

type SearchParams = { duplicarDe?: string }
type PageProps = { searchParams?: Promise<SearchParams> }

/**
 * Cadastro Completo — criar do zero, OU duplicar (`?duplicarDe=<id>`, usado
 * pela ação "Duplicar" da tabela do catálogo — ver
 * `docs/PLANO_CADASTRO_PRODUTO_UX.md` (v2), decisão "Duplicar → Completo").
 * Também é entrada alternativa ao Cadastro Rápido para quem já sabe que
 * precisa configurar tudo de uma vez (fiscal, marca, detalhes) antes do
 * primeiro save.
 */
export default async function AdminCatalogoNovoCompletoPage({ searchParams }: PageProps) {
  const { session } = await loadAdminContext({
    pathname: ROUTES.admin.catalogoCompletoNovo,
    resource: `route:${ROUTES.admin.catalogo}`,
  })
  const { idioma } = session
  const m = getMessages(idioma)
  const sp = (searchParams ? await searchParams : {}) ?? {}

  const [opcoesRes, duplicarDeRes] = await Promise.all([
    listarOpcoesFiltrosProdutos(),
    sp.duplicarDe ? buscarProdutoGerentePorId(sp.duplicarDe) : Promise.resolve(null),
  ])

  const opcoes = opcoesRes.success
    ? opcoesRes.data
    : { categorias: [], marcas: [], fornecedores: [] }
  const duplicarDe = duplicarDeRes && duplicarDeRes.success ? duplicarDeRes.data : null

  return (
    <ProdutoFormCompletoClient
      produtoInicial={null}
      duplicarDe={duplicarDe}
      opcoes={opcoes}
      m={m}
      idioma={idioma}
    />
  )
}
