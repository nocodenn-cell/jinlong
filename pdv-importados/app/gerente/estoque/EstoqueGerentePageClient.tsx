'use client'

import Link from 'next/link'
import { ChevronLeft, ChevronRight, Search, Download } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { GerenteNavLink } from '@/components/gerente/GerenteNavLink'
import { GerenteFilterBar } from '@/components/gerente/GerenteFilterBar'
import { GerenteStickyToolbar } from '@/components/gerente/GerenteStickyToolbar'
import { GerenteTable } from '@/components/gerente/GerenteTable'
import { fmtQuantidadeEstoque } from '@/lib/format/fmtQuantidadeEstoque'
import { downloadCsvBrowser, interpolateTemplate } from '@/lib/gerente/gerenteCadastroUi'
import { useGerenteMutation } from '@/lib/hooks/useGerenteMutation'
import { useGerenteQuery } from '@/lib/hooks/useGerenteQuery'
import { emitGerenteToast } from '@/lib/gerente/toast'
import { cn } from '@/lib/utils'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { getMessages } from '@/i18n/getMessages'
import type { EstoqueCategoriaOpcao } from './page'
import {
  atualizarEstoqueProdutoThrow,
  garantirLinhaEstoqueThrow,
  obterListaEstoqueGerente,
  obterListaEstoqueGerenteCompletaParaExport,
  type EstoqueGerenteLinhaDTO,
} from './actions'
import { EstoqueAjusteModal, labelsAjusteEstoque } from './EstoqueAjusteModal'

type ModalState =
  | null
  | {
      produtoId: string
      nome: string
      quantidadeAtual: number
      estoqueMinimo: number
    }

type OrdemCol = 'nome' | 'quantidade_atual' | 'estoque_minimo' | 'codigo_barras' | 'deficit'

type Props = Readonly<{
  idioma: Idioma
  filtro: 'todos' | 'baixo'
  categorias: EstoqueCategoriaOpcao[]
  importacaoNfeEnabled?: boolean
}>

function skuCurtoDeId(id: string): string {
  const d = id.replace(/-/g, '')
  return d.slice(-6)
}

function isCriticoLinha(row: EstoqueGerenteLinhaDTO): boolean {
  const q = row.quantidade_atual
  const min = row.estoque_minimo
  if (row.estoque_id == null || q == null || min == null) return false
  return q <= min
}

function origemLabel(m: ReturnType<typeof getMessages>, origem: string): string {
  if (origem === 'china_manual') return m.produtos.origem_china
  if (origem === 'brasil_nf' || origem === 'brasil_sem_nf') return m.produtos.origem_brasil_nf
  return origem
}

export function EstoqueGerentePageClient({
  idioma,
  filtro,
  categorias,
  importacaoNfeEnabled = false,
}: Props) {
  const m = getMessages(idioma)
  const pathname = usePathname()
  const [modal, setModal] = useState<ModalState>(null)
  const [busca, setBusca] = useState('')
  const [buscaDebounced, setBuscaDebounced] = useState('')
  const [categoriaId, setCategoriaId] = useState<string>('')
  const [origem, setOrigem] = useState<string>('')
  const [pageSize, setPageSize] = useState(25)
  const [pageIndex, setPageIndex] = useState(0)
  const [ordem, setOrdem] = useState<OrdemCol>('nome')
  const [dirAsc, setDirAsc] = useState(true)
  const [selected, setSelected] = useState<Map<string, EstoqueGerenteLinhaDTO>>(new Map())
  const [exporting, setExporting] = useState(false)

  const visao = filtro === 'baixo' ? 'critico' : 'geral'
  const somenteBaixoNav = filtro === 'baixo'

  useEffect(() => {
    const t = setTimeout(() => setBuscaDebounced(busca.trim()), 320)
    return () => clearTimeout(t)
  }, [busca])

  useEffect(() => {
    setPageIndex(0)
  }, [visao, buscaDebounced, categoriaId, origem, pageSize])

  useEffect(() => {
    if (filtro === 'baixo') {
      setOrdem('deficit')
      setDirAsc(false)
    } else {
      setOrdem('nome')
      setDirAsc(true)
    }
  }, [filtro])

  useEffect(() => {
    setSelected(new Map())
  }, [visao, buscaDebounced, categoriaId, origem, pageSize])

  const listParams = useMemo(
    () => ({
      visao: visao as 'geral' | 'critico',
      busca: buscaDebounced,
      categoria_id: categoriaId ? categoriaId : null,
      origem:
        origem === 'china_manual' || origem === 'brasil_nf'
          ? origem
          : '',
      ordem,
      dir_asc: dirAsc,
      limite: pageSize,
      offset: pageIndex * pageSize,
    }),
    [visao, buscaDebounced, categoriaId, origem, ordem, dirAsc, pageSize, pageIndex],
  )

  const queryFn = useCallback(() => obterListaEstoqueGerente(listParams), [listParams])
  const { data, loading, refetch } = useGerenteQuery(queryFn)

  useEffect(() => {
    if (data == null) return
    const t = data.total
    if (t === 0) {
      if (pageIndex !== 0) setPageIndex(0)
      return
    }
    const lastPage = Math.max(0, Math.ceil(t / pageSize) - 1)
    if (pageIndex > lastPage) setPageIndex(lastPage)
  }, [data, pageIndex, pageSize])

  const mutationOpts = useMemo(
    () => ({
      successMessage: m.comum.sucesso,
    }),
    [m.comum.sucesso],
  )

  const { mutate: salvarEstoque, loading: salvando } = useGerenteMutation(atualizarEstoqueProdutoThrow, mutationOpts)

  const { mutate: criarLinhaEstoque, loading: criandoLinha } = useGerenteMutation(garantirLinhaEstoqueThrow, mutationOpts)

  const modalLabels = labelsAjusteEstoque(m)

  const rows = useMemo(() => data?.rows ?? [], [data])
  const total = data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const pageSegura = Math.min(pageIndex + 1, pageCount)

  function toggleOrdem(col: OrdemCol) {
    if (ordem === col) setDirAsc((a) => !a)
    else {
      setOrdem(col)
      setDirAsc(col === 'nome' || col === 'codigo_barras')
    }
  }

  const idsPagina = useMemo(() => rows.map((r) => r.id), [rows])
  const todosSelecionadosPagina = idsPagina.length > 0 && idsPagina.every((id) => selected.has(id))

  function alternarSelecionarPagina() {
    setSelected((prev) => {
      const next = new Map(prev)
      if (todosSelecionadosPagina) {
        for (const id of idsPagina) next.delete(id)
      } else {
        for (const r of rows) next.set(r.id, r)
      }
      return next
    })
  }

  function alternarLinha(row: EstoqueGerenteLinhaDTO) {
    setSelected((prev) => {
      const next = new Map(prev)
      if (next.has(row.id)) next.delete(row.id)
      else next.set(row.id, row)
      return next
    })
  }

  const csvColumns = useMemo(
    () => [
      { key: 'sku_ref', header: m.estoque.col_sku },
      { key: 'nome', header: m.estoque.col_produto },
      { key: 'codigo_barras', header: m.estoque.col_codigo },
      { key: 'origem', header: m.produtos.origem_label },
      { key: 'unidade_medida', header: m.estoque.col_unidade },
      { key: 'quantidade_atual', header: m.estoque.col_quantidade_atual },
      { key: 'estoque_minimo', header: m.estoque.col_estoque_minimo },
      { key: 'deficit', header: m.estoque.col_deficit },
      { key: 'status', header: m.produtos.status },
    ],
    [m],
  )

  function rowToCsvRecord(row: EstoqueGerenteLinhaDTO): Record<string, unknown> {
    const crit = isCriticoLinha(row)
    const sem = row.estoque_id == null
    return {
      sku_ref: skuCurtoDeId(row.id),
      nome: row.nome,
      codigo_barras: row.codigo_barras ?? '',
      origem: origemLabel(m, row.origem),
      unidade_medida: row.unidade_medida,
      quantidade_atual: row.quantidade_atual ?? '',
      estoque_minimo: row.estoque_minimo ?? '',
      deficit: row.deficit ?? '',
      status: sem ? '—' : crit ? m.estoque.badge_critico : m.estoque.badge_normal,
    }
  }

  async function handleExportCsv() {
    if (selected.size > 0) {
      downloadCsvBrowser(
        somenteBaixoNav ? 'gerente-estoque-baixo-selecao.csv' : 'gerente-estoque-selecao.csv',
        csvColumns,
        [...selected.values()].map(rowToCsvRecord),
      )
      return
    }
    setExporting(true)
    try {
      const filtrosExport = {
        visao: listParams.visao,
        busca: listParams.busca,
        categoria_id: listParams.categoria_id,
        origem: listParams.origem,
        ordem: listParams.ordem,
        dir_asc: listParams.dir_asc,
      }
      const todas = await obterListaEstoqueGerenteCompletaParaExport(filtrosExport)
      downloadCsvBrowser(
        somenteBaixoNav ? 'gerente-estoque-baixo.csv' : 'gerente-estoque-visao-geral.csv',
        csvColumns,
        todas.map(rowToCsvRecord),
      )
    } catch (e) {
      emitGerenteToast({
        kind: 'error',
        message: e instanceof Error ? e.message : m.comum.erro,
      })
    } finally {
      setExporting(false)
    }
  }

  function cabecalhoOrdenavel(col: OrdemCol, label: string) {
    const ativo = ordem === col
    return (
      <button
        type="button"
        onClick={() => toggleOrdem(col)}
        className={cn(
          'inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-left font-semibold uppercase tracking-wide transition-colors',
          ativo ? 'text-jl-fg-1' : 'app-muted hover:text-jl-fg-1',
        )}
      >
        {label}
        {ativo ? (dirAsc ? ' ▲' : ' ▼') : null}
      </button>
    )
  }

  return (
    <div className={`mx-auto max-w-[1200px] px-4 py-6 sm:px-6 ${idioma === 'pt' ? '' : 'font-chinese'}`}>
      <GerenteFilterBar title={m.estoque.titulo} />
      <p className="gerente-fin-muted mb-4 text-sm">{m.estoque.subtitulo}</p>

      <div className="mb-4 flex flex-wrap gap-2">
        <GerenteNavLink href="/gerente/estoque" active={!somenteBaixoNav && !pathname.includes('imprimir-etiquetas')}>
          {m.estoque.nav_todos}
        </GerenteNavLink>
        <GerenteNavLink href="/gerente/estoque?filtro=baixo" active={somenteBaixoNav}>
          {m.estoque.filtro_estoque_baixo}
        </GerenteNavLink>
        <GerenteNavLink href="/gerente/estoque/imprimir-etiquetas" active={pathname.includes('imprimir-etiquetas')}>
          {m.estoque.nav_etiquetas}
        </GerenteNavLink>
        {importacaoNfeEnabled ? (
          <GerenteNavLink href="/gerente/estoque/importar-nfe" active={pathname.includes('importar-nfe')}>
            {m.estoque.import_nfe.nav_link}
          </GerenteNavLink>
        ) : null}
      </div>

      <GerenteStickyToolbar className="mb-4">
        <div className="flex flex-wrap items-end gap-x-3 gap-y-2.5 py-2.5">

          {/* ── Busca ──────────────────────────────── */}
          <label className="flex min-w-[200px] flex-1 flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide app-muted">
              {m.estoque.buscar_label}
            </span>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 opacity-40"
                aria-hidden
              />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder={m.estoque.buscar_placeholder}
                className="h-9 w-full rounded-lg pl-8 pr-3 text-sm app-input"
              />
            </div>
          </label>

          {/* ── Categoria ─────────────────────────── */}
          <label className="flex min-w-[155px] flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide app-muted">
              {m.produtos.categoria}
            </span>
            <select
              value={categoriaId}
              onChange={(e) => setCategoriaId(e.target.value)}
              className="h-9 rounded-lg px-3 text-sm app-select"
            >
              <option value="">{m.estoque.filtro_todas_categorias}</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
          </label>

          {/* ── Origem ────────────────────────────── */}
          <label className="flex min-w-[140px] flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide app-muted">
              {m.produtos.origem_label}
            </span>
            <select
              value={origem}
              onChange={(e) => setOrigem(e.target.value)}
              className="h-9 rounded-lg px-3 text-sm app-select"
            >
              <option value="">{m.produtos.filtro_todas_origens}</option>
              <option value="china_manual">{m.produtos.origem_china}</option>
              <option value="brasil_nf">{m.produtos.origem_brasil_nf}</option>
            </select>
          </label>

          {/* ── Linhas + Exportar ─────────────────── */}
          <div className="flex items-end gap-2">
            <label className="flex w-[110px] flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide app-muted">
                {m.produtos.pag_linhas_por_pagina}
              </span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="h-9 rounded-lg px-3 text-sm app-select"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </label>
            {!loading && (
              <button
                type="button"
                disabled={exporting || total === 0}
                onClick={() => void handleExportCsv()}
                className={cn(
                  'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium app-btn-neutral',
                  (exporting || total === 0) && 'cursor-not-allowed opacity-45',
                )}
              >
                <Download className="h-3.5 w-3.5" aria-hidden />
                {exporting ? m.comum.carregando : m.gerente.exportar_csv}
              </button>
            )}
          </div>

        </div>
      </GerenteStickyToolbar>

      {loading && !data ? <p className="gerente-fin-muted text-sm">{m.comum.carregando}</p> : null}

      <GerenteTable
        tone="dragon"
        columns={[
          {
            key: 'x',
            header: (
              <input
                type="checkbox"
                checked={todosSelecionadosPagina}
                onChange={alternarSelecionarPagina}
                disabled={rows.length === 0}
                className="h-4 w-4 rounded border-jl-border-1"
                aria-label={m.estoque.selecionar_pagina_aria}
              />
            ),
            width: 40,
          },
          { key: 'sku', header: m.estoque.col_sku },
          { key: 'p', header: cabecalhoOrdenavel('nome', m.estoque.col_produto) },
          { key: 'c', header: cabecalhoOrdenavel('codigo_barras', m.estoque.col_codigo) },
          { key: 'o', header: m.produtos.origem_label },
          { key: 'u', header: m.estoque.col_unidade },
          { key: 'qa', header: cabecalhoOrdenavel('quantidade_atual', m.estoque.col_quantidade_atual) },
          { key: 'qm', header: cabecalhoOrdenavel('estoque_minimo', m.estoque.col_estoque_minimo) },
          { key: 'd', header: cabecalhoOrdenavel('deficit', m.estoque.col_deficit) },
          { key: 'st', header: m.produtos.status },
          { key: 'aj', header: m.estoque.col_ajuste },
        ]}
      >
        {!loading && rows.length === 0 ? (
          <tr>
            <td colSpan={11} className="gerente-fin-empty px-3 py-5 text-sm">
              <div className="flex flex-col items-center gap-2">
                <span>{somenteBaixoNav ? m.estoque.vazio_baixo : m.estoque.vazio_geral_filtrado}</span>
                <Link href="/gerente/produtos" className="rounded-lg px-3 py-1.5 text-xs font-semibold app-btn-accent">
                  {m.gerente.nav_produtos}
                </Link>
              </div>
            </td>
          </tr>
        ) : (
          rows.map((row) => {
            const critico = isCriticoLinha(row)
            const semLinha = row.estoque_id == null
            return (
              <tr
                key={row.id}
                className={cn(
                  'gerente-fin-row-hover transition-colors',
                  critico &&
                    !semLinha &&
                    'bg-destructive/[0.08] hover:bg-destructive/[0.12] dark:bg-destructive/15 dark:hover:bg-destructive/25',
                )}
              >
                <td className="gerente-fin-cell px-3 py-2.5 align-middle">
                  <input
                    type="checkbox"
                    checked={selected.has(row.id)}
                    onChange={() => alternarLinha(row)}
                    className="h-4 w-4 rounded border-jl-border-1"
                    aria-label={m.estoque.selecionar_linha_aria}
                  />
                </td>
                <td className="gerente-fin-cell px-3 py-2.5 font-mono text-xs">{skuCurtoDeId(row.id)}</td>
                <td className="gerente-fin-cell px-3 py-2.5">{row.nome}</td>
                <td className="gerente-fin-cell px-3 py-2.5">{row.codigo_barras?.trim() ? row.codigo_barras : '—'}</td>
                <td className="gerente-fin-cell px-3 py-2.5 text-xs">{origemLabel(m, row.origem)}</td>
                <td className="gerente-fin-cell px-3 py-2.5">{row.unidade_medida}</td>
                <td className="gerente-fin-cell px-3 py-2.5">
                  {semLinha ? '—' : fmtQuantidadeEstoque(Number(row.quantidade_atual ?? 0))}
                </td>
                <td className="gerente-fin-cell px-3 py-2.5">
                  {semLinha ? '—' : fmtQuantidadeEstoque(Number(row.estoque_minimo ?? 0))}
                </td>
                <td className="gerente-fin-cell px-3 py-2.5">
                  {semLinha || row.deficit == null ? '—' : fmtQuantidadeEstoque(Number(row.deficit))}
                </td>
                <td className="px-3 py-2.5">
                  {semLinha ? (
                    <span className="text-jl-fg-3">—</span>
                  ) : critico ? (
                    <Badge variant="destructive">{m.estoque.badge_critico}</Badge>
                  ) : (
                    <Badge variant="secondary" className="border border-jl-border-1 bg-emerald-500/15 text-emerald-300">
                      {m.estoque.badge_normal}
                    </Badge>
                  )}
                </td>
                <td className="min-w-[200px] px-3 py-2.5">
                  {row.estoque_id != null && row.quantidade_atual != null && row.estoque_minimo != null ? (
                    <button
                      type="button"
                      disabled={salvando || criandoLinha}
                      onClick={() =>
                        setModal({
                          produtoId: row.id,
                          nome: row.nome,
                          quantidadeAtual: Number(row.quantidade_atual),
                          estoqueMinimo: Number(row.estoque_minimo),
                        })
                      }
                      className="rounded-lg px-3 py-2 text-xs font-semibold shadow-sm transition-[filter] disabled:cursor-not-allowed disabled:opacity-55 app-btn-accent"
                    >
                      {m.estoque.col_ajuste}
                    </button>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="gerente-fin-empty text-sm">{m.estoque.sem_linha}</span>
                      <button
                        type="button"
                        disabled={salvando || criandoLinha}
                        onClick={async () => {
                          const r = await criarLinhaEstoque({ produto_id: row.id })
                          if (r !== null) await refetch()
                        }}
                        className="gerente-chip-action rounded-lg border border-jl-border-1 px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-55"
                      >
                        {m.estoque.inicializar_estoque}
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            )
          })
        )}
      </GerenteTable>

      {!loading && total > 0 ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-jl-fg-3">
            {interpolateTemplate(m.produtos.pag_mostrar, { visiveis: String(rows.length), total: String(total) })}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={pageIndex <= 0}
              onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
              className="inline-flex items-center gap-1 rounded-lg border border-jl-border-1 bg-jl-surface-elev px-3 py-1.5 text-xs font-medium disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
              {m.produtos.pag_prev}
            </button>
            <span className="text-xs text-jl-fg-3">
              {interpolateTemplate(m.produtos.pag_info, { atual: String(pageSegura), total: String(pageCount) })}
            </span>
            <button
              type="button"
              disabled={pageIndex + 1 >= pageCount}
              onClick={() => setPageIndex((p) => p + 1)}
              className="inline-flex items-center gap-1 rounded-lg border border-jl-border-1 bg-jl-surface-elev px-3 py-1.5 text-xs font-medium disabled:opacity-40"
            >
              {m.produtos.pag_next}
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      ) : null}

      {somenteBaixoNav ? <p className="gerente-fin-muted mt-3 text-xs">{m.estoque.dica_baixo}</p> : null}

      {modal ? (
        <EstoqueAjusteModal
          key={modal.produtoId}
          open
          produtoId={modal.produtoId}
          produtoNome={modal.nome}
          quantidadeAtual={modal.quantidadeAtual}
          estoqueMinimo={modal.estoqueMinimo}
          saving={salvando}
          labels={modalLabels}
          onClose={() => setModal(null)}
          onSubmit={async (payload) => {
            const r = await salvarEstoque(payload)
            if (r !== null) {
              await refetch()
              setModal(null)
            }
          }}
        />
      ) : null}
    </div>
  )
}
