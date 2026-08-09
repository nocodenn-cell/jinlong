/**
 * FastProduct Admin — Marcas de Produtos.
 *
 * Server Component. Reusa as actions de `/gerente/marcas-produtos`, que ganharam
 * listar/atualizar/alternarAtivo nesta rodada — antes só existia `criar`, então
 * uma marca digitada errada era permanente (AUDITORIA_CATALOGO_PRODUTO.md §5.3).
 */

import { Suspense } from 'react'
import { PageHeader } from '@/components/ui/admin-v2'
import { CatalogoHubNav } from '@/components/ui/admin-v2/CatalogoHubNav'
import { listarMarcasProdutos } from '@/app/gerente/marcas-produtos/actions'
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { getMessages } from '@/i18n/getMessages'
import { ROUTES } from '@shared-core/navigation/routes'
import { MarcasProdutosContent } from './_components/MarcasProdutosContent'

type SearchParams = {
  q?: string
  situacao?: string
  page?: string
}

type PageProps = { searchParams?: Promise<SearchParams> }

export default async function AdminMarcasProdutosPage({ searchParams }: PageProps) {
  const { session } = await loadAdminContext({
    pathname: ROUTES.admin.marcasProdutos,
    resource: `route:${ROUTES.admin.marcasProdutos}`,
  })
  const m = getMessages(session.idioma)

  const sp = (await searchParams) ?? {}
  const pageRaw = Number.parseInt(sp.page ?? '1', 10)
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? pageRaw : 1
  const busca = sp.q ?? ''
  const situacao = (sp.situacao as 'todos' | 'ativos' | 'inativos' | undefined) ?? 'todos'

  const res = await listarMarcasProdutos({ page, pageSize: 50, busca, situacao })
  const dados = res.success ? res.data : { rows: [], total: 0 }

  return (
    <div className="admin-v2-page">
      <PageHeader title={m.marcas_produtos.titulo} subtitle={m.marcas_produtos.cadastro_rapido_hint} />

      <CatalogoHubNav />

      <Suspense fallback={<div className="admin-v2-panel h-12 animate-pulse rounded-lg" />}>
        <MarcasProdutosContent
          idioma={session.idioma}
          dados={dados}
          buscaInicial={busca}
          situacaoInicial={situacao}
          page={page}
        />
      </Suspense>
    </div>
  )
}
