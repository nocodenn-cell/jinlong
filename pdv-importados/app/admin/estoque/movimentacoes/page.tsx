import { Suspense } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { ROUTES } from '@/lib/navigation/routes'
import { getMessages } from '@/i18n/getMessages'
import { tipoMovimentoEstoqueLabels } from '@/lib/format/vendaLabels'
import { CrudListShell } from '@/components/ui/admin-v2'
import { ErrorState } from '@/components/ui/feedback'
import { listarMovimentacoesEstoque, type MovimentoLinha } from './actions'
import { MovimentacoesFiltros } from './MovimentacoesFiltros'
import { MovimentacoesTable } from './MovimentacoesTable'
import { TIPOS_MOVIMENTO_FILTRO, normalizarPeriodoMovimento, tipoMovimentoFiltro } from './movimentoFiltro'

const path = ROUTES.admin.estoqueMovimentacoes

type Query = { q?: string; sentido?: string; page?: string; de?: string; ate?: string; tipo?: string }

function sentidoAtivo(raw: string | undefined): string {
  return raw === 'entrada' || raw === 'saida' ? raw : ''
}

function href(params: Record<string, string>, page: number) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value)
  }
  if (page > 1) search.set('page', String(page))
  const qs = search.toString()
  return qs ? `${path}?${qs}` : path
}

export default async function MovimentacoesPage({ searchParams }: { searchParams: Promise<Query> }) {
  const { session } = await loadAdminContext({
    pathname: ROUTES.admin.estoque,
    resource: `route:${ROUTES.admin.estoque}`,
  })
  const m = getMessages(session.idioma)
  const ui = m.admin_ui
  const query = await searchParams
  const q = (query.q ?? '').slice(0, 100)
  const sentido = sentidoAtivo(query.sentido)
  const periodo = normalizarPeriodoMovimento(query.de, query.ate)
  const tipo = tipoMovimentoFiltro(query.tipo) ?? ''
  const page = Math.max(1, Number.parseInt(query.page ?? '1', 10) || 1)
  const tiposMap = tipoMovimentoEstoqueLabels(m)
  const result = await listarMovimentacoesEstoque(q, sentido, page, {
    de: periodo.de ?? undefined,
    ate: periodo.ate ?? undefined,
    tipo: tipo || undefined,
  }).then(
    (data) => ({ data, error: null as string | null }),
    (error: unknown) => ({
      data: { rows: [] as MovimentoLinha[], total: 0 },
      error: error instanceof Error ? error.message : ui.estoque_mov_erro,
    }),
  )
  const totalPages = Math.max(1, Math.ceil(result.data.total / 50))
  const params = {
    q,
    sentido,
    de: periodo.de ?? '',
    ate: periodo.ate ?? '',
    tipo,
  }
  if (!result.error && page > totalPages) redirect(href(params, totalPages))

  const tipos = TIPOS_MOVIMENTO_FILTRO.map((codigo) => ({
    value: codigo,
    label: tiposMap[codigo] ?? codigo,
  }))

  return (
    <>
      <p className="mb-4 text-body text-fg-subtle">{ui.estoque_mov_subtitulo}</p>
      <CrudListShell
        title={ui.hub_estoque_movimentacoes}
        meta={(
          <span className="text-caption text-fg-subtle">
            {page} / {totalPages} · {result.data.total}
          </span>
        )}
        toolbar={(
          <div className="w-full min-w-0 basis-full">
            <Suspense fallback={<div className="h-24" />}>
              <MovimentacoesFiltros
                tipos={tipos}
                labels={{
                  busca: ui.estoque_mov_busca,
                  periodo: ui.estoque_mov_periodo,
                  de: ui.estoque_mov_de,
                  ate: ui.estoque_mov_ate,
                  tipo: ui.estoque_mov_tipo,
                  todosTipos: ui.estoque_mov_todos_tipos,
                  todos: ui.estoque_mov_todos,
                  entradas: ui.estoque_mov_entradas,
                  saidas: ui.estoque_mov_saidas,
                  limpar: m.comum.limpar_filtros,
                  regiao: ui.filtros_regiao_aria,
                  limparAria: ui.filtros_limpar_aria,
                }}
              />
            </Suspense>
          </div>
        )}
        footer={(
          <div className="flex w-full items-center justify-between gap-3 text-body">
            {page > 1 ? <Link href={href(params, page - 1)}>{ui.paginacao_anterior}</Link> : <span />}
            {page < totalPages ? <Link href={href(params, page + 1)}>{ui.paginacao_proxima}</Link> : <span />}
          </div>
        )}
      >
        {result.error ? (
          <ErrorState dense description={result.error} />
        ) : (
          <MovimentacoesTable
            rows={result.data.rows}
            zh={session.idioma === 'zh'}
            tipos={tiposMap}
            labels={{
              detalhe: ui.estoque_mov_detalhe,
              fechar: ui.estoque_mov_fechar,
              produto: session.idioma === 'zh' ? '商品' : 'Produto',
              data: session.idioma === 'zh' ? '日期' : 'Data',
              tipo: ui.estoque_mov_tipo,
              variacao: session.idioma === 'zh' ? '数量变化' : 'Variação',
              observacao: session.idioma === 'zh' ? '备注' : 'Observação',
              verProduto: ui.estoque_mov_ver_produto,
              vazio: session.idioma === 'zh' ? '没有库存变动' : 'Nenhuma movimentação encontrada',
            }}
          />
        )}
      </CrudListShell>
    </>
  )
}
