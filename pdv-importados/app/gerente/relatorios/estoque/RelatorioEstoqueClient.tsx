'use client'

import { useCallback, useEffect, useState } from 'react'
import { Download, FilterX } from 'lucide-react'
import { GerenteTable } from '@/components/gerente/GerenteTable'
import { GerenteStickyToolbar } from '@/components/gerente/GerenteStickyToolbar'
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

  const chipBase =
    'rounded-full px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400'
  const chipActive = 'bg-amber-400 text-black'
  const chipInactive = 'bg-white/[0.09] text-jl-fg-2 hover:bg-white/[0.14]'

  const origensOpcoes = [
    { value: '', label: re.origem_todas },
    { value: 'china_manual', label: m.produtos.origem_china },
    { value: 'brasil_nf', label: m.produtos.origem_brasil_nf },
    { value: 'brasil_sem_nf', label: m.produtos.origem_brasil_sem_nf },
  ]

  return (
    <>
      {/* KPIs */}
      <div className="mb-5 grid grid-cols-3 gap-3">
        <div className="dragon-glass-card rounded-xl p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-jl-fg-3">{re.kpi_total}</div>
          <div className="mt-1 text-xl font-bold leading-tight tabular-nums text-jl-fg-1">{kpisIniciais.total_geral}</div>
        </div>
        <div className="dragon-glass-card rounded-xl p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-jl-fg-3">{re.kpi_critico}</div>
          <div className={cn('mt-1 text-xl font-bold leading-tight tabular-nums', kpisIniciais.total_critico > 0 ? 'text-red-300' : 'text-jl-fg-1')}>
            {kpisIniciais.total_critico}
          </div>
        </div>
        <div className="dragon-glass-card rounded-xl p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-jl-fg-3">{re.kpi_zerado}</div>
          <div className={cn('mt-1 text-xl font-bold leading-tight tabular-nums', kpisIniciais.total_zerado > 0 ? 'text-amber-400' : 'text-jl-fg-1')}>
            {kpisIniciais.total_zerado}
          </div>
        </div>
      </div>

      {/* Filtros */}
      <GerenteStickyToolbar className="mb-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Visão chips */}
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setVisao('geral')}
              className={cn(chipBase, visao === 'geral' ? chipActive : chipInactive)}
            >
              {re.visao_geral}
            </button>
            <button
              type="button"
              onClick={() => setVisao('critico')}
              className={cn(chipBase, visao === 'critico' ? chipActive : chipInactive)}
            >
              {re.visao_critico}
            </button>
          </div>

          {/* Origem chips */}
          <div className="flex flex-wrap gap-1.5">
            {origensOpcoes.map((op) => (
              <button
                key={op.value}
                type="button"
                onClick={() => setOrigem(op.value)}
                className={cn(chipBase, origem === op.value ? chipActive : chipInactive)}
              >
                {op.label}
              </button>
            ))}
          </div>

          {/* Categoria select */}
          <select
            value={categoriaId}
            onChange={(e) => setCategoriaId(e.target.value)}
            className="app-select h-8 rounded-md px-2.5 text-xs"
          >
            <option value="">{re.filtro_categoria_todas}</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>

          {/* Busca */}
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={re.busca_placeholder}
            className="app-input h-8 w-48 rounded-md px-2.5 text-xs sm:w-56"
          />

          <button
            type="button"
            onClick={limparFiltros}
            className="inline-flex items-center gap-1 text-xs text-jl-fg-3 hover:text-jl-fg-1"
          >
            <FilterX className="h-3 w-3" aria-hidden />
            {m.comum.limpar_filtros}
          </button>

          <div className="flex-1" />

          {/* Export */}
          <button
            type="button"
            onClick={() => void exportarCSV()}
            disabled={exportando || dados.total === 0}
            className="app-btn-neutral inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            {exportando ? re.exportando : re.exportar_csv}
          </button>
        </div>
      </GerenteStickyToolbar>

      {/* Tabela */}
      <GerenteTable
        tone="dragon"
        compact
        columns={[
          { key: 'nome', header: re.col_produto, priority: 'primary' },
          { key: 'cod', header: re.col_codigo, priority: 'contextual' },
          { key: 'un', header: re.col_unidade, priority: 'contextual' },
          { key: 'orig', header: re.col_origem, priority: 'contextual' },
          { key: 'qtd', header: re.col_qtd_atual, priority: 'primary', numeric: true },
          { key: 'min', header: re.col_minimo, numeric: true },
          { key: 'def', header: re.col_deficit, numeric: true },
        ]}
      >
        {dados.rows.map((row) => (
          <tr key={row.id} className="gerente-fin-row-hover">
            <td className="gerente-fin-cell px-3 py-2 font-medium">{row.nome}</td>
            <td className="gerente-fin-cell px-3 py-2 font-mono text-xs text-jl-fg-3">
              {row.codigo_barras ?? '—'}
            </td>
            <td className="gerente-fin-cell px-3 py-2 text-xs">{row.unidade_medida}</td>
            <td className="gerente-fin-cell px-3 py-2 text-xs">{origemLabel(row.origem)}</td>
            <td className="gerente-fin-cell px-3 py-2 text-right tabular-nums">{fmtQtd(row.quantidade_atual)}</td>
            <td className="gerente-fin-cell px-3 py-2 text-right tabular-nums text-jl-fg-3">{fmtQtd(row.estoque_minimo)}</td>
            <td
              className={cn(
                'px-3 py-2 text-right font-semibold tabular-nums',
                row.deficit !== null && row.deficit < 0 ? 'gerente-caixa-diff-warn' : 'gerente-fin-cell',
              )}
            >
              {row.deficit !== null ? fmtQtd(row.deficit) : '—'}
            </td>
          </tr>
        ))}
        {dados.rows.length === 0 && !loading && (
          <tr>
            <td colSpan={7} className="gerente-fin-empty px-4 py-12 text-center">
              <div className="text-5xl text-amber-400/60" style={{ fontFamily: 'var(--font-serif-han)' }}>
                存
              </div>
              <div className="mt-3 text-sm font-semibold text-jl-fg-1">{re.vazio_titulo}</div>
              <div className="mt-1 text-xs text-jl-fg-3">{re.vazio_sub}</div>
            </td>
          </tr>
        )}
      </GerenteTable>

      {loading && (
        <p className="mt-4 text-center text-sm opacity-60">{m.comum.carregando}</p>
      )}

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3">
          <button
            type="button"
            disabled={pagina === 0}
            onClick={() => mudarPagina(pagina - 1)}
            className="app-btn-neutral rounded-md px-3 py-1.5 text-xs disabled:opacity-40"
          >
            {m.produtos.pag_prev}
          </button>
          <span className="text-xs text-jl-fg-3">
            {pagina + 1} / {totalPages}
          </span>
          <button
            type="button"
            disabled={pagina >= totalPages - 1}
            onClick={() => mudarPagina(pagina + 1)}
            className="app-btn-neutral rounded-md px-3 py-1.5 text-xs disabled:opacity-40"
          >
            {m.produtos.pag_next}
          </button>
        </div>
      )}
    </>
  )
}
