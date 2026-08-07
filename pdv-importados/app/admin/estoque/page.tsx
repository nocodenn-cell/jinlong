/**
 * FastProduct Admin — Estoque (Onda 7 · DS).
 * Server Component. Queries/RPC inalteradas. Chrome = CrudListShell + FilterBar + DataTable.
 */

import { Suspense } from 'react'
import Link from 'next/link'
import { ArrowLeftRight, PackageCheck, Printer, Upload } from 'lucide-react'
import { ROUTES, pathWithQuery } from '@shared-core/navigation/routes'
import { FilterBar, type FilterDef } from '@/components/ui/FilterBar'
import { PaginationBar, clampPage } from '@/components/ui/PaginationBar'
import {
  PageActions,
  PageShell,
  CrudListShell,
} from '@/components/ui/admin-v2'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/feedback'
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { getMessages } from '@/i18n/getMessages'
import { obterListaEstoqueGerente } from '@/app/gerente/estoque/actions'
import { listarOpcoesFiltrosProdutos } from '@/app/gerente/produtos/actions'
import { EstoqueTable, type EstoqueLinha } from './_components/EstoqueTable'

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
    '',
  )
  const categoria = uuidOrUndef(sp.categoria)
  const page = clampPage(sp.page)

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
      }),
    ),
  ])

  const opcoes = opcoesRes.success
    ? opcoesRes.data
    : { categorias: [], marcas: [], fornecedores: [] }
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

  return (
    <PageShell
      title={m.estoque.titulo}
      subtitle={m.estoque.subtitulo}
      actions={
        <PageActions>
          <Button asChild variant="secondary" size="sm" className="gap-1.5">
            <Link href={ROUTES.admin.importNfe}>
              <Upload className="h-4 w-4" aria-hidden />
              {ui.catalogo_importar_nfe}
            </Link>
          </Button>
          <Button asChild variant="secondary" size="sm" className="gap-1.5">
            <Link href={ROUTES.admin.estoqueRecebimento}>
              <PackageCheck className="h-4 w-4" aria-hidden />
              {m.gerente.recebimento_page.titulo}
            </Link>
          </Button>
          <Button asChild variant="secondary" size="sm" className="gap-1.5">
            <Link href={ROUTES.admin.estoqueTransferencias}>
              <ArrowLeftRight className="h-4 w-4" aria-hidden />
              {m.gerente.nav_transferencias}
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm" className="gap-1.5">
            <Link href={ROUTES.admin.estoqueImprimirEtiquetas}>
              <Printer className="h-4 w-4" aria-hidden />
              {ui.estoque_etiquetas}
            </Link>
          </Button>
        </PageActions>
      }
    >
      <CrudListShell
        title={ui.estoque_saldos_titulo}
        meta={
          <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2.5 py-0.5 text-caption text-fg-subtle">
            {totalCount}{' '}
            {totalCount === 1 ? m.estoque.col_produto.toLowerCase() : m.estoque.titulo.toLowerCase()}
          </span>
        }
        toolbar={
          <div className="flex w-full flex-col gap-2.5">
            <Suspense fallback={<div className="h-9" />}>
              <FilterBar filters={filters} />
            </Suspense>
            {chips.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5">
                {chips.map((chip) => (
                  <Link
                    key={chip.key}
                    href={hrefWithout(chip.key)}
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
          <PaginationBar
            page={page}
            totalPages={totalPages}
            pageHref={pageHref}
            label={m.produtos.pag_info
              .replace('{{atual}}', String(page))
              .replace('{{total}}', String(totalPages))}
            anteriorLabel={ui.paginacao_anterior}
            proximaLabel={ui.paginacao_proxima}
          />
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
    </PageShell>
  )
}
