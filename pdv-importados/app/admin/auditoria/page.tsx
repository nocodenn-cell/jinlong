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
import { createClient } from '@/lib/supabase/server'
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
    ['all', 'VENDA', 'CANCELAMENTO', 'AJUSTE_ESTOQUE', 'ALERTA', 'DESCONTO'],
    'all'
  )

  const filtro: AuditoriaFiltro = {
    inicio: periodoInicio(periodo),
    fim: periodoFim(periodo),
    tipos: tipo === 'all' ? [] : [tipo],
    operadorId: null,
  }

  const supabase = await createClient()
  const consistenciaFrom = filtro.inicio ?? new Date(Date.now() - 7 * 86_400_000).toISOString()
  const consistenciaTo = filtro.fim ?? new Date().toISOString()

  const [resEventos, resConsistencia] = await Promise.all([
    listarEventosAuditoria(filtro),
    supabase.rpc('relatorio_consistencia_vendas', {
      p_from: consistenciaFrom,
      p_to: consistenciaTo,
      p_loja_id: session.lojaId ?? null,
    }),
  ])

  const res = resEventos
  const eventos = res.ok ? res.eventos : []
  const truncado = res.ok ? res.truncado : false
  const loadError = res.ok ? null : res.error

  type ConsistenciaRow = {
    total_vendas: number
    vendas_consistentes: number
    vendas_com_anomalia: number
    taxa_consistencia_pct: number | null
    sem_itens: number
    sem_evento_ledger: number
    evento_duplicado: number
    sem_pagamento: number
    pagamentos_divergentes: number
  }
  const consistenciaRows = Array.isArray(resConsistencia.data) ? resConsistencia.data : []
  const consistencia: ConsistenciaRow | null =
    !resConsistencia.error && consistenciaRows.length > 0
      ? (consistenciaRows[0] as ConsistenciaRow)
      : null

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
        breadcrumbs={[
          { label: 'Início', href: '/admin/dashboard' },
          { label: 'Sistema' },
          { label: 'Auditoria' },
        ]}
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

      {consistencia ? (
        <SectionCard
          title="Saúde do sistema"
          subtitle="Consistência das vendas concluídas no período — detecta lacunas de itens, pagamentos ou eventos."
        >
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="flex-1 min-w-[120px] rounded-lg border border-[#242424] bg-[#0d0d0d] px-4 py-3 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-jl-fg-3 mb-1">Vendas analisadas</p>
              <p className="text-2xl font-bold tabular-nums text-jl-fg-1">{formatNumberLocale(Number(consistencia.total_vendas), locale)}</p>
            </div>
            <div className={`flex-1 min-w-[120px] rounded-lg border px-4 py-3 text-center ${consistencia.vendas_com_anomalia > 0 ? 'border-red-500/30 bg-red-500/10' : 'border-emerald-500/30 bg-emerald-500/10'}`}>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-jl-fg-3 mb-1">Taxa de consistência</p>
              <p className={`text-2xl font-bold tabular-nums ${consistencia.vendas_com_anomalia > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                {consistencia.taxa_consistencia_pct !== null ? `${Number(consistencia.taxa_consistencia_pct).toFixed(1)}%` : '—'}
              </p>
            </div>
            <div className={`flex-1 min-w-[120px] rounded-lg border px-4 py-3 text-center ${consistencia.vendas_com_anomalia > 0 ? 'border-red-500/30 bg-red-500/10' : 'border-[#242424] bg-[#0d0d0d]'}`}>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-jl-fg-3 mb-1">Com anomalia</p>
              <p className={`text-2xl font-bold tabular-nums ${consistencia.vendas_com_anomalia > 0 ? 'text-red-400' : 'text-jl-fg-2'}`}>
                {formatNumberLocale(Number(consistencia.vendas_com_anomalia), locale)}
              </p>
            </div>
          </div>
          {consistencia.vendas_com_anomalia > 0 ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {[
                { label: 'Sem itens', value: consistencia.sem_itens },
                { label: 'Sem evento', value: consistencia.sem_evento_ledger },
                { label: 'Evento duplicado', value: consistencia.evento_duplicado },
                { label: 'Sem pagamento', value: consistencia.sem_pagamento },
                { label: 'Pag. divergentes', value: consistencia.pagamentos_divergentes },
              ].map(({ label, value }) => (
                <div key={label} className={`rounded-lg border px-3 py-2 text-center ${Number(value) > 0 ? 'border-amber-500/30 bg-amber-500/10' : 'border-[#1e1e1e] bg-[#0a0a0a]'}`}>
                  <p className="text-[10px] text-jl-fg-3 mb-0.5">{label}</p>
                  <p className={`text-base font-bold tabular-nums ${Number(value) > 0 ? 'text-amber-400' : 'text-jl-fg-3'}`}>
                    {formatNumberLocale(Number(value), locale)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[12px] text-emerald-400 flex items-center gap-1.5">
              <span>✓</span> Todas as vendas do período estão consistentes.
            </p>
          )}
        </SectionCard>
      ) : null}

      <SectionCard
        title="Trilha de eventos"
        action={
          <span className="rounded-full border border-[#242424] bg-[#0f0f0f] px-2.5 py-0.5 text-[11px] text-jl-fg-3">
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
