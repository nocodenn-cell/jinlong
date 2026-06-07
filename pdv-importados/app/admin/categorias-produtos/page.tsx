/**
 * FastProduct Admin — Categorias de Produtos (Fase 8)
 *
 * Server Component. Carrega lista inicial de categorias via `listarCategoriasProdutos` action.
 * Passa para client component que renderiza tabela com CRUD inline.
 *
 * Zero query nova — reutiliza actions existentes de /gerente/categorias-produtos.
 */

import { Suspense } from 'react'
import { PageHeader } from '@/components/ui/admin-v2'
import { listarCategoriasProdutos } from '@/app/gerente/categorias-produtos/actions'
import { CategoriasProdutosContent } from './_components/CategoriasProdutosContent'

type SearchParams = {
  q?: string
  situacao?: string
  page?: string
}

type PageProps = { searchParams?: Promise<SearchParams> }

export default async function AdminCategoriasProdutosPage({ searchParams }: PageProps) {
  const sp = (await searchParams) ?? {}
  const page = parseInt(sp.page ?? '1', 10)
  const busca = sp.q ?? ''
  const situacao = (sp.situacao as 'todos' | 'ativos' | 'inativos' | undefined) ?? 'todos'

  const res = await listarCategoriasProdutos({
    page,
    pageSize: 50,
    busca,
    situacao,
  })

  const dados = res.success ? res.data : { rows: [], total: 0 }

  return (
    <div className="admin-v2-page">
      <PageHeader
        title="Categorias de Produtos"
        subtitle="Gerenciar categorias e agrupamentos"
      />

      <Suspense fallback={<div className="admin-v2-panel h-12 animate-pulse rounded-lg" />}>
        <CategoriasProdutosContent dados={dados} />
      </Suspense>
    </div>
  )
}
