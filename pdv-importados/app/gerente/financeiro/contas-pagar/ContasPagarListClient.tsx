'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDebounce } from '@/lib/hooks/useDebounce'
import { Download, Plus, FileText, XCircle, DollarSign, FilterX } from 'lucide-react'
import { CrudListShell, MetricCard, PageActions } from '@/components/ui/admin-v2'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { DragonModal } from '@/components/ui/DragonModal'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input, SearchInput, Select } from '@/components/ui/forms'
import { emitGerenteToast } from '@/lib/gerente/toast'
import { downloadCsvBrowser } from '@/lib/gerente/gerenteCadastroUi'
import { fmtGerenteBRL, fmtGerenteDateTime } from '@/lib/format/gerenteValues'
import { getMessages } from '@/i18n/getMessages'
import type { Idioma } from '@/idioma/normalizeIdioma'
import { cn } from '@/lib/utils'
import {
  RELATORIO_TZ_PADRAO,
  diasAteVencimento,
  formatarDataCivilNumerica,
  ymdEmFuso,
} from '@/lib/relatorios/periodoRelatorio'
import {
  buscarContasPagarAction,
  cancelarContaPagarAction,
  exportarContasPagarParaCSVAction,
  type ContaPagarRow,
  type ContasPagarFilters,
} from './actions'
import { PagamentoModal } from './PagamentoModal'
import { ROUTES, adminImportNfeImportacaoQuery } from '@/lib/navigation/routes'

type Props = Readonly<{
  idioma: Idioma
  locale: string
  contasIniciais: ContaPagarRow[]
  hasMoreInicial: boolean
  fornecedoresOpts: Array<{ id: string; nome: string }>
  statusInicial: string
  periodoInicial: string
  /** Fornecedor já filtrado ao abrir (deep-link `?fornecedor_id=`). */
  fornecedorInicial?: string
  /** Loja do ator autenticado — `registrar_pagamento_contas_pagar` rejeita pagamento cross-loja para todos os perfis. */
  actorLojaId?: string | null
}>

const STATUS_LIST = ['todos', 'pendente', 'parcial', 'atrasado', 'pago', 'cancelado'] as const

const STATUS_BADGE_CLS: Record<string, string> = {
  PAGO: 'border border-[var(--color-success-border)] bg-[var(--color-success-bg)] text-[var(--color-success-strong)]',
  PARCIAL: 'border border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] text-[var(--color-warning-strong)]',
  ATRASADO: 'border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-[var(--color-danger-strong)]',
  CANCELADO: 'border border-[var(--color-border)] bg-[var(--color-surface-muted)] text-fg-subtle line-through',
  PENDENTE: 'border border-[var(--color-border)] bg-[var(--color-surface-soft)] text-fg-muted',
}

// `vencimento` é data CIVIL (coluna `date`): sem fuso e sem hora. `new Date('2026-09-05')` seria meia-noite UTC
// e em Brasília apareceria como 04/09 — por isso formatação e diferença de dias usam o dia civil.
function fmtDate(iso: string | null, locale: string): string {
  return formatarDataCivilNumerica(iso, locale)
}

function diasParaVencer(iso: string): number {
  return diasAteVencimento(iso, ymdEmFuso(new Date(), RELATORIO_TZ_PADRAO))
}

function relativoVenc(iso: string | null, locale: string): string {
  if (!iso) return ''
  const dias = diasParaVencer(iso)
  if (dias === 0) return 'hoje'
  if (dias === 1) return 'amanhã'
  if (dias === -1) return 'ontem'
  return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(dias, 'day')
}

function statusBadgeClass(s: string): string {
  return STATUS_BADGE_CLS[s.toUpperCase()] ?? STATUS_BADGE_CLS.PENDENTE
}

function vencimentoTone(c: ContaPagarRow): string {
  const podePagar = c.status !== 'PAGO' && c.status !== 'CANCELADO'
  if (!podePagar || !c.vencimento) return 'text-fg'
  const dias = diasParaVencer(c.vencimento)
  if (dias < 0) return 'text-[var(--color-danger-strong)] font-semibold'
  if (dias <= 7) return 'text-[var(--color-warning)]'
  return 'text-fg-muted'
}

export function ContasPagarListClient({
  idioma,
  locale,
  contasIniciais,
  hasMoreInicial,
  fornecedoresOpts,
  statusInicial,
  periodoInicial,
  fornecedorInicial = '',
  actorLojaId = null,
}: Props) {
  const m = getMessages(idioma)
  const [contas, setContas] = useState<ContaPagarRow[]>(contasIniciais)
  const [hasMore, setHasMore] = useState(hasMoreInicial)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)

  const [termo, setTermo] = useState('')
  const [status, setStatus] = useState<string>(statusInicial)
  const [fornecedorId, setFornecedorId] = useState(fornecedorInicial)
  const [periodo, setPeriodo] = useState(periodoInicial)

  const [emPagamento, setEmPagamento] = useState<ContaPagarRow | null>(null)

  // G-10: modal do app em vez de window.prompt() nativo pro motivo de cancelamento.
  const [cancelandoAlvo, setCancelandoAlvo] = useState<ContaPagarRow | null>(null)
  const [motivoCancelamento, setMotivoCancelamento] = useState('')
  const [erroMotivoCancelamento, setErroMotivoCancelamento] = useState<string | null>(null)
  const [cancelando, setCancelando] = useState(false)

  const pageRef = useRef(1)
  const sentinelRef = useRef<HTMLDivElement>(null)

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
        emitGerenteToast({ kind: 'error', message: r.error })
        return
      }
      pageRef.current = prox
      setContas((cur) => [...cur, ...r.contas])
      setHasMore(r.hasMore)
    } finally {
      setLoading(false)
    }
  }, [filtersDebounced])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void carregarProxima()
      },
      { rootMargin: '300px' },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [carregarProxima])

  const skipMountRefetch = useRef(true)

  useEffect(() => {
    if (skipMountRefetch.current) {
      skipMountRefetch.current = false
      return
    }
    let cancelled = false
    setLoading(true)
    pageRef.current = 1
    buscarContasPagarAction(1, filtersDebounced).then((r) => {
      if (cancelled) return
      if (!r.ok) {
        emitGerenteToast({ kind: 'error', message: r.error })
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

  function abrirCancelar(c: ContaPagarRow) {
    setCancelandoAlvo(c)
    setMotivoCancelamento('')
    setErroMotivoCancelamento(null)
  }

  async function confirmarCancelamento() {
    if (!cancelandoAlvo) return
    const motivo = motivoCancelamento.trim()
    if (motivo.length < 2) {
      setErroMotivoCancelamento('Motivo deve ter ao menos 2 caracteres.')
      return
    }
    setCancelando(true)
    try {
      const r = await cancelarContaPagarAction(cancelandoAlvo.id, motivo)
      if (!r.ok) {
        emitGerenteToast({ kind: 'error', message: r.error })
        return
      }
      setContas((cur) =>
        cur.map((x) => (x.id === cancelandoAlvo.id ? { ...x, status: 'CANCELADO' } : x)),
      )
      emitGerenteToast({ kind: 'success', message: m.contas_pagar.toast_cancelada })
      setCancelandoAlvo(null)
    } finally {
      setCancelando(false)
    }
  }

  async function onExportar() {
    setExporting(true)
    try {
      const r = await exportarContasPagarParaCSVAction(filters)
      if (!r.ok) {
        emitGerenteToast({ kind: 'error', message: r.error })
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
          vencimento: c.vencimento ? c.vencimento.slice(0, 10) : '',
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

  function limparFiltros() {
    setTermo('')
    setStatus('todos')
    setFornecedorId('')
    setPeriodo('')
  }

  const kpis = useMemo(() => {
    let totalAbertos = 0,
      qtdAbertos = 0,
      totalAtrasados = 0,
      qtdAtrasados = 0
    for (const c of contas) {
      const aberto = c.valor_total - c.valor_pago
      if (c.status === 'PENDENTE' || c.status === 'PARCIAL') {
        totalAbertos += aberto
        qtdAbertos++
      }
      if (c.atrasado) {
        totalAtrasados += aberto
        qtdAtrasados++
      }
    }
    return { totalAbertos, qtdAbertos, totalAtrasados, qtdAtrasados }
  }, [contas])

  const algumFiltroAtivo = termo || status !== 'todos' || fornecedorId || periodo

  const chipBase =
    'rounded-full px-2.5 py-1 text-caption font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]'
  const chipActive = 'bg-[var(--color-brand)] text-[var(--color-brand-fg)]'
  const chipInactive =
    'border border-[var(--color-border)] bg-[var(--color-surface-soft)] text-fg-muted hover:bg-[var(--color-surface)]'

  function statusLabel(key: string): string {
    return (m.contas_pagar[`status_${key}` as keyof typeof m.contas_pagar] as string) ?? key
  }

  const columns: Column<ContaPagarRow>[] = useMemo(
    () => [
      {
        key: 'fornecedor',
        header: m.contas_pagar.col_fornecedor,
        priority: 'primary',
        cell: (c) => <span className="font-medium text-fg">{c.fornecedor_nome ?? '—'}</span>,
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
            {c.nfe_numero && c.nfe_importacao_id ? (
              <Link
                href={adminImportNfeImportacaoQuery(c.nfe_importacao_id)}
                className="mt-1 inline-flex items-center gap-1 font-mono text-caption text-[var(--color-warning-strong)] hover:underline"
              >
                <FileText className="h-3 w-3" aria-hidden />
                NF-e #{c.nfe_numero}
              </Link>
            ) : c.nfe_numero ? (
              // G-08: sem nfe_importacao_id não há pra onde navegar — antes
              // isto renderizava um <Link href="#"> com preventDefault, um
              // link clicável que não fazia nada. Mesmo texto, sem promessa
              // de clique.
              <span className="mt-1 inline-flex items-center gap-1 font-mono text-caption text-fg-subtle">
                <FileText className="h-3 w-3" aria-hidden />
                NF-e #{c.nfe_numero}
              </span>
            ) : null}
          </div>
        ),
      },
      {
        key: 'venc',
        header: m.contas_pagar.col_vencimento,
        width: '140px',
        cell: (c) => {
          const podePagar = c.status !== 'PAGO' && c.status !== 'CANCELADO'
          return (
            <div className={cn('tabular-nums', vencimentoTone(c))}>
              {fmtDate(c.vencimento, locale)}
              {podePagar ? (
                <div className="mt-0.5 text-caption uppercase tracking-wide opacity-85">
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
        priority: 'primary',
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
                        'h-full transition-[width] duration-200',
                        c.status === 'PARCIAL'
                          ? 'bg-gradient-to-r from-amber-400 to-amber-700'
                          : 'bg-gradient-to-r from-emerald-400 to-emerald-700',
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
        width: '110px',
        cell: (c) => (
          <Badge className={cn('rounded-full px-2.5 py-0.5 text-caption font-semibold', statusBadgeClass(c.status))}>
            {(m.contas_pagar[`status_${c.status.toLowerCase()}` as keyof typeof m.contas_pagar] as string) ??
              c.status}
          </Badge>
        ),
      },
    ],
    [locale, m],
  )

  const emptyState = (
    <div className="py-12 text-center">
      <div className="text-5xl text-[var(--color-warning-strong)]/60" style={{ fontFamily: 'var(--font-serif-han)' }}>
        应
      </div>
      <div className="mt-3 text-body font-semibold text-fg">{m.contas_pagar.vazio_titulo}</div>
      <div className="mt-1 text-caption text-fg-muted">{m.contas_pagar.vazio_sub}</div>
    </div>
  )

  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard
          label={m.contas_pagar.kpi_em_aberto}
          value={fmtGerenteBRL(kpis.totalAbertos, locale)}
          hint={`${kpis.qtdAbertos} ${kpis.qtdAbertos === 1 ? m.contas_pagar.conta_sg : m.contas_pagar.conta_pl}`}
          icon="wallet-cards"
          tone="warning"
        />
        <MetricCard
          label={m.contas_pagar.kpi_atrasadas}
          value={fmtGerenteBRL(kpis.totalAtrasados, locale)}
          hint={`${kpis.qtdAtrasados} ${m.contas_pagar.atrasadas}`}
          icon="alert-circle"
          tone="danger"
        />
        <MetricCard
          label={m.contas_pagar.kpi_filtrado}
          value={String(contas.length)}
          hint={m.contas_pagar.contas_carregadas}
          icon="list-filter"
          tone="gold"
        />
        <MetricCard
          label={m.contas_pagar.acoes_rapidas}
          value="—"
          hint={m.contas_pagar.origem_nfe_hint}
          icon="file-check-2"
          tone="gold"
        />
      </div>

      <CrudListShell
        toolbar={
          <>
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <div className="min-w-[200px] flex-1 sm:max-w-md">
                <SearchInput
                  value={termo}
                  onChange={(e) => setTermo(e.target.value)}
                  placeholder={m.contas_pagar.placeholder_busca}
                  aria-label={m.contas_pagar.placeholder_busca}
                  controlSize="sm"
                />
              </div>
              <Input
                type="month"
                value={periodo}
                onChange={(e) => setPeriodo(e.target.value)}
                aria-label={m.contas_pagar.filtro_periodo}
                controlSize="sm"
                className="h-9 w-auto tabular-nums"
              />
              <Select
                value={fornecedorId}
                onChange={(e) => setFornecedorId(e.target.value)}
                aria-label={m.contas_pagar.filtro_fornecedor}
                controlSize="sm"
                className="h-9 min-w-[180px]"
              >
                <option value="">{m.contas_pagar.todos_fornecedores}</option>
                {fornecedoresOpts.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                  </option>
                ))}
              </Select>
              <div className="flex flex-wrap items-center gap-1.5">
                {STATUS_LIST.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(s)}
                    className={cn(chipBase, status === s ? chipActive : chipInactive)}
                  >
                    {statusLabel(s)}
                  </button>
                ))}
              </div>
              {algumFiltroAtivo ? (
                <button
                  type="button"
                  onClick={limparFiltros}
                  className="inline-flex items-center gap-1 text-caption text-fg-muted hover:text-fg"
                >
                  <FilterX className="h-3 w-3" aria-hidden />
                  {m.contas_pagar.limpar_filtros}
                </button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={exporting || contas.length === 0}
                onClick={() => void onExportar()}
                className="gap-1.5"
              >
                <Download className="h-3.5 w-3.5" aria-hidden />
                {exporting ? m.comum.carregando : m.gerente.exportar_csv}
              </Button>
            </div>
            <PageActions>
              <Button type="button" variant="primary" size="sm" className="gap-1.5" asChild>
                <Link href={ROUTES.admin.importNfe}>
                  <Plus className="h-4 w-4" aria-hidden /> {m.contas_pagar.lancar}
                </Link>
              </Button>
            </PageActions>
          </>
        }
        footer={<div ref={sentinelRef} className="h-1 w-full" aria-hidden />}
      >
        <DataTable
          columns={columns}
          data={contas}
          rowKey={(c) => c.id}
          loading={loading}
          compact
          emptyState={emptyState}
          className="rounded-none border-x-0 border-b-0"
          rowActions={(c) => {
            const statusPagavel = c.status !== 'PAGO' && c.status !== 'CANCELADO'
            const foraDaLoja = actorLojaId != null && c.loja_id !== actorLojaId
            if (!statusPagavel) return null
            if (foraDaLoja) {
              // registrar_pagamento_contas_pagar rejeita pagamento cross-loja para
              // todos os perfis — sem botão de pagar em vez de deixar o clique falhar.
              return (
                <span className="text-caption text-fg-subtle" title="Conta de outra loja — pagamento deve ser feito por um ator daquela loja.">
                  Outra loja
                </span>
              )
            }
            return (
              <div className="flex items-center justify-end gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="primary"
                  onClick={() => setEmPagamento(c)}
                  className="gap-1"
                  aria-label={`${m.contas_pagar.registrar_pagamento} — ${c.descricao}`}
                >
                  <DollarSign className="h-3 w-3" aria-hidden />
                  {m.contas_pagar.btn_pagar}
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => abrirCancelar(c)}
                  aria-label={`${m.contas_pagar.cancelar} — ${c.descricao}`}
                  title={m.contas_pagar.cancelar}
                  className="text-[var(--color-danger-strong)] hover:bg-[var(--color-danger-bg)]"
                >
                  <XCircle className="h-3.5 w-3.5" aria-hidden />
                </Button>
              </div>
            )
          }}
        />
      </CrudListShell>

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

      {cancelandoAlvo ? (
        <DragonModal
          open
          onClose={() => setCancelandoAlvo(null)}
          variant="danger"
          size="sm"
          title={`${m.contas_pagar.cancelar} — ${cancelandoAlvo.descricao}`}
          dismissable={!cancelando}
          closeLabel={m.comum.fechar}
          footer={
            <>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setCancelandoAlvo(null)}
                disabled={cancelando}
              >
                {m.comum.cancelar}
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={() => void confirmarCancelamento()}
                disabled={cancelando}
              >
                {cancelando ? '…' : m.contas_pagar.cancelar}
              </Button>
            </>
          }
        >
          <label htmlFor="motivo-cancelamento" className="mb-1 block text-xs font-medium text-jl-fg-3">
            Motivo do cancelamento<span className="ml-0.5 text-[color:var(--accent)]">*</span>
          </label>
          <Input
            id="motivo-cancelamento"
            value={motivoCancelamento}
            onChange={(e) => {
              setMotivoCancelamento(e.target.value)
              if (erroMotivoCancelamento) setErroMotivoCancelamento(null)
            }}
            aria-invalid={!!erroMotivoCancelamento}
            disabled={cancelando}
            autoFocus
          />
          {erroMotivoCancelamento ? (
            <span className="mt-1 block text-xs text-[var(--color-danger-strong)]">
              {erroMotivoCancelamento}
            </span>
          ) : null}
        </DragonModal>
      ) : null}
    </>
  )
}
