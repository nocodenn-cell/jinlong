'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDebounce } from '@/lib/hooks/useDebounce'
import { DollarSign, FileText, Plus, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DragonModal } from '@/components/ui/DragonModal'
import { ExportAction } from '@/components/ui/ExportAction'
import { EntityTable, type EntityColumn } from '@/components/ui/EntityTable'
import { EmptyState } from '@/components/ui/feedback'
import { MetricCard, PageActions, SectionCard } from '@/components/ui/admin-v2'
import { PaginationBar } from '@/components/ui/PaginationBar'
import { Field, Input, Select } from '@/components/ui/forms'
import { emitToast } from '@/lib/gerente/toast'
import { downloadCsvBrowser } from '@/lib/gerente/gerenteCadastroUi'
import { fmtGerenteBRL, fmtGerenteDateTime } from '@/lib/format/gerenteValues'
import { getMessages } from '@/i18n/getMessages'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { cn } from '@/lib/utils'
import {
  buscarContasPagarAction,
  cancelarContaPagarAction,
  exportarContasPagarParaCSVAction,
  type ContaPagarRow,
  type ContasPagarFilters,
} from './actions'
import { PagamentoModal } from './PagamentoModal'
import { ROUTES } from '@shared-core/navigation/routes'

type Props = Readonly<{
  idioma: Idioma
  locale: string
  contasIniciais: ContaPagarRow[]
  hasMoreInicial: boolean
  fornecedoresOpts: Array<{ id: string; nome: string }>
  statusInicial: string
  periodoInicial: string
  /** Quando true, omite título próprio (já está no hub Financeiro). */
  embedded?: boolean
}>

const STATUS_LIST = ['todos', 'pendente', 'parcial', 'atrasado', 'pago', 'cancelado'] as const

function fmtDate(iso: string | null, locale: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function relativoVenc(iso: string | null, locale: string): string {
  if (!iso) return ''
  const ms = new Date(iso).getTime() - Date.now()
  const dias = Math.round(ms / 86400000)
  if (dias === 0) return 'hoje'
  if (dias === 1) return 'amanhã'
  if (dias === -1) return 'ontem'
  return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(dias, 'day')
}

export function ContasPagarListClient({
  idioma,
  locale,
  contasIniciais,
  hasMoreInicial,
  fornecedoresOpts,
  statusInicial,
  periodoInicial,
  embedded = false,
}: Props) {
  const m = getMessages(idioma)
  const [contas, setContas] = useState<ContaPagarRow[]>(contasIniciais)
  const [hasMore, setHasMore] = useState(hasMoreInicial)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)

  const [termo, setTermo] = useState('')
  const [status, setStatus] = useState<string>(statusInicial)
  const [fornecedorId, setFornecedorId] = useState('')
  const [periodo, setPeriodo] = useState(periodoInicial)

  const [emPagamento, setEmPagamento] = useState<ContaPagarRow | null>(null)
  const [cancelando, setCancelando] = useState<ContaPagarRow | null>(null)
  const [motivoCancel, setMotivoCancel] = useState('')
  const [cancelPending, setCancelPending] = useState(false)

  const pageRef = useRef(1)
  const stateRef = useRef({ hasMore, loading })
  useEffect(() => {
    stateRef.current = { hasMore, loading }
  })

  const filters: ContasPagarFilters = useMemo(
    () => ({
      status,
      fornecedor_id: fornecedorId || undefined,
      periodo: periodo || undefined,
      termo: termo || undefined,
    }),
    [status, fornecedorId, periodo, termo],
  )

  const filtersDebounced = useDebounce(filters, 280)

  const carregarProxima = useCallback(async () => {
    if (stateRef.current.loading || !stateRef.current.hasMore) return
    setLoading(true)
    const prox = pageRef.current + 1
    try {
      const r = await buscarContasPagarAction(prox, filtersDebounced)
      if (!r.ok) {
        emitToast({ kind: 'error', message: r.error })
        return
      }
      pageRef.current = prox
      setContas((cur) => [...cur, ...r.contas])
      setHasMore(r.hasMore)
    } finally {
      setLoading(false)
    }
  }, [filtersDebounced])

  const skipMountRefetch = useRef(true)

  useEffect(() => {
    if (skipMountRefetch.current) {
      skipMountRefetch.current = false
      return
    }
    let cancelled = false
    setLoading(true)
    pageRef.current = 1
    void buscarContasPagarAction(1, filtersDebounced).then((r) => {
      if (cancelled) return
      if (!r.ok) {
        emitToast({ kind: 'error', message: r.error })
        setLoading(false)
        return
      }
      setContas(r.contas)
      setHasMore(r.hasMore)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [filtersDebounced])

  function aplicarPagamentoLocal(c: ContaPagarRow) {
    setContas((cur) => cur.map((x) => (x.id === c.id ? c : x)))
  }

  async function confirmarCancelamento() {
    if (!cancelando) return
    const motivo = motivoCancel.trim()
    if (motivo.length < 2) {
      emitToast({ kind: 'error', message: 'Motivo deve ter ao menos 2 caracteres.' })
      return
    }
    setCancelPending(true)
    try {
      const r = await cancelarContaPagarAction(cancelando.id, motivo)
      if (!r.ok) {
        emitToast({ kind: 'error', message: r.error })
        return
      }
      setContas((cur) =>
        cur.map((x) => (x.id === cancelando.id ? { ...x, status: 'CANCELADO' } : x)),
      )
      emitToast({ kind: 'success', message: m.contas_pagar.toast_cancelada })
      setCancelando(null)
    } finally {
      setCancelPending(false)
    }
  }

  async function onExportar() {
    setExporting(true)
    try {
      const r = await exportarContasPagarParaCSVAction(filters)
      if (!r.ok) {
        emitToast({ kind: 'error', message: r.error })
        return
      }
      downloadCsvBrowser(
        `gerente-contas-pagar.csv`,
        [
          { key: 'fornecedor', header: m.contas_pagar.col_fornecedor },
          { key: 'descricao', header: m.contas_pagar.col_descricao },
          { key: 'vencimento', header: m.contas_pagar.col_vencimento },
          { key: 'valor_total', header: m.contas_pagar.col_valor },
          { key: 'valor_pago', header: m.contas_pagar.col_valor_pago },
          { key: 'em_aberto', header: m.contas_pagar.col_em_aberto },
          { key: 'status', header: m.contas_pagar.col_status },
          { key: 'nfe', header: m.contas_pagar.col_nfe },
        ],
        r.rows.map((c) => ({
          fornecedor: c.fornecedor_nome ?? '—',
          descricao: c.descricao,
          vencimento: c.vencimento ? new Date(c.vencimento).toISOString().slice(0, 10) : '',
          valor_total: c.valor_total,
          valor_pago: c.valor_pago,
          em_aberto: Number((c.valor_total - c.valor_pago).toFixed(2)),
          status: c.status,
          nfe: c.nfe_numero ?? '',
        })),
      )
    } finally {
      setExporting(false)
    }
  }

  const kpis = useMemo(() => {
    let totalAbertos = 0
    let qtdAbertos = 0
    let totalAtrasados = 0
    let qtdAtrasados = 0
    for (const c of contas) {
      const aberto = c.valor_total - c.valor_pago
      if (c.status === 'PENDENTE' || c.status === 'PARCIAL') {
        totalAbertos += aberto
        qtdAbertos++
      }
      if (c.status === 'ATRASADO') {
        totalAtrasados += aberto
        qtdAtrasados++
      }
    }
    return { totalAbertos, qtdAbertos, totalAtrasados, qtdAtrasados }
  }, [contas])

  const columns: EntityColumn<ContaPagarRow>[] = useMemo(
    () => [
      {
        key: 'fornecedor',
        header: m.contas_pagar.col_fornecedor,
        cell: (c) => (
          <strong className="text-body text-fg">{c.fornecedor_nome ?? '—'}</strong>
        ),
      },
      {
        key: 'descricao',
        header: m.contas_pagar.col_descricao,
        cell: (c) => (
          <div>
            <div className="font-medium text-fg">{c.descricao}</div>
            <div className="mt-0.5 text-caption text-fg-subtle">
              {m.contas_pagar.lancado_em} {fmtGerenteDateTime(c.criado_em, locale)}
            </div>
            {c.nfe_numero ? (
              <Link
                href={
                  c.nfe_importacao_id
                    ? `${ROUTES.admin.importNfe}?id=${c.nfe_importacao_id}`
                    : '#'
                }
                onClick={(e) => {
                  if (!c.nfe_importacao_id) e.preventDefault()
                }}
                className="mt-1 inline-flex items-center gap-1 font-mono text-caption text-[var(--color-warning-strong)] hover:underline"
              >
                <FileText className="h-3 w-3" aria-hidden />
                NF-e #{c.nfe_numero}
              </Link>
            ) : null}
          </div>
        ),
      },
      {
        key: 'venc',
        header: m.contas_pagar.col_vencimento,
        cell: (c) => {
          const podePagar = c.status !== 'PAGO' && c.status !== 'CANCELADO'
          const ms = c.vencimento ? new Date(c.vencimento).getTime() - Date.now() : 0
          const dias = Math.round(ms / 86400000)
          const vencCls = !podePagar
            ? ''
            : dias < 0
              ? 'font-semibold text-[var(--color-danger-strong)]'
              : dias <= 7
                ? 'text-[var(--color-warning)]'
                : 'text-fg-muted'
          return (
            <div className={cn('tabular-nums', vencCls)}>
              {fmtDate(c.vencimento, locale)}
              {podePagar ? (
                <div className="mt-0.5 text-[10px] uppercase tracking-wide opacity-85">
                  {relativoVenc(c.vencimento, locale)}
                </div>
              ) : null}
            </div>
          )
        },
      },
      {
        key: 'valor',
        header: m.contas_pagar.col_valor,
        align: 'right',
        cell: (c) => {
          const aberto = c.valor_total - c.valor_pago
          const pct = c.valor_total > 0 ? (c.valor_pago / c.valor_total) * 100 : 0
          return (
            <div>
              <div className="text-right text-body font-bold tabular-nums text-fg">
                {fmtGerenteBRL(c.valor_total, locale)}
              </div>
              {c.valor_pago > 0 && c.status !== 'CANCELADO' ? (
                <>
                  <div className="mt-0.5 text-right text-caption tabular-nums text-fg-subtle">
                    {m.contas_pagar.pago_label} {fmtGerenteBRL(c.valor_pago, locale)}
                    {aberto > 0.001 ? (
                      <>
                        {' · '}
                        {m.contas_pagar.aberto_label}{' '}
                        <strong className="text-[var(--color-warning-strong)]">
                          {fmtGerenteBRL(aberto, locale)}
                        </strong>
                      </>
                    ) : null}
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-[var(--color-surface-soft)]">
                    <div
                      className={cn(
                        'h-full transition-[width]',
                        c.status === 'PARCIAL' ? 'bg-amber-500' : 'bg-emerald-600',
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </>
              ) : null}
            </div>
          )
        },
      },
      {
        key: 'status',
        header: m.contas_pagar.col_status,
        align: 'center',
        status: (c) => ({
          status: c.status,
          label:
            (m.contas_pagar[
              `status_${c.status.toLowerCase()}` as keyof typeof m.contas_pagar
            ] as string) ?? c.status,
        }),
      },
    ],
    [locale, m],
  )

  return (
    <>
      <div className="admin-v2-grid-kpi">
        <MetricCard
          label={m.contas_pagar.kpi_em_aberto}
          value={fmtGerenteBRL(kpis.totalAbertos, locale)}
          icon="wallet-cards"
          tone="warning"
          hint={`${kpis.qtdAbertos} ${kpis.qtdAbertos === 1 ? m.contas_pagar.conta_sg : m.contas_pagar.conta_pl}`}
        />
        <MetricCard
          label={m.contas_pagar.kpi_atrasadas}
          value={fmtGerenteBRL(kpis.totalAtrasados, locale)}
          icon="x-circle"
          tone="danger"
          hint={`${kpis.qtdAtrasados} ${m.contas_pagar.atrasadas}`}
        />
        <MetricCard
          label={m.contas_pagar.kpi_filtrado}
          value={String(contas.length)}
          icon="list-filter"
          tone="gold"
          hint={m.contas_pagar.contas_carregadas}
        />
        <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <p className="text-caption font-semibold uppercase tracking-wide text-fg-subtle">
            {m.contas_pagar.acoes_rapidas}
          </p>
          <PageActions className="mt-2">
            <Button type="button" variant="primary" size="sm" className="gap-1.5" asChild>
              <Link href={ROUTES.admin.importNfe}>
                <Plus className="h-4 w-4" aria-hidden />
                {m.contas_pagar.lancar}
              </Link>
            </Button>
          </PageActions>
          <p className="mt-2 text-caption leading-snug text-fg-subtle">{m.contas_pagar.origem_nfe_hint}</p>
        </div>
      </div>

      <SectionCard
        title={embedded ? m.contas_pagar.titulo : undefined}
        action={
          <ExportAction
            format="csv"
            label={exporting ? m.comum.carregando : m.gerente.exportar_csv}
            loading={exporting}
            disabled={exporting || contas.length === 0}
            onExport={() => void onExportar()}
          />
        }
      >
        <div className="mb-3 flex w-full flex-col gap-2.5 border-b border-[var(--color-border-secondary)] pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="search"
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
              placeholder={m.contas_pagar.placeholder_busca}
              aria-label={m.contas_pagar.placeholder_busca}
              className="min-w-[14rem] flex-1"
            />
            <Input
              type="month"
              value={periodo}
              onChange={(e) => setPeriodo(e.target.value)}
              aria-label={m.contas_pagar.filtro_periodo}
              className="w-auto"
            />
            <Select
              value={fornecedorId}
              onChange={(e) => setFornecedorId(e.target.value)}
              aria-label={m.contas_pagar.filtro_fornecedor}
              className="min-w-[11rem]"
            >
              <option value="">{m.contas_pagar.todos_fornecedores}</option>
              {fornecedoresOpts.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {STATUS_LIST.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-caption font-medium transition-colors',
                  status === s
                    ? 'border-brand bg-[var(--color-info-bg)] text-brand'
                    : 'border-[var(--color-border)] text-fg-muted hover:text-fg',
                )}
              >
                {m.contas_pagar[`status_${s}` as keyof typeof m.contas_pagar] as string}
              </button>
            ))}
          </div>
        </div>

        <EntityTable
          data={contas}
          columns={columns}
          rowKey={(c) => c.id}
          loading={loading && contas.length === 0}
          emptyState={
            <EmptyState title={m.contas_pagar.vazio_titulo} description={m.contas_pagar.vazio_sub} />
          }
          rowActions={(c) => {
            const podePagar = c.status !== 'PAGO' && c.status !== 'CANCELADO'
            if (!podePagar) return null
            return (
              <div className="flex items-center justify-end gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="primary"
                  className="gap-1"
                  onClick={() => setEmPagamento(c)}
                  aria-label={`${m.contas_pagar.registrar_pagamento} — ${c.descricao}`}
                >
                  <DollarSign className="h-3 w-3" aria-hidden />
                  {m.contas_pagar.btn_pagar}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setMotivoCancel('')
                    setCancelando(c)
                  }}
                  aria-label={`${m.contas_pagar.cancelar} — ${c.descricao}`}
                  title={m.contas_pagar.cancelar}
                >
                  <XCircle className="h-3.5 w-3.5 text-[var(--color-danger-strong)]" aria-hidden />
                </Button>
              </div>
            )
          }}
        />

        <PaginationBar
          className="mt-3"
          mode="infinite"
          hasMore={hasMore}
          onLoadMore={() => void carregarProxima()}
          loadMoreLabel={loading ? m.comum.carregando : 'Carregar mais'}
        />
      </SectionCard>

      {emPagamento ? (
        <PagamentoModal
          key={emPagamento.id}
          idioma={idioma}
          locale={locale}
          conta={emPagamento}
          onClose={() => setEmPagamento(null)}
          onPagamentoRegistrado={(c) => {
            aplicarPagamentoLocal(c)
            setEmPagamento(null)
          }}
        />
      ) : null}

      <DragonModal
        open={cancelando != null}
        onClose={() => {
          if (!cancelPending) setCancelando(null)
        }}
        dismissable={!cancelPending}
        title="Cancelar conta"
        size="sm"
        variant="danger"
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              disabled={cancelPending}
              onClick={() => setCancelando(null)}
            >
              {m.comum.cancelar}
            </Button>
            <Button
              type="button"
              variant="danger"
              loading={cancelPending}
              onClick={() => void confirmarCancelamento()}
            >
              Confirmar
            </Button>
          </>
        }
      >
        <Field
          id="motivo-cancel-ap"
          label={`Motivo do cancelamento de "${cancelando?.descricao ?? ''}"`}
          required
        >
          <Input
            id="motivo-cancel-ap"
            value={motivoCancel}
            onChange={(e) => setMotivoCancel(e.target.value)}
            autoFocus
            disabled={cancelPending}
          />
        </Field>
      </DragonModal>
    </>
  )
}
