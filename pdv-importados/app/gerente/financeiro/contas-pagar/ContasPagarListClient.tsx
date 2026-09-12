'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDebounce } from '@/lib/hooks/useDebounce'
import { Download, Plus, FileText, XCircle, DollarSign, FilterX, History } from 'lucide-react'
import {
  CrudListShell,
  MetricCard,
  MotivoOperacaoModal,
  PageActions,
  RowActionsMenu,
  SituacaoTituloBadge,
  type RowAction,
  type SituacaoTituloLabels,
} from '@/components/ui/admin-v2'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Button } from '@/components/ui/button'
import { Input, SearchInput, Select } from '@/components/ui/forms'
import { emitGerenteToast } from '@/lib/gerente/toast'
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
import { HistoricoPagamentosModal } from './HistoricoPagamentosModal'
import { ROUTES, hrefImportacaoNfe } from '@shared-core/navigation/routes'
import {
  hojeYmd,
  saldoTitulo,
  situacaoAtrasada,
  situacaoEmAberto,
  situacaoTitulo,
  type SituacaoTitulo,
} from '@shared-core/src/financial'

type Props = Readonly<{
  idioma: Idioma
  locale: string
  contasIniciais: ContaPagarRow[]
  hasMoreInicial: boolean
  fornecedoresOpts: Array<{ id: string; nome: string }>
  statusInicial: string
  periodoInicial: string
  /** Loja do ator autenticado — `registrar_pagamento_contas_pagar` rejeita pagamento cross-loja para todos os perfis. */
  actorLojaId?: string | null
}>

const STATUS_LIST = ['todos', 'pendente', 'parcial', 'atrasado', 'pago', 'cancelado'] as const

/**
 * `vencimento` é uma data pura (YYYY-MM-DD). `new Date('2026-10-15')` é
 * meia-noite UTC — renderizado em fuso negativo, exibia 14/10 para uma parcela
 * que vence em 15/10. Interpretar como data local corrige o dia exibido.
 */
function dataLocal(iso: string): Date | null {
  const [ano, mes, dia] = iso.slice(0, 10).split('-').map(Number)
  if (!ano || !mes || !dia) return null
  return new Date(ano, mes - 1, dia)
}

function fmtDate(iso: string | null, locale: string): string {
  if (!iso) return '—'
  const d = dataLocal(iso)
  if (!d) return '—'
  return d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/**
 * Distância em DIAS DE CALENDÁRIO até o vencimento.
 *
 * Media-se a partir da meia-noite de hoje, não de `Date.now()`. Comparar com o
 * instante atual dava erro de até um dia inteiro: às 12h, um vencimento HOJE
 * ficava a -0,5 dia e era arredondado para -1 — a tela dizia "ontem" numa conta
 * que vence hoje, em cima do selo "Vence hoje". Achado no QA ao vivo de 11/09.
 */
function diasAteVencimento(iso: string): number | null {
  const venc = dataLocal(iso)
  if (!venc) return null
  const agora = new Date()
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate())
  return Math.round((venc.getTime() - hoje.getTime()) / 86400000)
}

function relativoVenc(iso: string | null, locale: string): string {
  if (!iso) return ''
  const dias = diasAteVencimento(iso)
  if (dias === null) return ''
  return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(dias, 'day')
}

function vencimentoTone(situacao: SituacaoTitulo, vencimento: string | null): string {
  if (!situacaoEmAberto(situacao) || !vencimento) return 'text-fg'
  if (situacaoAtrasada(situacao)) return 'text-[var(--color-danger-strong)] font-semibold'
  if (situacao === 'VENCE_HOJE') return 'text-[var(--color-warning-strong)] font-semibold'
  const dias = diasAteVencimento(vencimento)
  if (dias !== null && dias <= 7) return 'text-[var(--color-warning)]'
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
  actorLojaId = null,
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
  const [emHistorico, setEmHistorico] = useState<ContaPagarRow | null>(null)
  const [emCancelamento, setEmCancelamento] = useState<ContaPagarRow | null>(null)
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

  /**
   * Cancelar é irreversível e estorna os pagamentos já feitos na mesma
   * transação. Era pedido por `window.prompt` — sem i18n, sem validação visível
   * e sem dizer o que ia acontecer. Agora passa pelo modal de motivo, que
   * declara a consequência antes de confirmar.
   */
  async function confirmarCancelamento(motivo: string) {
    const c = emCancelamento
    if (!c) return
    setCancelando(true)
    try {
      const r = await cancelarContaPagarAction(c.id, motivo)
      if (!r.ok) {
        emitGerenteToast({ kind: 'error', message: r.error })
        return
      }
      setContas((cur) =>
        cur.map((x) => (x.id === c.id ? { ...x, status: 'CANCELADO' as const } : x)),
      )
      setEmCancelamento(null)
      emitGerenteToast({ kind: 'success', message: m.contas_pagar.toast_cancelada })
    } finally {
      setCancelando(false)
    }
  }

  /** Estorno mexe em `status` e `valor_pago` — a lista reflete sem refetch. */
  function aplicarEstornoLocal(contaId: string, patch: { status: string; valor_pago: number }) {
    setContas((cur) =>
      cur.map((x) =>
        x.id === contaId
          ? { ...x, status: patch.status.toUpperCase() as ContaPagarRow['status'], valor_pago: patch.valor_pago }
          : x,
      ),
    )
    setEmHistorico((cur) =>
      cur && cur.id === contaId
        ? { ...cur, status: patch.status.toUpperCase() as ContaPagarRow['status'], valor_pago: patch.valor_pago }
        : cur,
    )
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
          { key: 'parcela', header: m.contas_pagar.parcela_label },
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
          parcela: c.nfe_parcela ?? '',
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
    const hoje = hojeYmd()
    for (const c of contas) {
      const aberto = saldoTitulo(c.valor_total, c.valor_pago)
      const situacao = situacaoTitulo({
        valorTotal: c.valor_total,
        valorPago: c.valor_pago,
        vencimento: c.vencimento,
        status: c.status,
        hoje,
      })
      if (situacaoEmAberto(situacao)) {
        totalAbertos += aberto
        qtdAbertos++
      }
      if (situacaoAtrasada(situacao)) {
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

  const situacaoLabels: SituacaoTituloLabels = useMemo(
    () => ({
      EM_ABERTO: m.contas_pagar.situacao_em_aberto,
      VENCE_HOJE: m.contas_pagar.situacao_vence_hoje,
      ATRASADO: m.contas_pagar.situacao_atrasado,
      QUITADO: m.contas_pagar.situacao_quitado,
      PARCIAL_EM_DIA: m.contas_pagar.situacao_parcial_em_dia,
      PARCIAL_ATRASADO: m.contas_pagar.situacao_parcial_atrasado,
      CANCELADO: m.contas_pagar.situacao_cancelado,
    }),
    [m],
  )

  /** Situação derivada por linha — computada uma vez, usada por coluna e por ação. */
  const situacaoDe = useCallback(
    (c: ContaPagarRow): SituacaoTitulo =>
      situacaoTitulo({
        valorTotal: c.valor_total,
        valorPago: c.valor_pago,
        vencimento: c.vencimento,
        status: c.status,
        hoje: hojeYmd(),
      }),
    [],
  )

  const columns: Column<ContaPagarRow>[] = useMemo(
    () => [
      {
        key: 'fornecedor',
        header: m.contas_pagar.col_fornecedor,
        className: 'hidden sm:table-cell',
        headerClassName: 'hidden sm:table-cell',
        priority: 'primary',
        cell: (c) => <span className="font-medium text-fg">{c.fornecedor_nome ?? '—'}</span>,
      },
      {
        key: 'descricao',
        header: m.contas_pagar.col_descricao,
        sticky: true,
        cell: (c) => (
          <div>
            <div className="font-medium text-fg">{c.descricao}</div>
            <div className="mt-0.5 text-caption text-fg-subtle">
              {m.contas_pagar.lancado_em} {fmtGerenteDateTime(c.criado_em, locale)}
            </div>
            {c.nfe_numero || c.nfe_importacao_id ? (
              <Link
                href={c.nfe_importacao_id ? hrefImportacaoNfe(c.nfe_importacao_id) : '#'}
                onClick={(e) => !c.nfe_importacao_id && e.preventDefault()}
                className="mt-1 inline-flex items-center gap-1 font-mono text-caption text-[var(--color-warning-strong)] hover:underline"
              >
                <FileText className="h-3 w-3" aria-hidden />
                {c.nfe_numero ? `NF-e #${c.nfe_numero}` : 'NF-e'}
                {c.nfe_parcela ? ` · ${m.contas_pagar.parcela_label} ${c.nfe_parcela}` : ''}
              </Link>
            ) : null}
          </div>
        ),
      },
      {
        key: 'venc',
        header: m.contas_pagar.col_vencimento,
        width: '140px',
        cell: (c) => {
          const situacao = situacaoDe(c)
          return (
            <div className={cn('tabular-nums', vencimentoTone(situacao, c.vencimento))}>
              {fmtDate(c.vencimento, locale)}
              {situacaoEmAberto(situacao) ? (
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
        header: m.contas_pagar.col_em_aberto,
        align: 'right',
        priority: 'primary',
        cell: (c) => {
          // O número dominante da linha é o que AINDA SE DEVE, não o valor
          // original: é ele que decide se o operador age hoje. R$ 5.000
          // originais com R$ 2.000 pagos têm de ler "R$ 3.000 pendente" à
          // primeira vista, com o original logo abaixo como contexto.
          const situacao = situacaoDe(c)
          const saldo = saldoTitulo(c.valor_total, c.valor_pago)
          const pct = c.valor_total > 0 ? (c.valor_pago / c.valor_total) * 100 : 0
          const quitado = situacao === 'QUITADO'
          const cancelado = situacao === 'CANCELADO'
          const parcial = c.valor_pago > 0 && !quitado && !cancelado

          return (
            <div className="text-right">
              {/*
                A classe de cor NÃO pode passar pelo `cn` junto com `text-body`:
                o tailwind-merge trata as duas como o mesmo grupo `text-*` e
                descarta a primeira — o número perderia o tamanho que o torna
                dominante. Por isso a tipografia fica estática e só a cor varia.
              */}
              <div
                className={`text-body font-bold tabular-nums ${
                  cancelado
                    ? 'text-fg-subtle line-through'
                    : quitado
                      ? 'text-[var(--color-success-strong)]'
                      : situacaoAtrasada(situacao)
                        ? 'text-[var(--color-danger-strong)]'
                        : 'text-fg'
                }`}
              >
                {quitado ? m.contas_pagar.saldo_quitado : fmtGerenteBRL(saldo, locale)}
                {!quitado && !cancelado ? (
                  <span className="ml-1 text-caption font-medium uppercase tracking-wide opacity-75">
                    {m.contas_pagar.saldo_pendente}
                  </span>
                ) : null}
              </div>

              <div className="mt-0.5 text-caption tabular-nums text-fg-subtle">
                {m.contas_pagar.saldo_de} {fmtGerenteBRL(c.valor_total, locale)}
                {parcial ? (
                  <>
                    {' · '}
                    {m.contas_pagar.pago_label} {fmtGerenteBRL(c.valor_pago, locale)}
                  </>
                ) : null}
              </div>

              {parcial ? (
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-[var(--color-surface-soft)]">
                  <div
                    className={cn(
                      'h-full transition-[width] duration-200',
                      situacaoAtrasada(situacao)
                        ? 'bg-gradient-to-r from-red-400 to-red-700'
                        : 'bg-gradient-to-r from-amber-400 to-amber-700',
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              ) : null}
            </div>
          )
        },
      },
      {
        key: 'status',
        header: m.contas_pagar.col_status,
        align: 'center',
        width: '132px',
        cell: (c) => <SituacaoTituloBadge situacao={situacaoDe(c)} labels={situacaoLabels} />,
      },
    ],
    [locale, m, situacaoDe, situacaoLabels],
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
      <div className="admin-v2-grid-kpi mb-5">
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
            const situacao = situacaoDe(c)
            const emAberto = situacaoEmAberto(situacao)
            // `registrar_pagamento_contas_pagar` rejeita pagamento cross-loja
            // para todos os perfis. Em vez de oferecer uma ação que sempre
            // falha, a linha diz por que não há ação — o histórico continua
            // acessível, porque ler não é escrever.
            const foraDaLoja = actorLojaId != null && c.loja_id !== actorLojaId

            const acoes: RowAction[] = []
            if (emAberto) {
              acoes.push({
                id: 'pagar',
                label: m.contas_pagar.acao_pagar,
                icon: DollarSign,
                onSelect: () => setEmPagamento(c),
                disabled: foraDaLoja,
                disabledHint: m.contas_pagar.outra_loja_hint,
              })
            }
            acoes.push({
              id: 'historico',
              label: m.contas_pagar.acao_historico,
              icon: History,
              onSelect: () => setEmHistorico(c),
            })
            if (c.nfe_importacao_id) {
              acoes.push({
                id: 'nfe',
                label: m.contas_pagar.acao_ver_nfe,
                icon: FileText,
                href: hrefImportacaoNfe(c.nfe_importacao_id),
              })
            }
            if (emAberto) {
              acoes.push({
                id: 'cancelar',
                label: m.contas_pagar.cancelar,
                icon: XCircle,
                destructive: true,
                onSelect: () => setEmCancelamento(c),
                disabled: foraDaLoja,
                disabledHint: m.contas_pagar.outra_loja_hint,
              })
            }

            return (
              <div className="flex items-center justify-end gap-1">
                {foraDaLoja ? (
                  <span className="text-caption text-fg-subtle" title={m.contas_pagar.outra_loja_hint}>
                    {m.contas_pagar.outra_loja}
                  </span>
                ) : null}
                <RowActionsMenu
                  actions={acoes}
                  ariaLabel={m.contas_pagar.acoes_aria.replace('{descricao}', c.descricao)}
                />
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

      {emHistorico ? (
        <HistoricoPagamentosModal
          key={emHistorico.id}
          idioma={idioma}
          locale={locale}
          conta={emHistorico}
          situacaoLabels={situacaoLabels}
          onClose={() => setEmHistorico(null)}
          onEstornado={(patch) => aplicarEstornoLocal(emHistorico.id, patch)}
        />
      ) : null}

      <MotivoOperacaoModal
        open={emCancelamento !== null}
        pending={cancelando}
        labels={{
          titulo: m.contas_pagar.cancelar_titulo,
          subtitulo: emCancelamento?.descricao,
          consequenciaTitulo: m.contas_pagar.cancelar_consequencia,
          campoLabel: m.contas_pagar.cancelar_campo,
          campoPlaceholder: m.contas_pagar.cancelar_placeholder,
          erroObrigatorio: m.contas_pagar.motivo_min,
          confirmar: m.contas_pagar.cancelar_confirmar,
          cancelar: m.comum.cancelar,
          fechar: m.comum.fechar,
          enviando: m.contas_pagar.enviando,
        }}
        efeitos={[
          { tom: 'financeiro', texto: m.contas_pagar.cancelar_efeito_titulo },
          { tom: 'alerta', texto: m.contas_pagar.cancelar_efeito_estorno },
          { tom: 'documento', texto: m.contas_pagar.cancelar_efeito_auditoria },
        ]}
        onCancel={() => setEmCancelamento(null)}
        onConfirm={(motivo) => void confirmarCancelamento(motivo)}
      />
    </>
  )
}
