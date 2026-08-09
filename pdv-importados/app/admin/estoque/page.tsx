/**
 * FastProduct Admin — Estoque / Saldos (UI/UX loop).
 * Server Component. Queries/RPC inalteradas. Chrome = ModuleNav + KPI + CrudListShell + FilterBar + DataTable.
 */

import { Suspense } from 'react'
import Link from 'next/link'
import { ROUTES, pathWithQuery } from '@shared-core/navigation/routes'
import { FilterBar, type FilterDef } from '@/components/ui/FilterBar'
import {
  PageHeader,
  CrudListShell,
} from '@/components/ui/admin-v2'
import { ErrorState } from '@/components/ui/feedback'
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { getMessages } from '@/i18n/getMessages'
import { obterListaEstoqueGerente } from '@/app/gerente/estoque/actions'
import { listarOpcoesFiltrosProdutos } from '@/app/gerente/produtos/actions'
import { EstoqueTable, type EstoqueLinha } from './_components/EstoqueTable'
import { EstoqueModuleNav } from './_components/EstoqueModuleNav'
import { estoqueNavLabelsFromUi } from './_components/estoqueNavLabels'
import { EstoqueKpiRow } from './_components/EstoqueKpiRow'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 25

type Visao = 'geral' | 'critico'
type OrigemFiltro = '' | 'china_manual' | 'brasil_nf' | 'brasil_sem_nf'

function oneOf<T extends string>(raw: string | undefined, allowed: readonly T[], fallback: T): T {
  return allowed.includes(raw as T) ? (raw as T) : fallback
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function uuidOrUndef(raw: string | undefined): string | undefined {
  return raw && UUID_RE.test(raw) ? raw : undefined
}

function clampPage(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? '1', 10)
  return Number.isFinite(n) && n >= 1 ? n : 1
}

type SearchParams = {
  q?: string
  visao?: string
  origem?: string
  categoria?: string
  page?: string
}

type PageProps = { searchParams?: Promise<SearchParams> }

type ListaOutcome =
  | { ok: true; data: Awaited<ReturnType<typeof obterListaEstoqueGerente>> }
  | { ok: false; error: string }

async function fetchLista(
  params: Parameters<typeof obterListaEstoqueGerente>[0],
  fallbackError: string,
): Promise<ListaOutcome> {
  try {
    const data = await obterListaEstoqueGerente(params)
    return { ok: true, data }
  } catch (err: unknown) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : fallbackError,
    }
  }
}

export default async function AdminEstoquePage({ searchParams }: PageProps) {
  const { session } = await loadAdminContext({
    pathname: ROUTES.admin.estoque,
    resource: `route:${ROUTES.admin.estoque}`,
  })
  const m = getMessages(session.idioma)
  const ui = m.admin_ui
  const sp = (searchParams ? await searchParams : {}) ?? {}

  const q = (sp.q ?? '').slice(0, 200)
  const visao = oneOf<Visao>(sp.visao, ['geral', 'critico'], 'geral')
  const origem = oneOf<OrigemFiltro>(
    sp.origem,
    ['', 'china_manual', 'brasil_nf', 'brasil_sem_nf'],
    '',
  )
  const categoria = uuidOrUndef(sp.categoria)
  const page = clampPage(sp.page)

  const listBase = {
    busca: q,
    categoria_id: categoria ?? null,
    origem,
    ordem: 'nome' as const,
    dir_asc: true,
  }

  const siblingVisao: Visao = visao === 'critico' ? 'geral' : 'critico'

  const [opcoesRes, listaRes, siblingRes] = await Promise.all([
    listarOpcoesFiltrosProdutos(),
    fetchLista(
      {
        ...listBase,
        visao,
        limite: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      },
      ui.estoque_erro_carregar,
    ),
    fetchLista(
      {
        ...listBase,
        visao: siblingVisao,
        limite: 1,
        offset: 0,
      },
      ui.estoque_erro_carregar,
    ),
  ])

  const opcoes = opcoesRes.success
    ? opcoesRes.data
    : { categorias: [], marcas: [], fornecedores: [] }
  const lista = listaRes.ok ? listaRes.data : { total: 0, rows: [] }
  const loadError = listaRes.ok ? null : listaRes.error

  const totalAtual = lista.total
  const totalSibling = siblingRes.ok ? siblingRes.data.total : 0
  const totalGeral = visao === 'geral' ? totalAtual : totalSibling
  const totalCritico = visao === 'critico' ? totalAtual : totalSibling

  const linhas: EstoqueLinha[] = lista.rows.map((r) => ({
    id: r.id,
    nome: r.nome,
    codigo_barras: r.codigo_barras,
    unidade_medida: r.unidade_medida,
    origem: r.origem,
    quantidade_atual: r.quantidade_atual,
    estoque_minimo: r.estoque_minimo,
    deficit: r.deficit,
  }))

  const totalCount = lista.total
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  const catOptions = [
    { value: '', label: m.estoque.filtro_todas_categorias },
    ...opcoes.categorias.map((c) => ({ value: c.id, label: c.nome })),
  ]

  const filters: FilterDef[] = [
    {
      type: 'search',
      key: 'q',
      placeholder: m.estoque.buscar_placeholder,
      inputClassName: 'w-full min-w-[16rem] max-w-md sm:w-72',
    },
    {
      type: 'pills',
      key: 'visao',
      label: ui.estoque_filtro_visao,
      defaultValue: 'geral',
      options: [
        { value: 'geral', label: ui.filtro_todos },
        { value: 'critico', label: m.estoque.badge_critico },
      ],
    },
    {
      type: 'pills',
      key: 'origem',
      label: ui.estoque_filtro_origem,
      defaultValue: '',
      options: [
        { value: '', label: m.produtos.filtro_todas_origens },
        { value: 'china_manual', label: ui.estoque_origem_china },
        { value: 'brasil_nf', label: ui.estoque_origem_brasil_nf },
        { value: 'brasil_sem_nf', label: ui.estoque_origem_brasil },
      ],
    },
    {
      type: 'select',
      key: 'categoria',
      label: m.produtos.categoria,
      defaultValue: '',
      options: catOptions,
    },
  ]

  const activeParams: Record<string, string> = {}
  if (q) activeParams.q = q
  if (visao !== 'geral') activeParams.visao = visao
  if (origem !== '') activeParams.origem = origem
  if (categoria) activeParams.categoria = categoria

  const hrefWithout = (key: string) => {
    const p = new URLSearchParams(activeParams)
    p.delete(key)
    p.delete('page')
    return pathWithQuery(ROUTES.admin.estoque, p)
  }
  const pageHref = (target: number) => {
    const p = new URLSearchParams(activeParams)
    if (target > 1) p.set('page', String(target))
    return pathWithQuery(ROUTES.admin.estoque, p)
  }
  const visaoHref = (target: Visao) => {
    const p = new URLSearchParams(activeParams)
    p.delete('page')
    if (target === 'geral') p.delete('visao')
    else p.set('visao', target)
    return pathWithQuery(ROUTES.admin.estoque, p)
  }

  const nomeCategoria = (id: string) => opcoes.categorias.find((c) => c.id === id)?.nome ?? id

  const chips: Array<{ key: string; label: string }> = []
  if (visao !== 'geral') chips.push({ key: 'visao', label: m.estoque.filtro_estoque_baixo })
  if (origem !== '') {
    chips.push({
      key: 'origem',
      label: `${m.produtos.origem_label}: ${
        origem === 'china_manual'
          ? ui.estoque_origem_china
          : origem === 'brasil_nf'
            ? ui.estoque_origem_brasil_nf
            : ui.estoque_origem_brasil
      }`,
    })
  }
  if (categoria) {
    chips.push({
      key: 'categoria',
      label: `${m.produtos.categoria}: ${nomeCategoria(categoria)}`,
    })
  }

  const metaLabel =
    totalCount === 1 ? ui.estoque_itens_sg : ui.estoque_itens_pl.replace('{{n}}', String(totalCount))

  const emptyAction =
    visao !== 'geral' || q || origem || categoria
      ? {
          vazioActionLabel: ui.estoque_ver_todos,
          vazioActionHref: ROUTES.admin.estoque,
        }
      : {}

  const navLabels = estoqueNavLabelsFromUi(ui)

  return (
    <div className="admin-v2-page flex flex-col gap-4">
      <PageHeader title={m.estoque.titulo} subtitle={m.estoque.subtitulo} />

      <EstoqueModuleNav active="saldos" labels={navLabels} />

      <EstoqueKpiRow
        ariaLabel={ui.estoque_kpi_aria}
        items={[
          {
            key: 'geral',
            label: m.estoque.kpi_total_itens,
            value: totalGeral,
            href: visaoHref('geral'),
            active: visao === 'geral',
          },
          {
            key: 'critico',
            label: m.estoque.kpi_estoque_critico,
            value: totalCritico,
            href: visaoHref('critico'),
            active: visao === 'critico',
            tone: 'warning',
          },
        ]}
      />

      <CrudListShell
        title={ui.estoque_saldos_titulo}
        meta={
          <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2.5 py-0.5 text-caption text-fg-subtle">
            {metaLabel}
          </span>
        }
        toolbar={
          <div className="flex w-full flex-col gap-2.5">
            <Suspense fallback={<div className="h-9 animate-pulse rounded-control bg-[var(--color-surface-soft)]" />}>
              <FilterBar filters={filters} />
            </Suspense>
            {chips.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5">
                {chips.map((chip) => (
                  <Link
                    key={chip.key}
                    href={hrefWithout(chip.key)}
                    aria-label={`${ui.estoque_remover_filtro}: ${chip.label}`}
                    className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2.5 py-0.5 text-caption text-fg-muted hover:text-fg"
                  >
                    {chip.label}
                    <span aria-hidden className="text-fg-subtle">
                      ✕
                    </span>
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        }
        footer={
          totalPages > 1 ? (
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-caption text-fg-subtle">
                {m.produtos.pag_info
                  .replace('{{atual}}', String(page))
                  .replace('{{total}}', String(totalPages))}
              </span>
              <div className="flex flex-wrap items-center gap-1">
                <PageLink href={pageHref(page - 1)} disabled={page <= 1}>
                  {ui.paginacao_anterior}
                </PageLink>
                {pageWindow(page, totalPages).map((p, i) =>
                  p === 'gap' ? (
                    <span key={`gap-${i}`} className="px-1 text-caption text-fg-subtle">
                      …
                    </span>
                  ) : (
                    <PageNumber key={p} href={pageHref(p)} active={p === page}>
                      {p}
                    </PageNumber>
                  ),
                )}
                <PageLink href={pageHref(page + 1)} disabled={page >= totalPages}>
                  {ui.paginacao_proxima}
                </PageLink>
              </div>
            </div>
          ) : undefined
        }
      >
        {loadError ? (
          <div className="p-4">
            <ErrorState dense title={loadError} />
          </div>
        ) : (
          <EstoqueTable
            linhas={linhas}
            labels={{
              produto: m.estoque.col_produto,
              saldo: ui.estoque_col_saldo,
              minimo: ui.estoque_col_minimo,
              deficit: m.estoque.col_deficit,
              unidade: ui.estoque_col_unidade_abrev,
              origem: m.produtos.origem_label,
              origemChina: ui.estoque_origem_china,
              origemBrasilNf: ui.estoque_origem_brasil_nf,
              origemBrasil: ui.estoque_origem_brasil,
              vazioTitulo:
                visao === 'critico' ? m.estoque.vazio_baixo : ui.estoque_vazio_titulo,
              vazioSub: ui.estoque_vazio_sub,
              ...emptyAction,
              ajusteTitulo: ui.estoque_ajuste_titulo,
              ajusteAcao: ui.estoque_ajuste_acao,
              saldoAtual: ui.estoque_saldo_atual,
              estoqueMinimo: m.estoque.col_estoque_minimo,
              motivo: m.estoque.ajuste_motivo_label,
              observacao: m.produtos.observacao,
              cancelar: m.cadastro_comum.cancelar,
              salvarAjuste: ui.estoque_salvar_ajuste,
              salvando: m.cadastro_comum.salvando,
              motivoAcertoInventario: m.estoque.motivo_acerto_inventario,
              motivoEntradaCompra: m.estoque.motivo_entrada_compra,
              motivoPerda: m.estoque.motivo_perda,
              motivoQuebra: m.estoque.motivo_quebra_avaria,
              motivoOutro: m.estoque.motivo_outro,
              kardexTitulo: ui.estoque_kardex_titulo,
              semMovimentos: ui.estoque_sem_movimentos,
              semMovimentosSub: ui.estoque_sem_movimentos_sub,
              tipoVenda: ui.estoque_tipo_venda,
              tipoCompra: ui.estoque_tipo_compra,
              tipoEntradaNf: ui.estoque_tipo_entrada_nf,
              tipoEntrada: ui.estoque_tipo_entrada,
              tipoSaida: ui.estoque_tipo_saida,
              tipoAjuste: ui.estoque_tipo_ajuste,
              tipoDevolucao: ui.estoque_tipo_devolucao,
              tipoTransferencia: ui.estoque_tipo_transferencia,
              tipoAcertoInventario: m.estoque.motivo_acerto_inventario,
              tipoPerda: m.estoque.motivo_perda,
              tipoQuebra: m.estoque.motivo_quebra_avaria,
              tipoOutro: m.estoque.motivo_outro,
            }}
          />
        )}
      </CrudListShell>
    </div>
  )
}

function pageWindow(current: number, total: number): Array<number | 'gap'> {
  const out: Array<number | 'gap'> = []
  const win = new Set<number>([1, total, current - 1, current, current + 1])
  const sorted = [...win].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b)
  let prev = 0
  for (const n of sorted) {
    if (prev && n - prev > 1) out.push('gap')
    out.push(n)
    prev = n
  }
  return out
}

function PageLink({
  href,
  disabled,
  children,
}: {
  href: string
  disabled: boolean
  children: React.ReactNode
}) {
  if (disabled) {
    return (
      <span className="cursor-not-allowed rounded-control border border-[var(--color-border)] px-2.5 py-1 text-caption text-fg-subtle opacity-50">
        {children}
      </span>
    )
  }
  return (
    <Link
      href={href}
      className="rounded-control border border-[var(--color-border)] px-2.5 py-1 text-caption text-fg-muted transition-colors hover:bg-[var(--color-surface-soft)] hover:text-fg"
    >
      {children}
    </Link>
  )
}

function PageNumber({
  href,
  active,
  children,
}: {
  href: string
  active: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-7 min-w-[28px] items-center justify-center rounded-control px-1 text-caption font-medium transition-colors',
        active
          ? 'border border-[var(--color-info-border)] bg-[var(--color-info-bg)] text-brand'
          : 'border border-[var(--color-border)] text-fg-subtle hover:bg-[var(--color-surface-soft)] hover:text-fg',
      )}
    >
      {children}
    </Link>
  )
}
