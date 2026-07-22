'use client'

/**
 * Relatório de estoque — chrome DS (Onda 7).
 * Mesmas actions/RPCs; UI alinhada à lista Admin de Estoque.
 */

import { useCallback, useEffect, useState } from 'react'
import { Download, FilterX } from 'lucide-react'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Button } from '@/components/ui/button'
import { SearchInput, Select } from '@/components/ui/forms'
import { EmptyState, Loading } from '@/components/ui/feedback'
import { MetricCard, SectionCard } from '@/components/ui/admin-v2'
import { QuantityCell } from '@/components/ui/QuantityCell'
import { downloadCsvBrowser } from '@/lib/gerente/gerenteCadastroUi'
import { emitGerenteToast } from '@/lib/gerente/toast'
import { getMessages } from '@/i18n/getMessages'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { cn } from '@/lib/utils'
import {
  obterListaEstoqueGerente,
  obterListaEstoqueGerenteCompletaParaExport,
  type EstoqueGerenteLinhaDTO,
  type EstoqueGerenteListaResult,
  type EstoqueKpisDTO,
} from '@/app/gerente/estoque/actions'

const LIMITE_PAG = 20

type Props = Readonly<{
  idioma: Idioma
  locale: string
  kpisIniciais: EstoqueKpisDTO
  inicial: EstoqueGerenteListaResult
  categorias: Array<{ id: string; nome: string }>
}>

function fmtQtd(v: number | null): string {
  if (v === null) return '—'
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 3 })
}

export function RelatorioEstoqueClient({ idioma, kpisIniciais, inicial, categorias }: Props) {
  const m = getMessages(idioma)
  const re = m.relatorios_estoque

  const [visao, setVisao] = useState<'geral' | 'critico'>('geral')
  const [origem, setOrigem] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [busca, setBusca] = useState('')
  const [pagina, setPagina] = useState(0)
  const [dados, setDados] = useState<EstoqueGerenteListaResult>(inicial)
  const [loading, setLoading] = useState(false)
  const [exportando, setExportando] = useState(false)

  const origemLabel = useCallback(
    (o: string) => {
      const map: Record<string, string> = {
        china_manual: m.produtos.origem_china,
        brasil_nf: m.produtos.origem_brasil_nf,
        brasil_sem_nf: m.produtos.origem_brasil_sem_nf,
      }
      return map[o] ?? o
    },
    [m],
  )

  const carregar = useCallback(
    async (pag: number) => {
      setLoading(true)
      try {
        const r = await obterListaEstoqueGerente({
          visao,
          busca,
          categoria_id: categoriaId || null,
          origem,
          ordem: 'nome',
          dir_asc: true,
          limite: LIMITE_PAG,
          offset: pag * LIMITE_PAG,
        })
        setDados(r)
      } catch {
        emitGerenteToast({ kind: 'error', message: m.comum.erro })
      } finally {
        setLoading(false)
      }
    },
    [visao, busca, categoriaId, origem, m],
  )

  useEffect(() => {
    setPagina(0)
    const t = setTimeout(() => void carregar(0), 280)
    return () => clearTimeout(t)
  }, [carregar])

  const totalPages = Math.max(1, Math.ceil(dados.total / LIMITE_PAG))

  function mudarPagina(nova: number) {
    setPagina(nova)
    void carregar(nova)
  }

  function limparFiltros() {
    setVisao('geral')
    setOrigem('')
    setCategoriaId('')
    setBusca('')
    setPagina(0)
  }

  async function exportarCSV() {
    setExportando(true)
    try {
      const rows: EstoqueGerenteLinhaDTO[] = await obterListaEstoqueGerenteCompletaParaExport({
        visao,
        busca,
        categoria_id: categoriaId || null,
        origem,
        ordem: 'nome',
        dir_asc: true,
      })
      downloadCsvBrowser(
        `relatorio-estoque-${new Date().toISOString().slice(0, 10)}.csv`,
        [
          { key: 'nome', header: re.col_produto },
          { key: 'codigo_barras', header: re.col_codigo },
          { key: 'unidade_medida', header: re.col_unidade },
          { key: 'origem', header: re.col_origem },
          { key: 'quantidade_atual', header: re.col_qtd_atual },
          { key: 'estoque_minimo', header: re.col_minimo },
          { key: 'deficit', header: re.col_deficit },
        ],
        rows.map((r) => ({
          nome: r.nome,
          codigo_barras: r.codigo_barras ?? '',
          unidade_medida: r.unidade_medida,
          origem: origemLabel(r.origem),
          quantidade_atual: r.quantidade_atual ?? '',
          estoque_minimo: r.estoque_minimo ?? '',
          deficit: r.deficit ?? '',
        })),
      )
    } catch {
      emitGerenteToast({ kind: 'error', message: m.comum.erro })
    } finally {
      setExportando(false)
    }
  }

  const origensOpcoes = [
    { value: '', label: re.origem_todas },
    { value: 'china_manual', label: m.produtos.origem_china },
    { value: 'brasil_nf', label: m.produtos.origem_brasil_nf },
    { value: 'brasil_sem_nf', label: m.produtos.origem_brasil_sem_nf },
  ]

  const pill = (active: boolean) =>
    cn(
      'rounded-full px-3 py-1 text-caption font-medium transition-colors',
      active
        ? 'bg-[var(--color-info-bg)] text-brand'
        : 'bg-[var(--color-surface-soft)] text-fg-subtle hover:text-fg',
    )

  const columns: Column<EstoqueGerenteLinhaDTO>[] = [
    {
      key: 'nome',
      header: re.col_produto,
      priority: 'primary',
      cell: (row) => <span className="font-medium text-fg">{row.nome}</span>,
    },
    {
      key: 'cod',
      header: re.col_codigo,
      priority: 'contextual',
      cell: (row) => (
        <span className="font-mono text-caption text-fg-subtle">{row.codigo_barras ?? '—'}</span>
      ),
    },
    {
      key: 'un',
      header: re.col_unidade,
      cell: (row) => <span className="text-caption">{row.unidade_medida}</span>,
    },
    {
      key: 'orig',
      header: re.col_origem,
      cell: (row) => <span className="text-caption">{origemLabel(row.origem)}</span>,
    },
    {
      key: 'qtd',
      header: re.col_qtd_atual,
      align: 'right',
      cell: (row) => (
        <QuantityCell value={row.quantidade_atual} threshold={row.estoque_minimo} />
      ),
    },
    {
      key: 'min',
      header: re.col_minimo,
      align: 'right',
      cell: (row) => (
        <span className="tabular-nums text-caption text-fg-subtle">{fmtQtd(row.estoque_minimo)}</span>
      ),
    },
    {
      key: 'def',
      header: re.col_deficit,
      align: 'right',
      cell: (row) =>
        row.deficit !== null ? (
          <span
            className={cn(
              'font-semibold tabular-nums',
              row.deficit < 0
                ? 'text-[var(--color-warning-strong)]'
                : 'text-fg-muted',
            )}
          >
            {fmtQtd(row.deficit)}
          </span>
        ) : (
          <span className="text-fg-subtle">—</span>
        ),
    },
  ]

  return (
    <>
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <MetricCard label={re.kpi_total} value={String(kpisIniciais.total_geral)} />
        <MetricCard
          label={re.kpi_critico}
          value={String(kpisIniciais.total_critico)}
          tone={kpisIniciais.total_critico > 0 ? 'danger' : 'gold'}
          icon="alert-circle"
        />
        <MetricCard
          label={re.kpi_zerado}
          value={String(kpisIniciais.total_zerado)}
          tone={kpisIniciais.total_zerado > 0 ? 'warning' : 'gold'}
          icon="package"
        />
      </div>

      <SectionCard className="mb-4">
        <div className="flex flex-wrap items-center gap-3 p-3">
          <div className="flex gap-1.5" role="group">
            <button type="button" onClick={() => setVisao('geral')} className={pill(visao === 'geral')}>
              {re.visao_geral}
            </button>
            <button
              type="button"
              onClick={() => setVisao('critico')}
              className={pill(visao === 'critico')}
            >
              {re.visao_critico}
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {origensOpcoes.map((op) => (
              <button
                key={op.value || 'all'}
                type="button"
                onClick={() => setOrigem(op.value)}
                className={pill(origem === op.value)}
              >
                {op.label}
              </button>
            ))}
          </div>

          <Select
            value={categoriaId}
            onChange={(e) => setCategoriaId(e.target.value)}
            controlSize="sm"
            className="min-w-[10rem]"
          >
            <option value="">{re.filtro_categoria_todas}</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Select>

          <div className="min-w-[12rem] max-w-xs flex-1">
            <SearchInput
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder={re.busca_placeholder}
              controlSize="sm"
            />
          </div>

          <Button type="button" variant="ghost" size="sm" onClick={limparFiltros} className="gap-1">
            <FilterX className="h-3.5 w-3.5" aria-hidden />
            {m.comum.limpar_filtros}
          </Button>

          <div className="flex-1" />

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void exportarCSV()}
            disabled={exportando || dados.total === 0}
            loading={exportando}
            className="gap-1.5"
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            {exportando ? re.exportando : re.exportar_csv}
          </Button>
        </div>
      </SectionCard>

      <SectionCard>
        {loading && dados.rows.length === 0 ? (
          <Loading label={m.comum.carregando} className="min-h-0 py-16" size="sm" />
        ) : (
          <DataTable
            columns={columns}
            data={dados.rows}
            rowKey={(r) => r.id}
            loading={loading && dados.rows.length > 0}
            emptyState={<EmptyState title={re.vazio_titulo} description={re.vazio_sub} />}
            className="rounded-none border-x-0 border-b-0"
          />
        )}
      </SectionCard>

      {totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-center gap-3">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={pagina === 0}
            onClick={() => mudarPagina(pagina - 1)}
          >
            {m.produtos.pag_prev}
          </Button>
          <span className="text-caption text-fg-subtle">
            {pagina + 1} / {totalPages}
          </span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={pagina >= totalPages - 1}
            onClick={() => mudarPagina(pagina + 1)}
          >
            {m.produtos.pag_next}
          </Button>
        </div>
      ) : null}
    </>
  )
}
