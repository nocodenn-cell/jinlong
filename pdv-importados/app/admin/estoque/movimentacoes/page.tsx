import { Suspense } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { ROUTES } from '@/lib/navigation/routes'
import { getMessages } from '@/i18n/getMessages'
import { tipoMovimentoEstoqueLabels } from '@/lib/format/vendaLabels'
import { CrudListShell, PageHeader } from '@/components/ui/admin-v2'
import { EstoqueHubNav } from '@/components/ui/admin-v2/EstoqueHubNav'
import { FilterBar } from '@/components/ui/FilterBar'
import { ErrorState } from '@/components/ui/feedback'
import { listarMovimentacoesEstoque, type MovimentoLinha } from './actions'
import { MovimentacoesTable } from './MovimentacoesTable'
import {
  filtrosMovimentacao,
  hrefMovimentacoes,
  periodoMovimentacao,
  sentidoAtivo,
} from './movimentacoesFiltros'

export default async function MovimentacoesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sentido?: string; periodo?: string; page?: string }>
}) {
  const { session } = await loadAdminContext({
    pathname: ROUTES.admin.estoque,
    resource: `route:${ROUTES.admin.estoque}`,
  })
  const m = getMessages(session.idioma)
  const ui = m.admin_ui
  const query = await searchParams
  const q = (query.q ?? '').slice(0, 100)
  const sentido = sentidoAtivo(query.sentido)
  const periodo = periodoMovimentacao(query.periodo)
  const page = Math.max(1, Number.parseInt(query.page ?? '1', 10) || 1)
  const result = await listarMovimentacoesEstoque(q, sentido, page, periodo).then(
    (data) => ({ data, error: null as string | null }),
    (error: unknown) => ({
      data: { rows: [] as MovimentoLinha[], total: 0 },
      error: error instanceof Error ? error.message : ui.estoque_mov_erro,
    }),
  )
  const totalPages = Math.max(1, Math.ceil(result.data.total / 50))
  if (!result.error && page > totalPages) redirect(hrefMovimentacoes({ q, sentido, periodo, page: totalPages }))

  return (
    <div className="admin-v2-page">
      <PageHeader title={ui.hub_estoque_movimentacoes} subtitle={ui.estoque_mov_subtitulo} />
      <EstoqueHubNav />
      <CrudListShell
        title={ui.hub_estoque_movimentacoes}
        meta={(
          <span className="text-caption text-fg-subtle">
            {page} / {totalPages} · {result.data.total}
          </span>
        )}
        toolbar={(
          <div className="w-full">
            <Suspense fallback={<div className="h-9" />}>
              <FilterBar
                layout="grid"
                resetPageOnChange
                filters={filtrosMovimentacao(ui)}
                ariaLabel={ui.filtros_regiao_aria}
                clearAriaLabel={ui.filtros_limpar_aria}
                clearLabel={m.comum.limpar_filtros}
              />
            </Suspense>
          </div>
        )}
        footer={(
          <div className="flex w-full items-center justify-between gap-3 text-body">
            {page > 1 ? <Link href={hrefMovimentacoes({ q, sentido, periodo, page: page - 1 })}>{ui.paginacao_anterior}</Link> : <span />}
            {page < totalPages ? <Link href={hrefMovimentacoes({ q, sentido, periodo, page: page + 1 })}>{ui.paginacao_proxima}</Link> : <span />}
          </div>
        )}
      >
        {result.error ? (
          <ErrorState dense description={result.error} />
        ) : (
          <MovimentacoesTable
            rows={result.data.rows}
            zh={session.idioma === 'zh'}
            tipos={tipoMovimentoEstoqueLabels(m)}
          />
        )}
      </CrudListShell>
    </div>
  )
}
