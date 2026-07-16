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
import { ROUTES, pathWithQuery } from '@shared-core/navigation/routes'
import { FilterBar, type FilterDef } from '@/components/ui/FilterBar'
import { PageHeader, SectionCard } from '@/components/ui/admin-v2'
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { getMessages } from '@/i18n/getMessages'
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



type SearchParams = {
  q?: string
  visao?: string
  origem?: string
  categoria?: string
  page?: string
}

type PageProps = { searchParams?: Promise<SearchParams> }

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
    ''
  )
  const categoria = uuidOrUndef(sp.categoria)
  const page = clampPage(sp.page)

  // ─── Dados (queries EXISTENTES — nenhuma nova) ───────────────────────────
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
        error: err instanceof Error ? err.message : ui.estoque_erro_carregar,
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

  const catOptions = [
    { value: '', label: m.estoque.filtro_todas_categorias },
    ...opcoes.categorias.map((c) => ({ value: c.id, label: c.nome })),
  ]

  const filters: FilterDef[] = [
    { type: 'search', key: 'q', placeholder: m.estoque.buscar_placeholder },
    {
      type: 'pills',
      key: 'visao',
      defaultValue: 'geral',
      options: [
        { value: 'geral', label: ui.filtro_todos },
        { value: 'critico', label: m.estoque.badge_critico },
      ],
    },
    {
      type: 'pills',
      key: 'origem',
      defaultValue: '',
      options: [
        { value: '', label: m.produtos.filtro_todas_origens },
        { value: 'china_manual', label: ui.estoque_origem_china },
        { value: 'brasil_nf', label: ui.estoque_origem_brasil_nf },
        { value: 'brasil_sem_nf', label: ui.estoque_origem_brasil },
      ],
    },
    { type: 'select', key: 'categoria', label: m.produtos.categoria, defaultValue: '', options: catOptions },
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

  const nomeCategoria = (id: string) => opcoes.categorias.find((c) => c.id === id)?.nome ?? id

  const chips: Array<{ key: string; label: string }> = []
  if (visao !== 'geral') chips.push({ key: 'visao', label: m.estoque.filtro_estoque_baixo })
  if (origem !== '') chips.push({ key: 'origem', label: `${m.produtos.origem_label}: ${origem === 'china_manual' ? ui.estoque_origem_china : origem === 'brasil_nf' ? ui.estoque_origem_brasil_nf : ui.estoque_origem_brasil}` })
  if (categoria) chips.push({ key: 'categoria', label: `${m.produtos.categoria}: ${nomeCategoria(categoria)}` })

  const countBadge = (
    <span className="rounded-full border border-[var(--color-border-secondary)] bg-jl-surface-soft px-2.5 py-0.5 text-[11px] text-jl-fg-3">
      {totalCount} {totalCount === 1 ? m.estoque.col_produto.toLowerCase() : m.estoque.titulo.toLowerCase()}
    </span>
  )

  return (
    <div className="admin-v2-page">
      <PageHeader
        title={m.estoque.titulo}
        subtitle={m.estoque.subtitulo}
        filters={
          <Link href={ROUTES.admin.importNfe} className="admin-v2-btn-secondary">
            <Upload size={14} aria-hidden />
            {ui.catalogo_importar_nfe}
          </Link>
        }
      />

      <div className="mb-4 border-b border-[var(--color-border-secondary)] pb-3">
        <Suspense fallback={<div className="h-9" />}>
          <FilterBar filters={filters} />
        </Suspense>

        {chips.length > 0 ? (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {chips.map((chip) => (
              <Link key={chip.key} href={hrefWithout(chip.key)} className="admin-v2-chip">
                {chip.label}
                <span aria-hidden className="text-jl-fg-3">
                  ✕
                </span>
              </Link>
            ))}
          </div>
        ) : null}
      </div>

      {loadError ? (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-[12px] text-destructive">
          {loadError}
        </div>
      ) : null}

      <SectionCard title={ui.estoque_saldos_titulo} action={countBadge}>
        <EstoqueTable linhas={linhas} labels={{
          produto: m.estoque.col_produto,
          saldo: ui.estoque_col_saldo,
          minimo: ui.estoque_col_minimo,
          deficit: m.estoque.col_deficit,
          unidade: ui.estoque_col_unidade_abrev,
          origem: m.produtos.origem_label,
          origemChina: ui.estoque_origem_china,
          origemBrasilNf: ui.estoque_origem_brasil_nf,
          origemBrasil: ui.estoque_origem_brasil,
          vazioTitulo: ui.estoque_vazio_titulo,
          vazioSub: ui.estoque_vazio_sub,
          ajusteTitulo: ui.estoque_ajuste_titulo,
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
          kardexErroCarregar: ui.estoque_kardex_erro_titulo,
          kardexTentarNovamente: ui.estoque_kardex_tentar_novamente,
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
        }} />
      </SectionCard>

      {totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="text-[11px] text-jl-fg-3">
            {m.produtos.pag_info.replace('{{atual}}', String(page)).replace('{{total}}', String(totalPages))}
          </span>
          <div className="flex items-center gap-1">
            <PageLink href={pageHref(page - 1)} disabled={page <= 1}>
              {ui.paginacao_anterior}
            </PageLink>
            {pageWindow(page, totalPages).map((p, i) =>
              p === 'gap' ? (
                <span key={`gap-${i}`} className="px-1 text-[11px] text-jl-fg-3">
                  …
                </span>
              ) : (
                <PageNumber key={p} href={pageHref(p)} active={p === page}>
                  {p}
                </PageNumber>
              )
            )}
            <PageLink href={pageHref(page + 1)} disabled={page >= totalPages}>
              {ui.paginacao_proxima}
            </PageLink>
          </div>
        </div>
      ) : null}
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
      <span className="cursor-not-allowed rounded-lg border border-[var(--color-border-secondary)] px-2.5 py-1 text-[11px] text-jl-fg-3 opacity-50">
        {children}
      </span>
    )
  }
  return (
    <Link
      href={href}
      className="rounded-lg border border-[var(--color-border-secondary)] px-2.5 py-1 text-[11px] text-jl-fg-2 transition-colors hover:bg-jl-surface-elev hover:text-jl-fg-1"
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
          ? 'border border-jl-accent/35 bg-jl-accent/10 text-jl-accent'
          : 'border border-[var(--color-border-secondary)] text-jl-fg-3 hover:bg-jl-surface-elev hover:text-jl-fg-1')
      }
    >
      {children}
    </Link>
  )
}
