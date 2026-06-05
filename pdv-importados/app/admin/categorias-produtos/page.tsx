/**
 * FastProduct Admin — Categorias de Produtos (Fase 8)
 *
 * Server Component. Carrega lista inicial de categorias via `listarCategoriasProdutos` action.
 * Passa para client component que renderiza tabela com CRUD inline.
 *
 * Zero query nova — reutiliza actions existentes de /gerente/categorias-produtos.
 */

import { Suspense } from 'react'
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
    <div className="flex flex-col">
      {/* Cabeçalho + ações */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 pb-3 pt-5">
        <div>
          <h1 className="text-[18px] font-semibold text-zinc-100">Categorias de Produtos</h1>
          <p className="mt-0.5 text-[12px] text-zinc-500">Gerenciar categorias e agrupamentos</p>
        </div>
      </div>

      <Suspense fallback={<div className="h-12 bg-zinc-900" />}>
        <CategoriasProdutosContent dados={dados} />
      </Suspense>
    </div>
  )
}
