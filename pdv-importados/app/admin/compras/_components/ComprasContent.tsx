'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, FilterX } from 'lucide-react'
import { MetricCard, PageHeader, SectionCard } from '@/components/ui/admin-v2'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/forms'
import { ErrorState } from '@/components/ui/feedback'
import { emitGerenteToast } from '@/lib/gerente/toast'
import { getMessages } from '@/i18n/getMessages'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { cn } from '@/lib/utils'
import { formatBRL } from '@/lib/format/money'
import { fmtTemplate } from '@/i18n/fmtTemplate'
import { fmtQtd } from '@/app/gerente/compras/ocRecebimento'
import {
  listarOrdensCompra,
  type OcDetalheDTO,
  type OcKpisDTO,
  type OcListaDTO,
  type OcListaResult,
  type StatusOC,
} from '@/app/gerente/compras/actions'
import { OcFormModal } from '@/app/gerente/compras/OcFormModal'
import { OcDetalheModal } from '@/app/gerente/compras/OcDetalheModal'

const LIMITE_PAG = 20

type Props = Readonly<{
  idioma: Idioma
  kpisIniciais: OcKpisDTO
  inicial: OcListaResult
  fornecedores: Array<{ id: string; nome: string }>
  produtos: Array<{ id: string; nome: string; unidade_medida: string }>
  /** G-03 — deep-link "Nova OC" a partir de um fornecedor específico. */
  fornecedorPreSelecionado?: string | null
}>

const STATUS_CORES: Record<StatusOC, string> = {
  RASCUNHO: 'bg-[var(--color-surface-soft)] text-fg-muted',
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

function statusLabel(c: ReturnType<typeof getMessages>['compras'], status: StatusOC): string {
  const key = `status_${status}` as keyof typeof c
  const v = c[key]
  return typeof v === 'string' ? v : status
}

export function ComprasContent({
  idioma,
  kpisIniciais,
  inicial,
  fornecedores,
  produtos,
  fornecedorPreSelecionado = null,
}: Props) {
  const m = getMessages(idioma)
  const c = m.compras
  const router = useRouter()

  const [statusFiltro, setStatusFiltro] = useState<StatusOC | ''>('')
  const [busca, setBusca] = useState('')
  const [pagina, setPagina] = useState(0)
  const [dados, setDados] = useState<OcListaResult>(inicial)
  const [loading, setLoading] = useState(false)

  // G-03: deep-link a partir de um fornecedor específico já abre "Nova OC"
  // com ele pré-selecionado — 1 clique da tela de Fornecedores até aqui.
  const [formAberto, setFormAberto] = useState(() => Boolean(fornecedorPreSelecionado))
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
        emitGerenteToast({ kind: 'error', message: m.comum.erro })
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

  /**
   * O modal decide se fecha (mudança de status fecha; recebimento parcial mantém aberto para o
   * operador ver o novo saldo). Aqui só atualiza a lista e os KPIs (valor em trânsito).
   */
  function aoAtualizarStatus() {
    void carregar(pagina)
    router.refresh()
  }

  const chipBase =
    'rounded-full px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]'
  const chipActive = 'bg-[var(--color-brand)] text-[var(--color-brand-fg)]'
  const chipInactive =
    'border border-[var(--color-border)] bg-[var(--color-surface-soft)] text-fg-muted hover:bg-[var(--color-surface)]'

  const statusOpcoes: Array<{ value: StatusOC | ''; label: string }> = [
    { value: '', label: c.filtro_todos_status },
    { value: 'RASCUNHO', label: c.status_RASCUNHO },
    { value: 'CONFIRMADA', label: c.status_CONFIRMADA },
    { value: 'EM_TRANSITO', label: c.status_EM_TRANSITO },
    { value: 'RECEBIDA', label: c.status_RECEBIDA },
    { value: 'CANCELADA', label: c.status_CANCELADA },
  ]

  const columns: Column<OcListaDTO>[] = useMemo(
    () => [
      {
        key: 'id',
        header: c.col_id,
        cell: (row) => (
          <span className="font-mono text-caption text-fg-muted">{idCurto(row.id)}</span>
        ),
      },
      {
        key: 'fornecedor',
        header: c.col_fornecedor,
        priority: 'primary',
        cell: (row) => <span className="font-medium">{row.fornecedor_nome ?? '—'}</span>,
      },
      {
        key: 'status',
        header: c.col_status,
        cell: (row) => (
          <span className={cn('rounded-full px-2 py-0.5 text-caption font-medium', STATUS_CORES[row.status])}>
            {statusLabel(c, row.status)}
          </span>
        ),
      },
      {
        key: 'emissao',
        header: c.col_emissao,
        cell: (row) => <span className="tabular-nums text-caption">{fmtData(row.data_emissao)}</span>,
      },
      {
        key: 'previsto',
        header: c.col_previsto,
        priority: 'contextual',
        cell: (row) => (
          <span className="tabular-nums text-caption text-fg-muted">{fmtData(row.data_prevista_chegada)}</span>
        ),
      },
      {
        key: 'itens',
        header: c.col_itens,
        align: 'right',
        cell: (row) => <span className="tabular-nums">{row.total_itens}</span>,
      },
      {
        key: 'recebimento',
        header: c.col_recebimento,
        align: 'right',
        cell: (row) =>
          row.status === 'RASCUNHO' || row.status === 'CANCELADA' ? (
            <span className="text-caption text-fg-muted">—</span>
          ) : (
            <span className="tabular-nums" data-testid={`oc-recebimento-${row.id}`}>
              <span className="text-caption">
                {fmtQtd(row.recebido_total)} / {fmtQtd(row.pedido_total)}
              </span>
              {row.status === 'EM_TRANSITO' && row.recebido_total > 0 && row.pendente_total > 0 ? (
                <span className="block text-caption text-amber-300">
                  {fmtTemplate(c.resumo_faltam, { n: fmtQtd(row.pendente_total) })}
                </span>
              ) : null}
              {row.encerrada_com_falta ? (
                <span className="block text-caption text-fg-muted">{c.situacao_ENCERRADO_COM_FALTA}</span>
              ) : null}
            </span>
          ),
      },
      {
        key: 'total',
        header: c.col_total,
        align: 'right',
        cell: (row) => <span className="tabular-nums">{formatBRL(row.valor_total)}</span>,
      },
    ],
    [c],
  )

  const emptyState = (
    <div className="py-12 text-center">
      <div className="text-5xl text-[var(--color-brand)]/60" style={{ fontFamily: 'var(--font-serif-han)' }}>
        購
      </div>
      <div className="mt-3 text-body font-semibold">{c.vazio_titulo}</div>
      <div className="mt-1 text-caption text-fg-muted">{c.vazio_sub}</div>
    </div>
  )

  return (
    <>
      <PageHeader title={c.titulo} subtitle={c.subtitulo} />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label={c.kpi_rascunho} value={String(kpisIniciais.total_rascunho)} icon="list-filter" tone="gold" />
        <MetricCard
          label={c.kpi_confirmadas}
          value={String(kpisIniciais.total_confirmadas)}
          icon="file-check-2"
          tone="success"
        />
        <MetricCard
          label={c.kpi_em_transito}
          value={String(kpisIniciais.total_em_transito)}
          icon="package"
          tone={kpisIniciais.total_em_transito > 0 ? 'warning' : 'gold'}
        />
        <MetricCard
          label={c.kpi_valor_transito}
          value={formatBRL(kpisIniciais.valor_em_transito)}
          hint={c.kpi_valor_transito_hint}
          icon="dollar-sign"
          tone={kpisIniciais.valor_em_transito > 0 ? 'warning' : 'gold'}
        />
      </div>

      <SectionCard className="mb-4">
        <div className="flex flex-wrap items-center gap-3">
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

          <Input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={c.busca_placeholder}
            className="h-9 w-48 text-body sm:w-56"
          />

          <button
            type="button"
            onClick={limparFiltros}
            className="inline-flex items-center gap-1 text-caption text-fg-muted hover:text-fg"
          >
            <FilterX className="h-3 w-3" aria-hidden />
            {m.comum.limpar_filtros}
          </button>

          <div className="flex-1" />

          <Button type="button" variant="primary" size="sm" onClick={abrirNova}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            {c.nova_oc}
          </Button>
        </div>
      </SectionCard>

      {dados.erro ? (
        <ErrorState
          dense
          description={c.erro_carregar_lista}
          retryLabel={c.tentar_novamente}
          onRetry={() => void carregar(pagina)}
          className="mb-4 items-start text-left"
        />
      ) : null}

      <DataTable
        columns={columns}
        data={dados.rows}
        rowKey={(row) => row.id}
        onRowClick={(row) => setDetalheId(row.id)}
        loading={loading}
        compact
        emptyState={emptyState}
      />

      {totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-center gap-3">
          <Button type="button" variant="outline" size="sm" disabled={pagina === 0} onClick={() => mudarPagina(pagina - 1)}>
            {c.pag_prev}
          </Button>
          <span className="text-caption text-fg-muted">
            {pagina + 1} / {totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pagina >= totalPages - 1}
            onClick={() => mudarPagina(pagina + 1)}
          >
            {c.pag_next}
          </Button>
        </div>
      ) : null}

      {formAberto ? (
        <OcFormModal
          idioma={idioma}
          ocInicial={ocParaEditar}
          fornecedores={fornecedores}
          produtos={produtos}
          onClose={fecharForm}
          onSaved={aoSalvar}
          fornecedorPreSelecionado={ocParaEditar ? null : fornecedorPreSelecionado}
        />
      ) : null}

      {detalheId ? (
        <OcDetalheModal
          idioma={idioma}
          ocId={detalheId}
          onClose={() => setDetalheId(null)}
          onEditar={abrirEditar}
          onStatusChanged={aoAtualizarStatus}
        />
      ) : null}
    </>
  )
}
