'use client'

/**
 * Compras — Admin V2 (Sprint 3 / RFC-UX-011).
 * Lista OC: PageShell + MetricCard + EntityTable (zero dragon-glass).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EntityTable, type EntityColumn } from '@/components/ui/EntityTable'
import { EmptyState } from '@/components/ui/feedback'
import { MetricCard, PageActions, PageShell, SectionCard } from '@/components/ui/admin-v2'
import { Input } from '@/components/ui/forms'
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

function fmtData(d: string | null): string {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR')
}

function idCurto(id: string): string {
  return id.slice(0, 8).toUpperCase()
}

export function ComprasGerentePageClient({
  idioma,
  kpisIniciais,
  inicial,
  fornecedores,
  produtos,
}: Props) {
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

  const statusOpcoes: Array<{ value: StatusOC | ''; label: string }> = [
    { value: '', label: c.filtro_todos_status },
    { value: 'RASCUNHO', label: c.status_RASCUNHO },
    { value: 'CONFIRMADA', label: c.status_CONFIRMADA },
    { value: 'EM_TRANSITO', label: c.status_EM_TRANSITO },
    { value: 'RECEBIDA', label: c.status_RECEBIDA },
    { value: 'CANCELADA', label: c.status_CANCELADA },
  ]

  const columns: EntityColumn<OcListaDTO>[] = useMemo(
    () => [
      {
        key: 'id',
        header: c.col_id,
        cell: (row) => (
          <span className="font-mono text-caption text-fg-subtle">{idCurto(row.id)}</span>
        ),
      },
      {
        key: 'fornecedor',
        header: c.col_fornecedor,
        cell: (row) => <span className="font-medium text-fg">{row.fornecedor_nome ?? '—'}</span>,
      },
      {
        key: 'status',
        header: c.col_status,
        status: (row) => ({
          status: row.status,
          label: String(c[`status_${row.status}` as keyof typeof c] ?? row.status),
        }),
      },
      {
        key: 'emissao',
        header: c.col_emissao,
        cell: (row) => (
          <span className="tabular-nums text-caption">{fmtData(row.data_emissao)}</span>
        ),
      },
      {
        key: 'previsto',
        header: c.col_previsto,
        cell: (row) => (
          <span className="tabular-nums text-caption text-fg-subtle">
            {fmtData(row.data_prevista_chegada)}
          </span>
        ),
      },
      {
        key: 'itens',
        header: c.col_itens,
        align: 'right',
        cell: (row) => <span className="tabular-nums">{row.total_itens}</span>,
      },
      {
        key: 'total',
        header: c.col_total,
        money: (row) => row.valor_total,
      },
    ],
    [c],
  )

  return (
    <PageShell
      title={c.titulo}
      subtitle={c.subtitulo}
      actions={
        <PageActions>
          <Button type="button" variant="primary" size="sm" className="gap-1.5" onClick={abrirNova}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            {c.nova_oc}
          </Button>
        </PageActions>
      }
      kpi={
        <>
          <MetricCard
            label={c.kpi_rascunho}
            value={String(kpisIniciais.total_rascunho)}
            icon="list-filter"
            tone="gold"
          />
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
            icon="dollar-sign"
            tone={kpisIniciais.valor_em_transito > 0 ? 'warning' : 'gold'}
          />
        </>
      }
    >
      <SectionCard title={c.titulo}>
        <div className="mb-3 flex w-full flex-col gap-2.5 border-b border-[var(--color-border-secondary)] pb-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {statusOpcoes.map((op) => (
              <button
                key={op.value || 'all'}
                type="button"
                onClick={() => setStatusFiltro(op.value)}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-caption font-medium transition-colors',
                  statusFiltro === op.value
                    ? 'border-brand bg-[var(--color-info-bg)] text-brand'
                    : 'border-[var(--color-border)] text-fg-muted hover:text-fg',
                )}
              >
                {op.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder={c.busca_placeholder}
              aria-label={c.busca_placeholder}
              className="min-w-[14rem] flex-1"
            />
            {(statusFiltro || busca) && (
              <Button type="button" variant="ghost" size="sm" onClick={limparFiltros}>
                {m.comum.limpar_filtros}
              </Button>
            )}
          </div>
        </div>

        <EntityTable
          data={dados.rows}
          columns={columns}
          rowKey={(r) => r.id}
          loading={loading && dados.rows.length === 0}
          onRowClick={(row) => setDetalheId(row.id)}
          emptyState={<EmptyState title={c.vazio_titulo} description={c.vazio_sub} />}
        />

        {totalPages > 1 ? (
          <div className="mt-4 flex items-center justify-center gap-3">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={pagina === 0 || loading}
              onClick={() => {
                const next = pagina - 1
                setPagina(next)
                void carregar(next)
              }}
            >
              {c.pag_prev}
            </Button>
            <span className="text-caption text-fg-subtle">
              {pagina + 1} / {totalPages}
            </span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={pagina >= totalPages - 1 || loading}
              onClick={() => {
                const next = pagina + 1
                setPagina(next)
                void carregar(next)
              }}
            >
              {c.pag_next}
            </Button>
          </div>
        ) : null}
      </SectionCard>

      {formAberto ? (
        <OcFormModal
          idioma={idioma}
          ocInicial={ocParaEditar}
          fornecedores={fornecedores}
          produtos={produtos}
          onClose={fecharForm}
          onSaved={aoSalvar}
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
    </PageShell>
  )
}
