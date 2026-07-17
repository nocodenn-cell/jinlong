/**
 * FastProduct Admin — Auditoria Visual (Fase 2 · item 1)
 *
 * Server Component. Timeline unificada SOMENTE-LEITURA sobre os ledgers que JÁ
 * existem (venda_eventos, vendas_canceladas_auditoria, movimentos_estoque_log,
 * system_alerts, descontos_venda). Nenhuma tabela/RPC nova; nenhuma escrita.
 *
 * Estrutura espelhada de /admin/vendas: PageHeader (period pills) + MetricCards
 * + SectionCard com chips de tipo + timeline (client) com Sheet de detalhe.
 */

import Link from 'next/link'
import { ROUTES, pathWithQuery } from '@shared-core/navigation/routes'
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { getMessages, type Mensagens } from '@/i18n/getMessages'
import { MetricCard, PageHeader, SectionCard } from '@/components/ui/admin-v2'
import type { MetricCardIconKey } from '@/components/ui/admin-v2/MetricCard'
import { localeFromIdioma } from '@/lib/idioma/localeFromIdioma'
import { formatNumberLocale } from '@/lib/format/money'
import {
  listarEventosAuditoria,
  type AuditoriaFiltro,
  type AuditoriaTipo,
} from './actions'
import { AuditoriaTimeline } from './_components/AuditoriaTimeline'

type Periodo = 'tudo' | 'hoje' | 'ontem' | '7d' | 'mes'
type TipoFiltro = 'all' | AuditoriaTipo

const DIA_MS = 86_400_000

function oneOf<T extends string>(raw: string | undefined, allowed: readonly T[], fallback: T): T {
  return allowed.includes(raw as T) ? (raw as T) : fallback
}

function periodoInicio(periodo: Periodo): string | null {
  const now = new Date()
  if (periodo === 'hoje') {
    const d = new Date(now)
    d.setHours(0, 0, 0, 0)
    return d.toISOString()
  }
  if (periodo === 'ontem') {
    const d = new Date(now)
    d.setDate(d.getDate() - 1)
    d.setHours(0, 0, 0, 0)
    return d.toISOString()
  }
  if (periodo === '7d') return new Date(now.getTime() - 7 * DIA_MS).toISOString()
  if (periodo === 'mes') {
    const d = new Date(now)
    d.setDate(1)
    d.setHours(0, 0, 0, 0)
    return d.toISOString()
  }
  return null
}

function periodoFim(periodo: Periodo): string | null {
  if (periodo !== 'ontem') return null
  const now = new Date()
  const d = new Date(now)
  d.setDate(d.getDate() - 1)
  d.setHours(23, 59, 59, 999)
  return d.toISOString()
}

function periodoLabels(ui: Mensagens['admin_ui']): Record<Periodo, string> {
  return {
    hoje: ui.auditoria_periodo_hoje,
    ontem: ui.auditoria_periodo_ontem,
    '7d': ui.auditoria_periodo_7d,
    mes: ui.auditoria_periodo_mes,
    tudo: ui.auditoria_periodo_tudo,
  }
}

function tipoOptions(ui: Mensagens['admin_ui']): Array<{ id: TipoFiltro; label: string }> {
  return [
    { id: 'all', label: ui.auditoria_tipo_todos },
    { id: 'VENDA', label: ui.auditoria_tipo_venda },
    { id: 'CANCELAMENTO', label: ui.auditoria_tipo_cancelamento },
    { id: 'AJUSTE_ESTOQUE', label: ui.auditoria_tipo_estoque },
    { id: 'ALERTA', label: ui.auditoria_tipo_alerta },
    { id: 'DESCONTO', label: ui.auditoria_tipo_desconto },
  ]
}

function tipoLabels(ui: Mensagens['admin_ui']): Record<AuditoriaTipo, string> {
  return {
    VENDA: ui.auditoria_tipo_venda,
    CANCELAMENTO: ui.auditoria_tipo_cancelamento,
    AJUSTE_ESTOQUE: ui.auditoria_tipo_estoque,
    ALERTA: ui.auditoria_tipo_alerta,
    DESCONTO: ui.auditoria_tipo_desconto,
  }
}

type SearchParams = { periodo?: string; tipo?: string }
type PageProps = { searchParams?: Promise<SearchParams> }

export default async function AdminAuditoriaPage({ searchParams }: PageProps) {
  const { session } = await loadAdminContext({
    pathname: ROUTES.admin.auditoria,
    resource: `route:${ROUTES.admin.auditoria}`,
  })
  const ui = getMessages(session.idioma).admin_ui
  const locale = localeFromIdioma(session.idioma)
  const sp = (searchParams ? await searchParams : {}) ?? {}

  const PERIODO_LABEL = periodoLabels(ui)
  const TIPO_OPTIONS = tipoOptions(ui)
  const TIPO_LABEL = tipoLabels(ui)

  const periodo = oneOf<Periodo>(sp.periodo, ['tudo', 'hoje', 'ontem', '7d', 'mes'], '7d')
  const tipo = oneOf<TipoFiltro>(
    sp.tipo,
    ['all', 'VENDA', 'CANCELAMENTO', 'AJUSTE_ESTOQUE', 'ALERTA', 'DESCONTO'],
    'all'
  )

  const filtro: AuditoriaFiltro = {
    inicio: periodoInicio(periodo),
    fim: periodoFim(periodo),
    tipos: tipo === 'all' ? [] : [tipo],
    operadorId: null,
  }

  const res = await listarEventosAuditoria(filtro)
  const eventos = res.ok ? res.eventos : []
  const truncado = res.ok ? res.truncado : false
  const loadError = res.ok ? null : res.error
  const fontesComErro = res.ok ? res.fontesComErro : []

  const contagem = eventos.reduce<Record<AuditoriaTipo, number>>(
    (acc, e) => {
      acc[e.tipo] += 1
      return acc
    },
    { VENDA: 0, CANCELAMENTO: 0, AJUSTE_ESTOQUE: 0, ALERTA: 0, DESCONTO: 0 }
  )

  const metricCards: Array<{
    label: string
    value: string
    icon: MetricCardIconKey
    tone: 'gold' | 'success' | 'warning'
    hint?: string
  }> = [
    {
      label: ui.auditoria_metric_eventos,
      value: formatNumberLocale(eventos.length, locale),
      icon: 'list-filter',
      tone: 'gold',
      hint: truncado ? ui.auditoria_metric_exibindo_recentes : undefined,
    },
    {
      label: ui.auditoria_metric_vendas,
      value: formatNumberLocale(contagem.VENDA, locale),
      icon: 'shopping-bag',
      tone: 'success',
    },
    {
      label: ui.auditoria_metric_cancelamentos,
      value: formatNumberLocale(contagem.CANCELAMENTO, locale),
      icon: 'x-circle',
      tone: 'warning',
    },
    {
      label: ui.auditoria_metric_alertas,
      value: formatNumberLocale(contagem.ALERTA, locale),
      icon: 'alert-circle',
      tone: 'warning',
    },
  ]

  const activeParams: Record<string, string> = {}
  if (periodo !== '7d') activeParams.periodo = periodo
  if (tipo !== 'all') activeParams.tipo = tipo

  const periodHref = (next: Periodo) => {
    const p = new URLSearchParams(activeParams)
    if (next === '7d') p.delete('periodo')
    else p.set('periodo', next)
    return pathWithQuery(ROUTES.admin.auditoria, p)
  }
  const tipoHref = (next: TipoFiltro) => {
    const p = new URLSearchParams(activeParams)
    if (next === 'all') p.delete('tipo')
    else p.set('tipo', next)
    return pathWithQuery(ROUTES.admin.auditoria, p)
  }

  return (
    <div className="admin-v2-page admin-v2-stack">
      <PageHeader
        title={ui.auditoria_titulo}
        subtitle={ui.auditoria_subtitulo}
        filters={(
          <div className="admin-v2-segmented">
            {(['hoje', 'ontem', '7d', 'mes', 'tudo'] as Periodo[]).map((option) => (
              <Link
                key={option}
                href={periodHref(option)}
                data-active={periodo === option}
                className="admin-v2-filter-pill rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
              >
                {PERIODO_LABEL[option]}
              </Link>
            ))}
          </div>
        )}
      />

      <div className="admin-v2-grid-kpi">
        {metricCards.map((card) => (
          <MetricCard
            key={card.label}
            label={card.label}
            value={card.value}
            icon={card.icon}
            tone={card.tone}
            hint={card.hint}
          />
        ))}
      </div>

      <SectionCard
        title={ui.auditoria_trilha_titulo}
        action={
          <span className="rounded-full border border-[var(--color-border-secondary)] bg-jl-surface-soft px-2.5 py-0.5 text-[11px] text-jl-fg-3">
            {eventos.length} {eventos.length === 1 ? ui.auditoria_evento_singular : ui.auditoria_evento_plural}
          </span>
        }
      >
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {TIPO_OPTIONS.map((option) => (
            <Link
              key={option.id}
              href={tipoHref(option.id)}
              data-active={tipo === option.id}
              className="admin-v2-filter-pill rounded-full px-3 py-1 text-[11px] font-medium transition-colors"
            >
              {option.label}
            </Link>
          ))}
        </div>

        {loadError ? (
          <div
            className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-[12px] text-destructive"
            role="alert"
          >
            {loadError}
          </div>
        ) : null}

        {fontesComErro.length > 0 ? (
          <div
            className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-[12px] text-destructive"
            role="alert"
          >
            {ui.auditoria_erro_fontes.replace('{{fontes}}', fontesComErro.map((t) => TIPO_LABEL[t]).join(', '))}
          </div>
        ) : null}

        <AuditoriaTimeline eventos={eventos} labels={ui} />

        {truncado ? (
          <p className="mt-4 text-[11px] text-jl-fg-3">{ui.auditoria_truncado}</p>
        ) : null}
      </SectionCard>
    </div>
  )
}
