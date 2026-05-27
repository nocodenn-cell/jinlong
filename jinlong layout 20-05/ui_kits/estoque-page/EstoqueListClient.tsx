'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Search, Download, Plus, ArrowDown, ArrowUp, RefreshCw, Tag } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { GerenteNavLink } from '@/components/gerente/GerenteNavLink'
import { GerenteFilterBar } from '@/components/gerente/GerenteFilterBar'
import { GerenteTable } from '@/components/gerente/GerenteTable'
import { fmtQuantidadeEstoque } from '@/lib/format/fmtQuantidadeEstoque'
import { downloadCsvBrowser } from '@/lib/gerente/gerenteCadastroUi'
import { useGerenteMutation } from '@/lib/hooks/useGerenteMutation'
import { emitGerenteToast } from '@/lib/gerente/toast'
import { cn } from '@/lib/utils'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { getMessages } from '@/i18n/getMessages'
import type { EstoqueCategoriaOpcao } from './page'
import {
  atualizarEstoqueProdutoThrow,
  obterListaEstoqueGerente,
  obterListaEstoqueGerenteCompletaParaExport,
  type EstoqueGerenteLinhaDTO,
} from './actions'
import { EstoqueAjusteModal } from './EstoqueAjusteModal'

const PAGE_SIZE = 25

type ModalState =
  | null
  | {
      produtoId: string
      nome: string
      codigoBarras: string | null
      unidade: string
      quantidadeAtual: number
      estoqueMinimo: number
    }

type Props = Readonly<{
  idioma: Idioma
  soBaixoInicial: boolean
  categorias: EstoqueCategoriaOpcao[]
  importacaoNfeEnabled?: boolean
}>

function skuCurtoDeId(id: string): string {
  return id.replace(/-/g, '').slice(-6).toUpperCase()
}

function fmtRelative(iso: string | null, locale: string): string {
  if (!iso) return '—'
  const ms = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(ms)) return '—'
  const min = Math.floor(ms / 60000)
  if (min < 60) return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(-min, 'minute')
  const h = Math.floor(min / 60)
  if (h < 24) return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(-h, 'hour')
  const d = Math.floor(h / 24)
  return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(-d, 'day')
}

export function EstoqueListClient({
  idioma,
  soBaixoInicial,
  categorias,
  importacaoNfeEnabled = false,
}: Props) {
  const m = getMessages(idioma)
  const pathname = usePathname()
  const locale = idioma === 'pt' ? 'pt-BR' : 'zh-CN'

  // Filtros
  const [busca, setBusca] = useState('')
  const [buscaDebounced, setBuscaDebounced] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [soBaixo, setSoBaixo] = useState(soBaixoInicial)

  // Dados + paginação
  const [linhas, setLinhas] = useState<EstoqueGerenteLinhaDTO[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)

  // Modal
  const [modal, setModal] = useState<ModalState>(null)

  const sentinelRef = useRef<HTMLDivElement>(null)
  const loadingRef = useRef(loading)
  useEffect(() => {
    loadingRef.current = loading
  })

  // Debounce da busca
  useEffect(() => {
    const t = setTimeout(() => setBuscaDebounced(busca.trim()), 280)
    return () => clearTimeout(t)
  }, [busca])

  const baseParams = useMemo(
    () => ({
      visao: (soBaixo ? 'critico' : 'geral') as 'geral' | 'critico',
      busca: buscaDebounced,
      categoria_id: categoriaId || null,
      origem: '',
      ordem: (soBaixo ? 'deficit' : 'nome') as 'nome' | 'deficit',
      dir_asc: !soBaixo,
    }),
    [soBaixo, buscaDebounced, categoriaId],
  )

  // Reset ao mudar filtros
  useEffect(() => {
    setLinhas([])
    setTotal(0)
    setOffset(0)
  }, [baseParams])

  // Carrega primeira página + paginações subsequentes
  const carregarPagina = useCallback(
    async (off: number) => {
      if (loadingRef.current) return
      setLoading(true)
      try {
        const result = await obterListaEstoqueGerente({
          ...baseParams,
          limite: PAGE_SIZE,
          offset: off,
        })
        setTotal(result.total)
        setLinhas((prev) => (off === 0 ? result.rows : [...prev, ...result.rows]))
        setOffset(off + result.rows.length)
      } catch (e) {
        emitGerenteToast({
          kind: 'error',
          message: e instanceof Error ? e.message : m.comum.erro,
        })
      } finally {
        setLoading(false)
      }
    },
    [baseParams, m.comum.erro],
  )

  useEffect(() => {
    void carregarPagina(0)
  }, [carregarPagina])

  // Scroll infinito
  const hasMore = linhas.length < total
  useEffect(() => {
    if (!hasMore) return
    const el = sentinelRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loadingRef.current) {
          void carregarPagina(offset)
        }
      },
      { rootMargin: '300px' },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [hasMore, offset, carregarPagina])

  // Mutação de ajuste
  const { mutate: salvarEstoque, loading: salvando } = useGerenteMutation(
    atualizarEstoqueProdutoThrow,
    { successMessage: m.comum.sucesso },
  )

  // CSV
  const csvColumns = useMemo(
    () => [
      { key: 'sku_ref', header: m.estoque.col_sku },
      { key: 'nome', header: m.estoque.col_produto },
      { key: 'codigo_barras', header: m.estoque.col_codigo },
      { key: 'unidade_medida', header: m.estoque.col_unidade },
      { key: 'quantidade_atual', header: m.estoque.col_quantidade_atual },
      { key: 'estoque_minimo', header: m.estoque.col_estoque_minimo },
      { key: 'deficit', header: m.estoque.col_deficit },
      { key: 'status', header: m.produtos.status },
    ],
    [m],
  )

  function rowToCsv(row: EstoqueGerenteLinhaDTO): Record<string, unknown> {
    const sem = row.estoque_id == null
    const crit =
      !sem &&
      row.quantidade_atual != null &&
      row.estoque_minimo != null &&
      row.quantidade_atual <= row.estoque_minimo
    return {
      sku_ref: skuCurtoDeId(row.id),
      nome: row.nome,
      codigo_barras: row.codigo_barras ?? '',
      unidade_medida: row.unidade_medida,
      quantidade_atual: row.quantidade_atual ?? '',
      estoque_minimo: row.estoque_minimo ?? '',
      deficit: row.deficit ?? '',
      status: sem ? '—' : crit ? m.estoque.badge_critico : m.estoque.badge_normal,
    }
  }

  async function handleExportCsv() {
    setExporting(true)
    try {
      const todas = await obterListaEstoqueGerenteCompletaParaExport(baseParams)
      downloadCsvBrowser(
        soBaixo ? 'gerente-estoque-baixo.csv' : 'gerente-estoque.csv',
        csvColumns,
        todas.map(rowToCsv),
      )
    } catch (e) {
      emitGerenteToast({ kind: 'error', message: e instanceof Error ? e.message : m.comum.erro })
    } finally {
      setExporting(false)
    }
  }

  return (
    <div
      className={cn(
        'mx-auto max-w-[1200px] px-4 py-6 sm:px-6',
        idioma === 'pt' ? '' : 'font-chinese',
      )}
    >
      <GerenteFilterBar title={m.estoque.titulo} />
      <p className="gerente-fin-muted mb-4 text-sm">{m.estoque.subtitulo}</p>

      <div className="mb-4 flex flex-wrap gap-2">
        <GerenteNavLink href="/gerente/estoque" active={!pathname.includes('imprimir-etiquetas') && !pathname.includes('importar-nfe')}>
          {m.estoque.nav_todos}
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

      {/* Filtros */}
      <div className="dragon-glass-card mb-4 flex flex-wrap items-center gap-2 rounded-xl border p-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={m.estoque.buscar_placeholder}
            aria-label={m.estoque.buscar_label}
            className="app-input h-9 w-full rounded-md pl-9 pr-3 text-sm shadow-inner"
          />
        </div>

        <select
          value={categoriaId}
          onChange={(e) => setCategoriaId(e.target.value)}
          aria-label={m.produtos.categoria}
          className="app-select h-9 min-w-[160px] rounded-md px-3 text-sm"
        >
          <option value="">{m.estoque.filtro_todas_categorias}</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>

        <button
          type="button"
          aria-pressed={soBaixo}
          onClick={() => setSoBaixo((s) => !s)}
          className={cn(
            'inline-flex items-center gap-2.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
            soBaixo
              ? 'border-red-400/50 bg-red-950/30 text-red-200'
              : 'app-border app-surface-soft text-muted-foreground hover:text-foreground',
          )}
        >
          <span
            className={cn(
              'inline-flex h-4 w-8 items-center rounded-full p-0.5 transition-colors',
              soBaixo ? 'bg-red-600' : 'bg-slate-500/30',
            )}
            aria-hidden
          >
            <span
              className={cn(
                'h-3 w-3 rounded-full bg-white transition-transform',
                soBaixo && 'translate-x-3.5',
              )}
            />
          </span>
          {m.estoque.toggle_so_baixo}
        </button>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            <strong className="tabular-nums text-foreground">{linhas.length}</strong>
            {' '}/{' '}
            <span className="tabular-nums">{total}</span>
          </span>
          <button
            type="button"
            disabled={exporting || total === 0}
            onClick={() => void handleExportCsv()}
            className={cn(
              'app-btn-neutral inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              (exporting || total === 0) && 'cursor-not-allowed opacity-45',
            )}
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            {exporting ? m.comum.carregando : m.gerente.exportar_csv}
          </button>
        </div>
      </div>

      <GerenteTable
        tone="dragon"
        columns={[
          { key: 'cod', header: m.estoque.col_codigo },
          { key: 'prod', header: m.estoque.col_produto },
          { key: 'atual', header: m.estoque.col_quantidade_atual, width: 130 },
          { key: 'min', header: m.estoque.col_estoque_minimo, width: 130 },
          { key: 'status', header: m.produtos.status, width: 100 },
          { key: 'mov', header: m.estoque.col_ultima_movimentacao, width: 160 },
          { key: 'acoes', header: <span className="sr-only">{m.estoque.col_ajuste}</span>, width: 110 },
        ]}
      >
        {linhas.map((row) => {
          const sem = row.estoque_id == null
          const crit =
            !sem &&
            row.quantidade_atual != null &&
            row.estoque_minimo != null &&
            row.quantidade_atual <= row.estoque_minimo
          const deficit =
            crit && row.estoque_minimo != null && row.quantidade_atual != null
              ? row.estoque_minimo - row.quantidade_atual
              : 0

          return (
            <tr
              key={row.id}
              className={cn(
                'gerente-fin-row-hover transition-colors',
                crit && !sem && 'bg-destructive/[0.08] hover:bg-destructive/[0.14] dark:bg-destructive/15 dark:hover:bg-destructive/25',
              )}
            >
              {/* Código */}
              <td className="gerente-fin-cell px-3 py-3 align-top">
                <div className="font-mono text-xs text-muted-foreground">{skuCurtoDeId(row.id)}</div>
                {row.codigo_barras && (
                  <div className="mt-0.5 font-mono text-xs text-foreground/80">{row.codigo_barras}</div>
                )}
              </td>

              {/* Produto */}
              <td className="gerente-fin-cell px-3 py-3 align-top">
                <div className="font-medium text-foreground">{row.nome}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{row.unidade_medida}</div>
              </td>

              {/* Atual */}
              <td className="gerente-fin-cell px-3 py-3 text-right align-top">
                {sem ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <span
                    className={cn(
                      'inline-flex items-baseline gap-1.5 font-bold tabular-nums',
                      crit ? 'text-red-300' : 'text-foreground',
                    )}
                  >
                    <span className="text-base">{fmtQuantidadeEstoque(Number(row.quantidade_atual))}</span>
                    <span className="text-[10px] font-normal text-muted-foreground">{row.unidade_medida}</span>
                  </span>
                )}
              </td>

              {/* Mínimo */}
              <td className="gerente-fin-cell px-3 py-3 text-right align-top">
                {sem ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <>
                    <div className="text-sm tabular-nums text-foreground/85">
                      {fmtQuantidadeEstoque(Number(row.estoque_minimo))}
                    </div>
                    {deficit > 0 && (
                      <div className="mt-0.5 text-[10px] tabular-nums text-red-300">
                        −{fmtQuantidadeEstoque(deficit)} {m.estoque.para_repor}
                      </div>
                    )}
                  </>
                )}
              </td>

              {/* Status */}
              <td className="px-3 py-3 align-top">
                {sem ? (
                  <span className="text-muted-foreground">—</span>
                ) : crit ? (
                  <Badge variant="destructive" className="app-badge-danger gap-1 px-2 py-0.5">
                    <ArrowDown className="h-3 w-3" aria-hidden /> {m.estoque.badge_critico}
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="app-badge-positive gap-1 px-2 py-0.5">
                    {m.estoque.badge_normal}
                  </Badge>
                )}
              </td>

              {/* Última movimentação */}
              <td className="gerente-fin-cell px-3 py-3 align-top">
                {/* Sem dado real ainda do server-side — exibir placeholder
                    quando obterListaEstoqueGerente() não retornar movimentação.
                    A coluna fica preparada para quando o RPC for atualizado. */}
                <div className="text-xs text-foreground/85">—</div>
                <div className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                  {m.estoque.sem_movimentacao}
                </div>
              </td>

              {/* Ações */}
              <td className="px-3 py-3 align-top">
                {!sem ? (
                  <button
                    type="button"
                    disabled={salvando}
                    onClick={() =>
                      setModal({
                        produtoId: row.id,
                        nome: row.nome,
                        codigoBarras: row.codigo_barras,
                        unidade: row.unidade_medida,
                        quantidadeAtual: Number(row.quantidade_atual),
                        estoqueMinimo: Number(row.estoque_minimo),
                      })
                    }
                    className="app-btn-accent inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold shadow-sm transition-[filter] disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    <RefreshCw className="h-3 w-3" aria-hidden />
                    {m.estoque.col_ajuste}
                  </button>
                ) : (
                  <span className="text-xs text-muted-foreground">{m.estoque.sem_linha}</span>
                )}
              </td>
            </tr>
          )
        })}

        {linhas.length === 0 && !loading && (
          <tr>
            <td colSpan={7} className="gerente-fin-empty px-4 py-12 text-center">
              <div className="font-serif text-5xl text-amber-400/60" style={{ fontFamily: 'var(--font-serif-han)' }}>
                库
              </div>
              <div className="mt-3 text-sm font-semibold text-foreground">
                {soBaixo ? m.estoque.vazio_baixo : m.estoque.vazio_geral_filtrado}
              </div>
              <Link
                href="/gerente/produtos"
                className="app-btn-accent mt-3 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold"
              >
                <Plus className="h-3 w-3" aria-hidden />
                {m.gerente.nav_produtos}
              </Link>
            </td>
          </tr>
        )}
      </GerenteTable>

      {/* Sentinel para scroll infinito */}
      {hasMore && (
        <div ref={sentinelRef} className="mt-4 flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-amber-400/20 border-t-amber-400" />
          {m.comum.carregando}
        </div>
      )}
      {!hasMore && linhas.length > 0 && (
        <div className="mt-4 text-center text-xs text-muted-foreground">
          — {linhas.length} / {total} —
        </div>
      )}

      {soBaixo && <p className="gerente-fin-muted mt-3 text-xs">{m.estoque.dica_baixo}</p>}

      {modal && (
        <EstoqueAjusteModal
          key={modal.produtoId}
          idioma={idioma}
          produtoId={modal.produtoId}
          produtoNome={modal.nome}
          codigoBarras={modal.codigoBarras}
          unidade={modal.unidade}
          quantidadeAtual={modal.quantidadeAtual}
          estoqueMinimo={modal.estoqueMinimo}
          saving={salvando}
          onClose={() => setModal(null)}
          onSubmit={async (payload) => {
            const r = await salvarEstoque(payload)
            if (r !== null) {
              setModal(null)
              await carregarPagina(0)
            }
          }}
        />
      )}
    </div>
  )
}
