import { Suspense } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { ROUTES } from '@/lib/navigation/routes'
import { getMessages } from '@/i18n/getMessages'
import { tipoMovimentoEstoqueLabels } from '@/lib/format/vendaLabels'
import { PageHeader } from '@/components/ui/admin-v2'
import { EstoqueHubNav } from '@/components/ui/admin-v2/EstoqueHubNav'
import { FilterBar } from '@/components/ui/FilterBar'
import { ErrorState } from '@/components/ui/feedback'
import { listarMovimentacoesEstoque } from './actions'
import { MovimentacoesTable } from './MovimentacoesTable'

const path = ROUTES.admin.estoqueMovimentacoes
function href(q: string, sentido: string, page: number) {
  return `${path}?${new URLSearchParams({ q, sentido, page: String(page) })}`
}
export default async function MovimentacoesPage({ searchParams }: { searchParams: Promise<{ q?: string; sentido?: string; page?: string }> }) {
  const { session } = await loadAdminContext({ pathname: ROUTES.admin.estoque, resource: `route:${ROUTES.admin.estoque}` })
  const zh = session.idioma === 'zh'
  const query = await searchParams
  const q = (query.q ?? '').slice(0, 100)
  const sentido = ['entrada', 'saida'].includes(query.sentido ?? '') ? query.sentido! : ''
  const page = Math.max(1, Number.parseInt(query.page ?? '1', 10) || 1)
  const result = await listarMovimentacoesEstoque(q, sentido, page).then((data) => ({ data, error: null }), (error: unknown) => ({ data: { rows: [], total: 0 }, error: error instanceof Error ? error.message : 'Falha ao consultar movimentos.' }))
  const totalPages = Math.max(1, Math.ceil(result.data.total / 50))
  if (!result.error && page > totalPages) redirect(href(q, sentido, totalPages))
  return <div className="admin-v2-page space-y-4">
    <PageHeader title={zh ? '库存变动' : 'Movimentações de estoque'} subtitle={zh ? '查询所有商品的入库、出库及调整记录。' : 'Consulte entradas, saídas e ajustes de todos os produtos.'} />
    <EstoqueHubNav />
    <Suspense><FilterBar resetPageOnChange filters={[
      { type: 'search', key: 'q', placeholder: zh ? '商品或条形码' : 'Produto ou código de barras' },
      { type: 'pills', key: 'sentido', defaultValue: '', options: [{ value: '', label: zh ? '全部' : 'Todos' }, { value: 'entrada', label: zh ? '入库' : 'Entradas' }, { value: 'saida', label: zh ? '出库' : 'Saídas' }] },
    ]} /></Suspense>
    {result.error ? <ErrorState dense description={result.error} /> : <MovimentacoesTable rows={result.data.rows} zh={zh} tipos={tipoMovimentoEstoqueLabels(getMessages(session.idioma))} />}
    <div className="flex items-center gap-4 text-body">
      {page > 1 ? <Link className="underline" href={href(q, sentido, page - 1)}>{zh ? '上一页' : 'Anterior'}</Link> : null}
      <span>{page} / {totalPages} · {result.data.total}</span>
      {page < totalPages ? <Link className="underline" href={href(q, sentido, page + 1)}>{zh ? '下一页' : 'Próxima'}</Link> : null}
    </div>
  </div>
}
