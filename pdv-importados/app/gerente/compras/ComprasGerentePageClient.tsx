'use client'

/**
 * @legacy Gerente shell — migrado para Admin V2 (`/admin/estoque/recebimento`).
 * Evidência de migração; remover após 1–2 releases estáveis.
 * NÃO reutilizar em fluxos novos.
 */

import { useCallback, useEffect, useState } from 'react'
import { Plus, FilterX } from 'lucide-react'
import { GerenteTable } from '@/components/gerente/GerenteTable'
import { GerenteStickyToolbar } from '@/components/gerente/GerenteStickyToolbar'
import { emitToast } from '@/lib/gerente/toast'
import { getMessages } from '@/i18n/getMessages'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { cn } from '@/lib/utils'
import { formatBRL } from '@/lib/format/money'
import {
  listarOrdensCompra,
  type OcDetalheDTO,
  type OcKpisDTO,
  type OcListaDTO,
  type OcListaResult,
  type StatusOC,
} from './actions'
import { OcFormModal } from './OcFormModal'
import { OcDetalheModal } from './OcDetalheModal'

const LIMITE_PAG = 20

type Props = Readonly<{
  idioma: Idioma
  kpisIniciais: OcKpisDTO
  inicial: OcListaResult
  fornecedores: Array<{ id: string; nome: string }>
  produtos: Array<{ id: string; nome: string; unidade_medida: string }>
}>

const STATUS_CORES: Record<StatusOC, string> = {
  RASCUNHO: 'bg-white/[0.09] text-jl-fg-3',
  CONFIRMADA: 'bg-blue-500/20 text-blue-300',
  EM_TRANSITO: 'bg-amber-400/20 text-amber-300',
  RECEBIDA: 'bg-emerald-500/20 text-emerald-300',
  CANCELADA: 'bg-red-500/20 text-red-300',
}

function fmtData(d: string | null): string {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR')
}

function idCurto(id: string): string {
  return id.slice(0, 8).toUpperCase()
}

export function ComprasGerentePageClient({ idioma, kpisIniciais, inicial, fornecedores, produtos }: Props) {
  const m = getMessages(idioma)
  const c = m.compras

  const [statusFiltro, setStatusFiltro] = useState<StatusOC | ''>('')
  const [busca, setBusca] = useState('')
  const [pagina, setPagina] = useState(0)
  const [dados, setDados] = useState<OcListaResult>(inicial)
  const [loading, setLoading] = useState(false)

  const [formAberto, setFormAberto] = useState(false)
  const [ocParaEditar, setOcParaEditar] = useState<OcDetalheDTO | null>(null)
  const [detalheId, setDetalheId] = useState<string | null>(null)

  const carregar = useCallback(
    async (pag: number) => {
      setLoading(true)
      try {
        const r = await listarOrdensCompra({
          status: statusFiltro || null,
          busca,
          limite: LIMITE_PAG,
          offset: pag * LIMITE_PAG,
        })
        setDados(r)
      } catch {
        emitToast({ kind: 'error', message: m.comum.erro })
      } finally {
        setLoading(false)
      }
    },
    [statusFiltro, busca, m],
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
    setStatusFiltro('')
    setBusca('')
    setPagina(0)
  }

  function abrirNova() {
    setOcParaEditar(null)
    setFormAberto(true)
  }

  function abrirEditar(oc: OcDetalheDTO) {
    setOcParaEditar(oc)
    setFormAberto(true)
    setDetalheId(null)
  }

  function fecharForm() {
    setFormAberto(false)
    setOcParaEditar(null)
  }

  function aoSalvar() {
    fecharForm()
    void carregar(pagina)
  }

  function aoAtualizarStatus() {
    setDetalheId(null)
    void carregar(pagina)
  }

  const chipBase =
    'rounded-full px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400'
  const chipActive = 'bg-amber-400 text-black'
  const chipInactive = 'bg-white/[0.09] text-jl-fg-2 hover:bg-white/[0.14]'

  const statusOpcoes: Array<{ value: StatusOC | ''; label: string }> = [
    { value: '', label: c.filtro_todos_status },
    { value: 'RASCUNHO', label: c.status_RASCUNHO },
    { value: 'CONFIRMADA', label: c.status_CONFIRMADA },
    { value: 'EM_TRANSITO', label: c.status_EM_TRANSITO },
    { value: 'RECEBIDA', label: c.status_RECEBIDA },
    { value: 'CANCELADA', label: c.status_CANCELADA },
  ]

  return (
    <>
      {/* KPIs */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="dragon-glass-card rounded-xl p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-jl-fg-3">{c.kpi_rascunho}</div>
          <div className="mt-1 text-xl font-bold leading-tight tabular-nums text-jl-fg-1">{kpisIniciais.total_rascunho}</div>
        </div>
        <div className="dragon-glass-card rounded-xl p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-jl-fg-3">{c.kpi_confirmadas}</div>
          <div className="mt-1 text-xl font-bold leading-tight tabular-nums text-blue-300">{kpisIniciais.total_confirmadas}</div>
        </div>
        <div className="dragon-glass-card rounded-xl p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-jl-fg-3">{c.kpi_em_transito}</div>
          <div className={cn('mt-1 text-xl font-bold leading-tight tabular-nums', kpisIniciais.total_em_transito > 0 ? 'text-amber-300' : 'text-jl-fg-1')}>
            {kpisIniciais.total_em_transito}
          </div>
        </div>
        <div className="dragon-glass-card rounded-xl p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-jl-fg-3">{c.kpi_valor_transito}</div>
          <div className={cn('mt-1 text-xl font-bold leading-tight tabular-nums', kpisIniciais.valor_em_transito > 0 ? 'text-amber-300' : 'text-jl-fg-1')}>
            {formatBRL(kpisIniciais.valor_em_transito)}
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <GerenteStickyToolbar className="mb-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Status chips */}
          <div className="flex flex-wrap gap-1.5">
            {statusOpcoes.map((op) => (
              <button
                key={op.value}
                type="button"
                onClick={() => setStatusFiltro(op.value)}
                className={cn(chipBase, statusFiltro === op.value ? chipActive : chipInactive)}
              >
                {op.label}
              </button>
            ))}
          </div>

          {/* Busca */}
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={c.busca_placeholder}
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

          <button
            type="button"
            onClick={abrirNova}
            className="app-btn-primary inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            {c.nova_oc}
          </button>
        </div>
      </GerenteStickyToolbar>

      {/* Tabela */}
      <GerenteTable
        tone="dragon"
        compact
        columns={[
          { key: 'id', header: c.col_id },
          { key: 'fornecedor', header: c.col_fornecedor, priority: 'primary' },
          { key: 'status', header: c.col_status },
          { key: 'emissao', header: c.col_emissao },
          { key: 'previsto', header: c.col_previsto, priority: 'contextual' },
          { key: 'itens', header: c.col_itens, numeric: true },
          { key: 'total', header: c.col_total, numeric: true },
        ]}
      >
        {dados.rows.map((row: OcListaDTO) => (
          <tr
            key={row.id}
            className="gerente-fin-row-hover cursor-pointer"
            onClick={() => setDetalheId(row.id)}
          >
            <td className="gerente-fin-cell px-3 py-2 font-mono text-xs text-jl-fg-3">{idCurto(row.id)}</td>
            <td className="gerente-fin-cell px-3 py-2 font-medium">{row.fornecedor_nome ?? '—'}</td>
            <td className="gerente-fin-cell px-3 py-2">
              <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', STATUS_CORES[row.status])}>
                {c[`status_${row.status}` as keyof typeof c]}
              </span>
            </td>
            <td className="gerente-fin-cell px-3 py-2 text-xs tabular-nums">{fmtData(row.data_emissao)}</td>
            <td className="gerente-fin-cell px-3 py-2 text-xs tabular-nums text-jl-fg-3">{fmtData(row.data_prevista_chegada)}</td>
            <td className="gerente-fin-cell px-3 py-2 text-right tabular-nums">{row.total_itens}</td>
            <td className="gerente-fin-cell px-3 py-2 text-right tabular-nums">{formatBRL(row.valor_total)}</td>
          </tr>
        ))}
        {dados.rows.length === 0 && !loading && (
          <tr>
            <td colSpan={7} className="gerente-fin-empty px-4 py-12 text-center">
              <div className="text-5xl text-amber-400/60" style={{ fontFamily: 'var(--font-serif-han)' }}>
                購
              </div>
              <div className="mt-3 text-sm font-semibold text-jl-fg-1">{c.vazio_titulo}</div>
              <div className="mt-1 text-xs text-jl-fg-3">{c.vazio_sub}</div>
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
            {c.pag_prev}
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
            {c.pag_next}
          </button>
        </div>
      )}

      {/* Modais */}
      {formAberto && (
        <OcFormModal
          idioma={idioma}
          ocInicial={ocParaEditar}
          fornecedores={fornecedores}
          produtos={produtos}
          onClose={fecharForm}
          onSaved={aoSalvar}
        />
      )}

      {detalheId && (
        <OcDetalheModal
          idioma={idioma}
          ocId={detalheId}
          onClose={() => setDetalheId(null)}
          onEditar={abrirEditar}
          onStatusChanged={aoAtualizarStatus}
        />
      )}
    </>
  )
}
