/**
 * FastProduct Admin — Catálogo (Fase 4)
 *
 * Server Component. Reusa a query EXISTENTE de produtos do gerente
 * (`buscarProdutosComFiltros` → RPC list_produtos_gerente_filtrados) — nenhuma
 * query nova. Os searchParams da URL são mapeados para o input da RPC
 * (filtros + paginação server-side). As opções de select (categorias/marcas/
 * fornecedores) vêm de `listarOpcoesFiltrosProdutos` (cacheada).
 *
 * Fase 4 "lean" (sem modificar components/ui/):
 *   - FilterBar (Fase 2): busca + pills (status/origem) + selects.
 *   - DataTable (Fase 2): colunas + ações no hover + sort client-side.
 *   - Paginação: links server-side via ?page= (a RPC já pagina).
 *   - Chips de filtros avançados ativos: removíveis (links server-side).
 *   - Seleção/ações em lote e filtro de TAGS: deferidos (existem em /gerente/produtos).
 */

import { Suspense } from 'react'
import Link from 'next/link'
import { Download, Plus, Upload } from 'lucide-react'
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { mensagemErroParaUsuario } from '@/lib/errors/mensagemErroUsuario'
import { FilterBar, type FilterDef } from '@/components/ui/FilterBar'
import {
  buscarProdutosComFiltros,
  listarOpcoesFiltrosProdutos,
} from '@/app/gerente/produtos/actions'
import { CatalogoTable, type CatalogoProduto } from './_components/CatalogoTable'

const PAGE_SIZE = 20

// ─── Normalizadores de searchParams ─────────────────────────────────────────

type Situacao = 'todos' | 'ativos' | 'inativos'
type OrigemFiltro = 'all' | 'china_manual' | 'brasil_nf' | 'brasil_sem_nf'
type EstoqueFiltro = 'todos' | 'abaixo_minimo' | 'em_falta'
type ImagemFiltro = 'todos' | 'com_imagem' | 'sem_imagem'

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

const ESTOQUE_LABEL: Record<Exclude<EstoqueFiltro, 'todos'>, string> = {
  abaixo_minimo: 'Abaixo ou igual ao mínimo',
  em_falta: 'Sem saldo (≤ 0)',
}
const IMAGEM_LABEL: Record<Exclude<ImagemFiltro, 'todos'>, string> = {
  com_imagem: 'Com imagem',
  sem_imagem: 'Sem imagem',
}

type SearchParams = {
  q?: string
  status?: string
  origem?: string
  categoria?: string
  marca?: string
  fornecedor?: string
  estoque?: string
  imagem?: string
  page?: string
}

type PageProps = { searchParams?: Promise<SearchParams> }

export default async function AdminCatalogoPage({ searchParams }: PageProps) {
  const { session } = await loadAdminContext({
    pathname: '/admin/catalogo',
    resource: 'route:/admin/catalogo',
  })
  const { idioma } = session
  const sp = (searchParams ? await searchParams : {}) ?? {}

  const q = (sp.q ?? '').slice(0, 200)
  const status = oneOf<Situacao>(sp.status, ['todos', 'ativos', 'inativos'], 'todos')
  const origem = oneOf<OrigemFiltro>(
    sp.origem,
    ['all', 'china_manual', 'brasil_nf', 'brasil_sem_nf'],
    'all'
  )
  const estoque = oneOf<EstoqueFiltro>(sp.estoque, ['todos', 'abaixo_minimo', 'em_falta'], 'todos')
  const imagem = oneOf<ImagemFiltro>(sp.imagem, ['todos', 'com_imagem', 'sem_imagem'], 'todos')
  const categoria = uuidOrUndef(sp.categoria)
  const marca = uuidOrUndef(sp.marca)
  const fornecedor = uuidOrUndef(sp.fornecedor)
  const page = clampPage(sp.page)

  // ─── Dados (queries EXISTENTES — nenhuma nova) ───────────────────────────
  const [opcoesRes, produtosRes] = await Promise.all([
    listarOpcoesFiltrosProdutos(),
    buscarProdutosComFiltros({
      situacao: status,
      origem,
      nf: 'all',
      estoque,
      imagens: imagem,
      tags: [],
      categoriaId: categoria,
      marcaId: marca,
      fornecedorId: fornecedor,
      busca: q,
      page,
      pageSize: PAGE_SIZE,
    }),
  ])

  const opcoes = opcoesRes.success
    ? opcoesRes.data
    : { categorias: [], marcas: [], fornecedores: [] }

  const produtos: CatalogoProduto[] = produtosRes.success
    ? produtosRes.data.rows.map((r) => ({
        id: r.id,
        nome: r.nome,
        sku: r.codigo_interno ?? r.codigo_barras ?? '—',
        imagem_url: r.imagem_url,
        preco_varejo: r.preco_varejo,
        preco_atacado: r.preco_atacado,
        quantidade_gatilho_atacado: r.quantidade_gatilho_atacado,
        quantidade_atual: r.quantidade_atual,
        origem: r.origem,
        ativo: r.ativo,
      }))
    : []

  const totalCount = produtosRes.success ? produtosRes.data.total : 0
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const loadError = !produtosRes.success
    ? mensagemErroParaUsuario(produtosRes.error, idioma)
    : null

  // ─── FilterBar (Fase 2) ──────────────────────────────────────────────────
  const catOptions = [
    { value: '', label: 'Todas as categorias' },
    ...opcoes.categorias.map((c) => ({ value: c.id, label: c.nome })),
  ]
  const marcaOptions = [
    { value: '', label: 'Todas as marcas' },
    ...opcoes.marcas.map((m) => ({ value: m.id, label: m.nome })),
  ]
  const fornOptions = [
    { value: '', label: 'Todos os fornecedores' },
    ...opcoes.fornecedores.map((f) => ({ value: f.id, label: f.nome })),
  ]

  const filters: FilterDef[] = [
    { type: 'search', key: 'q', placeholder: 'Nome, SKU ou código de barras…' },
    {
      type: 'pills',
      key: 'status',
      defaultValue: 'todos',
      options: [
        { value: 'todos', label: 'Todos' },
        { value: 'ativos', label: 'Ativos' },
        { value: 'inativos', label: 'Inativos' },
      ],
    },
    {
      type: 'pills',
      key: 'origem',
      defaultValue: 'all',
      options: [
        { value: 'all', label: 'Todas as origens' },
        { value: 'china_manual', label: 'China' },
        { value: 'brasil_nf', label: 'Brasil · NF' },
        { value: 'brasil_sem_nf', label: 'Brasil' },
      ],
    },
    { type: 'select', key: 'categoria', label: 'Categoria', defaultValue: '', options: catOptions },
    { type: 'select', key: 'marca', label: 'Marca', defaultValue: '', options: marcaOptions },
    {
      type: 'select',
      key: 'fornecedor',
      label: 'Fornecedor',
      defaultValue: '',
      options: fornOptions,
    },
    {
      type: 'select',
      key: 'estoque',
      label: 'Estoque',
      defaultValue: 'todos',
      options: [
        { value: 'todos', label: 'Qualquer saldo' },
        { value: 'abaixo_minimo', label: 'Abaixo/igual ao mínimo' },
        { value: 'em_falta', label: 'Sem saldo (≤ 0)' },
      ],
    },
    {
      type: 'select',
      key: 'imagem',
      label: 'Imagem',
      defaultValue: 'todos',
      options: [
        { value: 'todos', label: 'Todas' },
        { value: 'com_imagem', label: 'Com imagem' },
        { value: 'sem_imagem', label: 'Sem imagem' },
      ],
    },
  ]

  // ─── Chips de filtros avançados ativos (server-side, removíveis) ──────────
  const activeParams: Record<string, string> = {}
  if (q) activeParams.q = q
  if (status !== 'todos') activeParams.status = status
  if (origem !== 'all') activeParams.origem = origem
  if (estoque !== 'todos') activeParams.estoque = estoque
  if (imagem !== 'todos') activeParams.imagem = imagem
  if (categoria) activeParams.categoria = categoria
  if (marca) activeParams.marca = marca
  if (fornecedor) activeParams.fornecedor = fornecedor

  const hrefWithout = (key: string) => {
    const p = new URLSearchParams(activeParams)
    p.delete(key)
    p.delete('page')
    const qs = p.toString()
    return qs ? `/admin/catalogo?${qs}` : '/admin/catalogo'
  }
  const pageHref = (target: number) => {
    const p = new URLSearchParams(activeParams)
    if (target > 1) p.set('page', String(target))
    const qs = p.toString()
    return qs ? `/admin/catalogo?${qs}` : '/admin/catalogo'
  }

  const nomeDe = (arr: { id: string; nome: string }[], id: string) =>
    arr.find((x) => x.id === id)?.nome ?? id

  const chips: Array<{ key: string; label: string }> = []
  if (categoria) chips.push({ key: 'categoria', label: `Categoria: ${nomeDe(opcoes.categorias, categoria)}` })
  if (marca) chips.push({ key: 'marca', label: `Marca: ${nomeDe(opcoes.marcas, marca)}` })
  if (fornecedor) chips.push({ key: 'fornecedor', label: `Fornecedor: ${nomeDe(opcoes.fornecedores, fornecedor)}` })
  if (estoque !== 'todos') chips.push({ key: 'estoque', label: ESTOQUE_LABEL[estoque] })
  if (imagem !== 'todos') chips.push({ key: 'imagem', label: IMAGEM_LABEL[imagem] })

  return (
    <div className="flex flex-col">
      {/* Cabeçalho + ações */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 pb-3 pt-5">
        <div>
          <h1 className="text-[18px] font-semibold text-zinc-100">Catálogo</h1>
          <p className="mt-0.5 text-[12px] text-zinc-500">Produtos cadastrados na loja</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Hrefs transitórios → /gerente/produtos enquanto rotas /admin/* não existem */}
          <Link href="/gerente/produtos" className="fp-btn fp-btn--secondary">
            <Upload size={14} aria-hidden />
            Importar NF-e XML
          </Link>
          <Link href="/gerente/produtos" className="fp-btn fp-btn--secondary">
            <Download size={14} aria-hidden />
            Exportar CSV
          </Link>
          <Link href="/gerente/produtos" className="fp-btn fp-btn--primary">
            <Plus size={14} aria-hidden />
            Cadastro rápido
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
        <span className="text-[13px] font-medium text-zinc-300">Lista de produtos</span>
        <span className="rounded-full border border-zinc-800 bg-zinc-900 px-2.5 py-0.5 text-[11px] text-zinc-500">
          {totalCount} {totalCount === 1 ? 'produto encontrado' : 'produtos encontrados'}
        </span>
      </div>

      {loadError ? (
        <div className="mx-6 mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-[12px] text-red-300">
          {loadError}
        </div>
      ) : null}

      <CatalogoTable produtos={produtos} />

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

// ─── Paginação: helpers ─────────────────────────────────────────────────────

function pageWindow(current: number, total: number): Array<number | 'gap'> {
  const out: Array<number | 'gap'> = []
  const push = (n: number) => out.push(n)
  const win = new Set<number>([1, total, current - 1, current, current + 1])
  const sorted = [...win].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b)
  let prev = 0
  for (const n of sorted) {
    if (prev && n - prev > 1) out.push('gap')
    push(n)
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
