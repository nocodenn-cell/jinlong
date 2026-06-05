/**
 * FastProduct Admin — Estoque (Fase 5)
 *
 * Server Component. Reusa a query EXISTENTE de saldos do gerente
 * (`obterListaEstoqueGerente` → RPC `gerente_estoque_list_page`) — nenhuma query
 * nova para a listagem. Os searchParams da URL viram o input da RPC (filtros +
 * paginação server-side). As categorias do select vêm de
 * `listarOpcoesFiltrosProdutos` (cacheada), igual ao Catálogo (Fase 4).
 *
 * Estrutura espelhada do Catálogo (Fase 4): FilterBar + DataTable + chips
 * removíveis + paginação por ?page=. As novidades da fase são as interações da
 * tabela: AjusteSaldoModal (reusa `atualizarEstoqueProduto`) e KardexSheet
 * (única action nova, read-only).
 */

import { Suspense } from 'react'
import Link from 'next/link'
import { Upload } from 'lucide-react'
import { FilterBar, type FilterDef } from '@/components/ui/FilterBar'
import { obterListaEstoqueGerente } from '@/app/gerente/estoque/actions'
import { listarOpcoesFiltrosProdutos } from '@/app/gerente/produtos/actions'
import { EstoqueTable, type EstoqueLinha } from './_components/EstoqueTable'

const PAGE_SIZE = 25

// ─── Normalizadores de searchParams ─────────────────────────────────────────

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

const ORIGEM_LABEL: Record<Exclude<OrigemFiltro, ''>, string> = {
  china_manual: 'China',
  brasil_nf: 'Brasil · NF',
  brasil_sem_nf: 'Brasil',
}

type SearchParams = {
  q?: string
  visao?: string
  origem?: string
  categoria?: string
  page?: string
}

type PageProps = { searchParams?: Promise<SearchParams> }

export default async function AdminEstoquePage({ searchParams }: PageProps) {
  const sp = (searchParams ? await searchParams : {}) ?? {}

  const q = (sp.q ?? '').slice(0, 200)
  const visao = oneOf<Visao>(sp.visao, ['geral', 'critico'], 'geral')
  const origem = oneOf<OrigemFiltro>(
    sp.origem,
    ['', 'china_manual', 'brasil_nf', 'brasil_sem_nf'],
    ''
  )
  const categoria = uuidOrUndef(sp.categoria)
  const page = clampPage(sp.page)

  // ─── Dados (queries EXISTENTES — nenhuma nova) ───────────────────────────
  // `obterListaEstoqueGerente` LANÇA em erro (não retorna {success}); por isso a
  // capturamos aqui p/ degradar com um banner em vez de derrubar o painel.
  const [opcoesRes, listaRes] = await Promise.all([
    listarOpcoesFiltrosProdutos(),
    obterListaEstoqueGerente({
      visao,
      busca: q,
      categoria_id: categoria ?? null,
      origem,
      ordem: 'nome',
      dir_asc: true,
      limite: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }).then(
      (data) => ({ ok: true as const, data }),
      (err: unknown) => ({
        ok: false as const,
        error: err instanceof Error ? err.message : 'Falha ao carregar o estoque.',
      })
    ),
  ])

  const opcoes = opcoesRes.success ? opcoesRes.data : { categorias: [], marcas: [], fornecedores: [] }
  const lista = listaRes.ok ? listaRes.data : { total: 0, rows: [] }
  const loadError = listaRes.ok ? null : listaRes.error

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

  // ─── FilterBar (Fase 2) ──────────────────────────────────────────────────
  const catOptions = [
    { value: '', label: 'Todas as categorias' },
    ...opcoes.categorias.map((c) => ({ value: c.id, label: c.nome })),
  ]

  const filters: FilterDef[] = [
    { type: 'search', key: 'q', placeholder: 'Nome ou código de barras…' },
    {
      type: 'pills',
      key: 'visao',
      defaultValue: 'geral',
      options: [
        { value: 'geral', label: 'Todos' },
        { value: 'critico', label: 'Crítico' },
      ],
    },
    {
      type: 'pills',
      key: 'origem',
      defaultValue: '',
      options: [
        { value: '', label: 'Todas as origens' },
        { value: 'china_manual', label: 'China' },
        { value: 'brasil_nf', label: 'Brasil · NF' },
        { value: 'brasil_sem_nf', label: 'Brasil' },
      ],
    },
    { type: 'select', key: 'categoria', label: 'Categoria', defaultValue: '', options: catOptions },
  ]

  // ─── Chips de filtros ativos (server-side, removíveis) ───────────────────
  const activeParams: Record<string, string> = {}
  if (q) activeParams.q = q
  if (visao !== 'geral') activeParams.visao = visao
  if (origem !== '') activeParams.origem = origem
  if (categoria) activeParams.categoria = categoria

  const hrefWithout = (key: string) => {
    const p = new URLSearchParams(activeParams)
    p.delete(key)
    p.delete('page')
    const qs = p.toString()
    return qs ? `/admin/estoque?${qs}` : '/admin/estoque'
  }
  const pageHref = (target: number) => {
    const p = new URLSearchParams(activeParams)
    if (target > 1) p.set('page', String(target))
    const qs = p.toString()
    return qs ? `/admin/estoque?${qs}` : '/admin/estoque'
  }

  const nomeCategoria = (id: string) => opcoes.categorias.find((c) => c.id === id)?.nome ?? id

  const chips: Array<{ key: string; label: string }> = []
  if (visao !== 'geral') chips.push({ key: 'visao', label: 'Só estoque crítico' })
  if (origem !== '') chips.push({ key: 'origem', label: `Origem: ${ORIGEM_LABEL[origem]}` })
  if (categoria) chips.push({ key: 'categoria', label: `Categoria: ${nomeCategoria(categoria)}` })

  return (
    <div className="flex flex-col">
      {/* Cabeçalho + ações */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 pb-3 pt-5">
        <div>
          <h1 className="text-[18px] font-semibold text-zinc-100">Estoque</h1>
          <p className="mt-0.5 text-[12px] text-zinc-500">Saldos por produto e ajustes manuais</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Hrefs transitórios → /gerente enquanto as rotas /admin/* não existem */}
          <Link href="/gerente/estoque/importar-nfe" className="fp-btn fp-btn--secondary">
            <Upload size={14} aria-hidden />
            Importar NF-e XML
          </Link>
        </div>
      </div>

      {/* Filtros */}
      <div className="border-b border-zinc-800 px-6 py-3">
        <Suspense fallback={<div className="h-9" />}>
          <FilterBar filters={filters} />
        </Suspense>

        {chips.length > 0 ? (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {chips.map((chip) => (
              <Link
                key={chip.key}
                href={hrefWithout(chip.key)}
                className="inline-flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-0.5 text-[11px] text-zinc-300 transition-colors hover:border-zinc-600 hover:text-zinc-100"
              >
                {chip.label}
                <span aria-hidden className="text-zinc-500">
                  ✕
                </span>
              </Link>
            ))}
          </div>
        ) : null}
      </div>

      {/* Contador */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-2.5">
        <span className="text-[13px] font-medium text-zinc-300">Saldos de estoque</span>
        <span className="rounded-full border border-zinc-800 bg-zinc-900 px-2.5 py-0.5 text-[11px] text-zinc-500">
          {totalCount} {totalCount === 1 ? 'produto' : 'produtos'}
        </span>
      </div>

      {loadError ? (
        <div className="mx-6 mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-[12px] text-red-300">
          {loadError}
        </div>
      ) : null}

      <EstoqueTable linhas={linhas} />

      {/* Paginação (server-side via URL) */}
      {totalPages > 1 ? (
        <div className="flex items-center justify-between gap-3 px-6 py-4">
          <span className="text-[11px] text-zinc-600">
            Página {page} de {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <PageLink href={pageHref(page - 1)} disabled={page <= 1}>
              ‹ Anterior
            </PageLink>
            {pageWindow(page, totalPages).map((p, i) =>
              p === 'gap' ? (
                <span key={`gap-${i}`} className="px-1 text-[11px] text-zinc-600">
                  …
                </span>
              ) : (
                <PageNumber key={p} href={pageHref(p)} active={p === page}>
                  {p}
                </PageNumber>
              )
            )}
            <PageLink href={pageHref(page + 1)} disabled={page >= totalPages}>
              Próxima ›
            </PageLink>
          </div>
        </div>
      ) : null}
    </div>
  )
}

// ─── Paginação: helpers (espelham o Catálogo) ───────────────────────────────

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
      <span className="cursor-not-allowed rounded-lg border border-zinc-800 px-2.5 py-1 text-[11px] text-zinc-700">
        {children}
      </span>
    )
  }
  return (
    <Link
      href={href}
      className="rounded-lg border border-zinc-800 px-2.5 py-1 text-[11px] text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
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
      className={
        'flex h-7 min-w-[28px] items-center justify-center rounded-lg px-1 text-[11px] font-medium transition-colors ' +
        (active
          ? 'bg-zinc-900 text-zinc-950'
          : 'border border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100')
      }
    >
      {children}
    </Link>
  )
}
