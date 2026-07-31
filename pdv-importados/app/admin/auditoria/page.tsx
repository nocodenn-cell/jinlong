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

const PERIODO_LABEL: Record<Periodo, string> = {
  hoje: 'Hoje',
  ontem: 'Ontem',
  '7d': '7 dias',
  mes: 'Este mês',
  tudo: 'Tudo',
}

const TIPO_OPTIONS: Array<{ id: TipoFiltro; label: string }> = [
  { id: 'all', label: 'Todos os eventos' },
  { id: 'VENDA', label: 'Vendas' },
  { id: 'CANCELAMENTO', label: 'Cancelamentos' },
  { id: 'AJUSTE_ESTOQUE', label: 'Estoque' },
  { id: 'ALERTA', label: 'Alertas' },
  { id: 'DESCONTO', label: 'Descontos' },
  { id: 'DEVOLUCAO', label: 'Devoluções/Trocas' },
]

type SearchParams = { periodo?: string; tipo?: string }
type PageProps = { searchParams?: Promise<SearchParams> }

export default async function AdminAuditoriaPage({ searchParams }: PageProps) {
  const { session } = await loadAdminContext({
    pathname: ROUTES.admin.auditoria,
    resource: `route:${ROUTES.admin.auditoria}`,
  })
  const locale = localeFromIdioma(session.idioma)
  const sp = (searchParams ? await searchParams : {}) ?? {}

  const periodo = oneOf<Periodo>(sp.periodo, ['tudo', 'hoje', 'ontem', '7d', 'mes'], '7d')
  const tipo = oneOf<TipoFiltro>(
    sp.tipo,
    ['all', 'VENDA', 'CANCELAMENTO', 'AJUSTE_ESTOQUE', 'ALERTA', 'DESCONTO', 'DEVOLUCAO'],
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

  const contagem = eventos.reduce<Record<AuditoriaTipo, number>>(
    (acc, e) => {
      acc[e.tipo] += 1
      return acc
    },
    { VENDA: 0, CANCELAMENTO: 0, AJUSTE_ESTOQUE: 0, ALERTA: 0, DESCONTO: 0, DEVOLUCAO: 0 }
  )

  const metricCards: Array<{
    label: string
    value: string
    icon: MetricCardIconKey
    tone: 'gold' | 'success' | 'warning'
    hint?: string
  }> = [
    {
      label: 'Eventos',
      value: formatNumberLocale(eventos.length, locale),
      icon: 'list-filter',
      tone: 'gold',
      hint: truncado ? 'Exibindo os mais recentes' : undefined,
    },
    {
      label: 'Vendas',
      value: formatNumberLocale(contagem.VENDA, locale),
      icon: 'shopping-bag',
      tone: 'success',
    },
    {
      label: 'Cancelamentos',
      value: formatNumberLocale(contagem.CANCELAMENTO, locale),
      icon: 'x-circle',
      tone: 'warning',
    },
    {
      label: 'Alertas',
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
        title="Auditoria"
        subtitle="Linha do tempo de eventos operacionais — vendas, cancelamentos, estoque, alertas e descontos."
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
        title="Trilha de eventos"
        action={
          <span className="rounded-full border border-[var(--color-border-secondary)] bg-jl-surface-soft px-2.5 py-0.5 text-[11px] text-jl-fg-3">
            {eventos.length} {eventos.length === 1 ? 'evento' : 'eventos'}
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
          <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-[12px] text-destructive">
            {loadError}
          </div>
        ) : null}

        <AuditoriaTimeline eventos={eventos} />

        {truncado ? (
          <p className="mt-4 text-[11px] text-jl-fg-3">
            Exibindo os 150 eventos mais recentes do período. Use um período menor ou filtre por tipo para refinar.
          </p>
        ) : null}
      </SectionCard>
    </div>
  )
}
