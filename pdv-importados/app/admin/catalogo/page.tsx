/**
 * FastProduct Admin — Catálogo (Fase 4 + UX Fase 1)
 *
 * Server Component. Reusa a query EXISTENTE de produtos do gerente
 * (`buscarProdutosComFiltros` → RPC list_produtos_gerente_filtrados) — nenhuma
 * query nova. Os searchParams da URL são mapeados para o input da RPC
 * (filtros + paginação server-side). As opções de select (categorias/marcas/
 * fornecedores) vêm de `listarOpcoesFiltrosProdutos` (cacheada).
 *
 * UX Fase 1 (UI apenas): hierarquia de CTAs, “Mais filtros” local, busca ampla,
 * reset de `page` opt-in no FilterBar, ações de linha compactas + confirmação
 * ao inativar, empty/loading/erro e a11y dos chips/pills.
 *
 * C6 (CrudListShell): não migrado nesta rodada — o ganho seria sobretudo
 * cosmético; PageHeader.actions + SectionCard já cobrem o fluxo sem risco
 * estrutural. Reavaliar após validação visual.
 */

import { Suspense } from 'react'
import Link from 'next/link'
import { ROUTES, pathWithQuery } from '@shared-core/navigation/routes'
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { getMessages } from '@/i18n/getMessages'
import { opcoesSelecionaveis } from '@/core/catalog/opcoesCadastro'
import { mensagemErroParaUsuario } from '@/lib/errors/mensagemErroUsuario'
import type { FilterDef } from '@/components/ui/FilterBar'
import { PageHeader, SectionCard } from '@/components/ui/admin-v2'
import { CatalogoHubNav } from '@/components/ui/admin-v2/CatalogoHubNav'
import {
  buscarProdutosComFiltros,
  listarOpcoesFiltrosProdutos,
} from '@/app/gerente/produtos/actions'
import { CatalogoTable, type CatalogoProduto } from './_components/CatalogoTable'
import { CatalogoHeaderActions } from './_components/CatalogoHeaderActions'
import { CatalogoFiltrosBar } from './_components/CatalogoFiltrosBar'
import { CatalogoLoadError } from './_components/CatalogoLoadError'

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
    pathname: ROUTES.admin.catalogo,
    resource: `route:${ROUTES.admin.catalogo}`,
  })
  const { idioma } = session
  const m = getMessages(idioma)
  const ui = m.admin_ui
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
        ...r,
        sku: r.codigo_interno ?? r.codigo_barras ?? '—',
      }))
    : []

  const totalCount = produtosRes.success ? produtosRes.data.total : 0
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const loadError = !produtosRes.success
    ? mensagemErroParaUsuario(produtosRes.error, idioma) || ui.catalogo_erro_carregar
    : null

  const catOptions = [
    { value: '', label: m.estoque.filtro_todas_categorias },
    ...opcoesSelecionaveis(opcoes.categorias, categoria ?? '').map((c) => ({ value: c.id, label: c.nome })),
  ]
  const marcaOptions = [
    { value: '', label: ui.catalogo_todas_marcas },
    ...opcoesSelecionaveis(opcoes.marcas, marca ?? '').map((item) => ({ value: item.id, label: item.nome })),
  ]
  const fornOptions = [
    { value: '', label: ui.catalogo_todos_fornecedores },
    ...opcoes.fornecedores.map((f) => ({ value: f.id, label: f.nome })),
  ]

  const primaryFilters: FilterDef[] = [
    {
      type: 'search',
      key: 'q',
      label: ui.catalogo_filtro_busca,
      placeholder: ui.filtro_nfe_busca_placeholder,
      className: 'min-w-[16rem] flex-1 max-w-2xl',
      inputClassName: 'w-full min-w-0',
    },
    {
      type: 'pills',
      key: 'status',
      label: ui.catalogo_filtro_status,
      defaultValue: 'todos',
      options: [
        { value: 'todos', label: ui.filtro_todos },
        { value: 'ativos', label: ui.filtro_ativos },
        { value: 'inativos', label: ui.filtro_inativos },
      ],
    },
    {
      type: 'pills',
      key: 'origem',
      label: ui.catalogo_filtro_origem,
      defaultValue: 'all',
      options: [
        { value: 'all', label: m.produtos.filtro_todas_origens },
        { value: 'china_manual', label: ui.estoque_origem_china },
        { value: 'brasil_nf', label: ui.estoque_origem_brasil_nf },
        { value: 'brasil_sem_nf', label: ui.estoque_origem_brasil },
      ],
    },
  ]

  const advancedFilters: FilterDef[] = [
    { type: 'select', key: 'categoria', label: m.produtos.categoria, defaultValue: '', options: catOptions },
    { type: 'select', key: 'marca', label: ui.catalogo_filtro_marca, defaultValue: '', options: marcaOptions },
    {
      type: 'select',
      key: 'fornecedor',
      label: ui.catalogo_filtro_fornecedor,
      defaultValue: '',
      options: fornOptions,
    },
    {
      type: 'select',
      key: 'estoque',
      label: ui.catalogo_filtro_estoque,
      defaultValue: 'todos',
      options: [
        { value: 'todos', label: ui.filtro_qualquer_saldo },
        { value: 'abaixo_minimo', label: ui.filtro_estoque_abaixo_min },
        { value: 'em_falta', label: ui.catalogo_estoque_em_falta },
      ],
    },
    {
      type: 'select',
      key: 'imagem',
      label: ui.catalogo_filtro_imagem,
      defaultValue: 'todos',
      options: [
        { value: 'todos', label: ui.filtro_todas },
        { value: 'com_imagem', label: ui.catalogo_imagem_com },
        { value: 'sem_imagem', label: ui.catalogo_imagem_sem },
      ],
    },
  ]

  const activeParams: Record<string, string> = {}
  if (q) activeParams.q = q
  if (status !== 'todos') activeParams.status = status
  if (origem !== 'all') activeParams.origem = origem
  if (estoque !== 'todos') activeParams.estoque = estoque
  if (imagem !== 'todos') activeParams.imagem = imagem
  if (categoria) activeParams.categoria = categoria
  if (marca) activeParams.marca = marca
  if (fornecedor) activeParams.fornecedor = fornecedor

  const hasActiveFilters = Object.keys(activeParams).length > 0
  const advancedActive = Boolean(
    categoria || marca || fornecedor || estoque !== 'todos' || imagem !== 'todos',
  )

  const hrefWithout = (key: string) => {
    const p = new URLSearchParams(activeParams)
    p.delete(key)
    p.delete('page')
    return pathWithQuery(ROUTES.admin.catalogo, p)
  }
  const pageHref = (target: number) => {
    const p = new URLSearchParams(activeParams)
    if (target > 1) p.set('page', String(target))
    return pathWithQuery(ROUTES.admin.catalogo, p)
  }

  const nomeDe = (arr: { id: string; nome: string }[], id: string) =>
    arr.find((x) => x.id === id)?.nome ?? id

  const chips: Array<{ key: string; label: string }> = []
  if (categoria) chips.push({ key: 'categoria', label: ui.catalogo_chip_categoria.replace('{{nome}}', nomeDe(opcoes.categorias, categoria)) })
  if (marca) chips.push({ key: 'marca', label: ui.catalogo_chip_marca.replace('{{nome}}', nomeDe(opcoes.marcas, marca)) })
  if (fornecedor) chips.push({ key: 'fornecedor', label: ui.catalogo_chip_fornecedor.replace('{{nome}}', nomeDe(opcoes.fornecedores, fornecedor)) })
  if (estoque !== 'todos') chips.push({ key: 'estoque', label: estoque === 'abaixo_minimo' ? ui.catalogo_estoque_abaixo_minimo : ui.catalogo_estoque_em_falta })
  if (imagem !== 'todos') chips.push({ key: 'imagem', label: imagem === 'com_imagem' ? ui.catalogo_imagem_com : ui.catalogo_imagem_sem })

  const headerActions = (
    <CatalogoHeaderActions
      m={m}
      ui={ui}
      opcoes={opcoes}
      idioma={idioma}
      filtrosExport={{
        situacao: status,
        origem,
        estoque,
        imagens: imagem,
        categoriaId: categoria,
        marcaId: marca,
        fornecedorId: fornecedor,
        busca: q,
      }}
    />
  )

  const countBadge = (
    <span className="rounded-full border border-[var(--color-border-secondary)] bg-[var(--color-surface-soft)] px-2.5 py-0.5 text-caption text-fg-subtle">
      {totalCount} {totalCount === 1 ? ui.catalogo_produto_sg : ui.catalogo_produtos_pl}
    </span>
  )

  return (
    <div className="admin-v2-page">
      <PageHeader
        title={ui.catalogo_titulo}
        subtitle={ui.catalogo_subtitulo}
        actions={headerActions}
      />
      <p className="-mt-3 mb-4 text-caption text-fg-subtle">{ui.catalogo_hint_volume}</p>

      <CatalogoHubNav />

      <div className="mb-4 border-b border-[var(--color-border-secondary)] pb-3">
        <Suspense fallback={<div className="h-9" />}>
          <CatalogoFiltrosBar
            primaryFilters={primaryFilters}
            advancedFilters={advancedFilters}
            advancedActive={advancedActive}
            maisFiltrosLabel={ui.catalogo_mais_filtros}
            menosFiltrosLabel={ui.catalogo_menos_filtros}
            clearLabel={m.comum.limpar_filtros}
          />
        </Suspense>

        {chips.length > 0 ? (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {chips.map((chip) => (
              <Link
                key={chip.key}
                href={hrefWithout(chip.key)}
                className="admin-v2-chip"
                aria-label={ui.catalogo_chip_remover.replace('{{label}}', chip.label)}
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

      {loadError ? (
        <CatalogoLoadError description={loadError} retryLabel={ui.catalogo_tentar_novamente} />
      ) : null}

      <SectionCard title={m.produtos.lista_produtos} action={countBadge}>
        <Suspense
          fallback={
            <div className="space-y-2 p-3" aria-busy="true">
              {Array.from({ length: 6 }, (_, i) => (
                <div
                  key={i}
                  className="h-10 animate-pulse rounded-md bg-[var(--color-surface-soft)]"
                />
              ))}
            </div>
          }
        >
          <CatalogoTable
            produtos={produtos}
            hasActiveFilters={hasActiveFilters}
            labels={{
              produto: m.estoque.col_produto,
              varejo: ui.catalogo_col_varejo,
              atacado: ui.catalogo_col_atacado,
              estoque: m.estoque.titulo,
              origem: m.produtos.origem_label,
              status: m.produtos.status,
              rascunho: ui.catalogo_status_rascunho,
              publicado: ui.catalogo_status_publicado,
              inativo: m.produtos.inativo,
              publicar: ui.catalogo_publicar,
              inativar: m.produtos.inativar,
              vazioTitulo: ui.catalogo_vazio_titulo,
              vazioSub: ui.catalogo_vazio_sub,
              vazioFiltrosTitulo: ui.catalogo_vazio_filtros_titulo,
              vazioFiltrosSub: ui.catalogo_vazio_filtros_sub,
              limparFiltros: m.comum.limpar_filtros,
              cadastroRapido: m.produtos.cadastro_produto,
              origemChina: ui.estoque_origem_china,
              origemBrasilNf: ui.estoque_origem_brasil_nf,
              origemBrasil: ui.estoque_origem_brasil,
              atacadoAPartir: ui.catalogo_atacado_a_partir,
              atacadoFaixasUm: ui.catalogo_atacado_faixas_um,
              atacadoFaixasN: ui.catalogo_atacado_faixas_n,
              acaoEditar: ui.catalogo_acao_editar,
              acaoDuplicar: ui.catalogo_acao_duplicar,
              acaoVerEstoque: ui.catalogo_acao_ver_estoque,
              acaoSelecionarLinha: ui.catalogo_acao_selecionar_linha,
              reativar: ui.catalogo_acao_reativar,
              inativarConfirmTitulo: ui.catalogo_inativar_confirm_titulo,
              inativarConfirmTexto: ui.catalogo_inativar_confirm_texto,
              confirmar: m.comum.confirmar,
              cancelar: m.comum.cancelar,
              fechar: m.comum.fechar,
            }}
            m={m}
            opcoes={opcoes}
            idioma={idioma}
          />
        </Suspense>
      </SectionCard>

      {totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="text-caption text-fg-subtle">
            {m.produtos.pag_info.replace('{{atual}}', String(page)).replace('{{total}}', String(totalPages))}
          </span>
          <div className="flex items-center gap-1">
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
      <span className="cursor-not-allowed rounded-lg border border-[var(--color-border-secondary)] px-2.5 py-1 text-caption text-fg-subtle opacity-50">
        {children}
      </span>
    )
  }
  return (
    <Link
      href={href}
      className="rounded-lg border border-[var(--color-border-secondary)] px-2.5 py-1 text-caption text-fg-muted transition-colors hover:bg-[var(--color-surface-elevated)] hover:text-fg"
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
        'flex h-7 min-w-[28px] items-center justify-center rounded-lg px-1 text-caption font-medium transition-colors ' +
        (active
          ? 'border border-brand/35 bg-[var(--color-info-bg)] text-brand'
          : 'border border-[var(--color-border-secondary)] text-fg-subtle hover:bg-[var(--color-surface-elevated)] hover:text-fg')
      }
    >
      {children}
    </Link>
  )
}
