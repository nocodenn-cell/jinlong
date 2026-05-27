import Link from 'next/link'
import {
  Activity,
  AlertTriangle,
  RefreshCw,
  MousePointerClick,
  Clock,
  CheckCircle,
  Layers,
  TrendingUp,
} from 'lucide-react'
import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import { getMessages } from '@/i18n/getMessages'
import { obterObservabilidadeSummary } from './actions'
import { MetricCard } from '@/components/gerente/MetricCard'

export const revalidate = 60

function formatMs(ms: number | null): string {
  if (ms === null) return '—'
  if (ms < 1_000) return `${ms}ms`
  return `${(ms / 1_000).toFixed(1)}s`
}

function formatPct(pct: number | null): string {
  if (pct === null) return '—'
  return `${pct}%`
}

function StatusBadge({ value, thresholdWarn, thresholdBad, invert = false }: {
  value: number | null
  thresholdWarn: number
  thresholdBad: number
  invert?: boolean
}) {
  if (value === null) return <span className="text-jl-fg-3 text-xs">sem dados</span>

  const isGood = invert ? value >= thresholdWarn : value <= thresholdWarn
  const isBad  = invert ? value < thresholdBad  : value > thresholdBad

  return (
    <span className={[
      'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
      isGood ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
      : isBad ? 'bg-red-500/10 text-red-400 border border-red-500/30'
      : 'bg-amber-500/10 text-amber-400 border border-amber-500/30',
    ].join(' ')}>
      {isGood ? '✓ ok' : isBad ? '✗ crítico' : '⚠ atenção'}
    </span>
  )
}

export default async function ObservabilidadePage() {
  const { idioma } = await getUsuarioIdioma()
  const m = getMessages(idioma)

  const result = await obterObservabilidadeSummary()

  if (!result.ok) {
    return (
      <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6">
        <p className="text-sm text-red-400">{result.error}</p>
      </div>
    )
  }

  const d = result.data

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6 space-y-8">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <Link href="/gerente" className="gerente-nav-back text-sm font-medium hover:underline mb-2 block">
            ← {m.gerente.inicio}
          </Link>
          <h1 className="text-xl font-semibold text-jl-fg-1 flex items-center gap-2">
            <Activity className="h-5 w-5 text-jl-accent" />
            Observabilidade do PDV
          </h1>
          <p className="text-sm text-jl-fg-3 mt-1">Últimas 24 horas · atualiza a cada 60s</p>
        </div>
      </div>

      {/* KPIs principais */}
      <section>
        <h2 className="text-sm font-semibold text-jl-fg-3 uppercase tracking-wider mb-3">
          Fluxo de finalização
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <MetricCard
            title="Vendas concluídas (24h)"
            value={d.finalize_total_hoje}
            icon={CheckCircle}
          />
          <div className="dragon-glass-card border border-jl-border-1 rounded-xl p-6 shadow-sm space-y-1">
            <p className="text-sm font-medium text-jl-fg-3">p95 finalizar</p>
            <p className="text-2xl font-bold text-jl-fg-1 tabular-nums">{formatMs(d.finalize_p95_ms)}</p>
            <StatusBadge value={d.finalize_p95_ms} thresholdWarn={2_000} thresholdBad={5_000} />
            <p className="text-xs text-jl-fg-3 mt-1">objetivo: &lt; 2s</p>
          </div>
          <div className="dragon-glass-card border border-jl-border-1 rounded-xl p-6 shadow-sm space-y-1">
            <p className="text-sm font-medium text-jl-fg-3">Taxa de timeout</p>
            <p className="text-2xl font-bold text-jl-fg-1 tabular-nums">{formatPct(d.timeout_rate_pct)}</p>
            <StatusBadge value={d.timeout_rate_pct} thresholdWarn={1} thresholdBad={5} />
            <p className="text-xs text-jl-fg-3 mt-1">objetivo: &lt; 1%</p>
          </div>
          <div className="dragon-glass-card border border-jl-border-1 rounded-xl p-6 shadow-sm space-y-1">
            <p className="text-sm font-medium text-jl-fg-3">Taxa de retry</p>
            <p className="text-2xl font-bold text-jl-fg-1 tabular-nums">{formatPct(d.retry_rate_pct)}</p>
            <StatusBadge value={d.retry_rate_pct} thresholdWarn={2} thresholdBad={10} />
            <p className="text-xs text-jl-fg-3 mt-1">objetivo: &lt; 2%</p>
          </div>
        </div>
      </section>

      {/* Sinais de qualidade operacional */}
      <section>
        <h2 className="text-sm font-semibold text-jl-fg-3 uppercase tracking-wider mb-3">
          Qualidade operacional
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <div className="dragon-glass-card border border-jl-border-1 rounded-xl p-6 shadow-sm space-y-1">
            <p className="text-sm font-medium text-jl-fg-3">Double-click bloqueado</p>
            <p className="text-2xl font-bold text-jl-fg-1 tabular-nums">{d.double_click_blocked_hoje}</p>
            <p className="text-xs text-jl-fg-3 mt-1">
              {d.double_click_blocked_hoje === 0
                ? 'Nenhum — ótimo'
                : d.double_click_blocked_hoje < 10
                ? 'Baixo — normal'
                : 'Alto → revisar feedback visual de loading'}
            </p>
          </div>
          <div className="dragon-glass-card border border-jl-border-1 rounded-xl p-6 shadow-sm space-y-1">
            <p className="text-sm font-medium text-jl-fg-3">Timeouts (24h)</p>
            <p className="text-2xl font-bold text-jl-fg-1 tabular-nums">{d.finalize_timeout_hoje}</p>
            <p className="text-xs text-jl-fg-3 mt-1">
              {d.finalize_timeout_hoje === 0 ? 'Nenhum — excelente'
               : d.finalize_timeout_hoje < 3 ? 'Baixo — aceitável'
               : 'Investigar infraestrutura/rede'}
            </p>
          </div>
          <div className="dragon-glass-card border border-jl-border-1 rounded-xl p-6 shadow-sm space-y-1">
            <p className="text-sm font-medium text-jl-fg-3">Vendas reconciliadas</p>
            <p className="text-2xl font-bold text-jl-fg-1 tabular-nums">{d.venda_reconciled_hoje}</p>
            <p className="text-xs text-jl-fg-3 mt-1">
              {d.venda_reconciled_hoje === 0
                ? 'Nenhuma — idempotência funcionando'
                : 'Operador viu erro mas venda estava salva'}
            </p>
          </div>
          <div className="dragon-glass-card border border-jl-border-1 rounded-xl p-6 shadow-sm space-y-1">
            <p className="text-sm font-medium text-jl-fg-3">Multi-aba detectado</p>
            <p className="text-2xl font-bold text-jl-fg-1 tabular-nums">{d.cross_tab_detected_hoje}</p>
            <p className="text-xs text-jl-fg-3 mt-1">
              {d.cross_tab_detected_hoje === 0
                ? 'Nenhum — lock cross-tab desnecessário por ora'
                : 'Evidência para implementar BroadcastChannel'}
            </p>
          </div>
        </div>
      </section>

      {/* Tabela de todos os eventos */}
      <section>
        <h2 className="text-sm font-semibold text-jl-fg-3 uppercase tracking-wider mb-3">
          Todos os eventos (24h)
        </h2>
        {d.metricas.length === 0 ? (
          <div className="dragon-glass-card border border-jl-border-1 rounded-xl p-8 text-center">
            <p className="text-jl-fg-3 text-sm">Nenhum evento registrado nas últimas 24 horas.</p>
            <p className="text-jl-fg-3 text-xs mt-1">
              Os eventos aparecem assim que operadores usam o PDV em produção.
            </p>
          </div>
        ) : (
          <div className="dragon-glass-card border border-jl-border-1 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-jl-border-1 text-left">
                  <th className="px-4 py-3 text-xs font-semibold text-jl-fg-3 uppercase tracking-wider">Evento</th>
                  <th className="px-4 py-3 text-xs font-semibold text-jl-fg-3 uppercase tracking-wider text-right">Total</th>
                  <th className="px-4 py-3 text-xs font-semibold text-jl-fg-3 uppercase tracking-wider text-right">Última hora</th>
                  <th className="px-4 py-3 text-xs font-semibold text-jl-fg-3 uppercase tracking-wider text-right">p50</th>
                  <th className="px-4 py-3 text-xs font-semibold text-jl-fg-3 uppercase tracking-wider text-right">p95</th>
                  <th className="px-4 py-3 text-xs font-semibold text-jl-fg-3 uppercase tracking-wider text-right">Operadores</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-jl-border-1">
                {d.metricas.map((row) => (
                  <tr key={row.event} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-jl-fg-2">{row.event}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-jl-fg-1">{row.total}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-jl-fg-3">{row.ultima_hora}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-jl-fg-3">{formatMs(row.p50_ms)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-jl-fg-3">{formatMs(row.p95_ms)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-jl-fg-3">{row.operadores_unicos}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Próximas ações baseadas em dados */}
      <section className="dragon-glass-card border border-jl-border-1 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-jl-fg-1 mb-3 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-jl-accent" />
          Interpretação
        </h2>
        <ul className="space-y-2 text-sm text-jl-fg-2">
          <li>
            <span className="font-medium">double_click_blocked alto</span>
            {' '}→ operadores frustrados com latência percebida → melhorar spinner/feedback visual.
          </li>
          <li>
            <span className="font-medium">finalize_timeout alto</span>
            {' '}→ problema de rede ou RPC lento → investigar logs do Supabase, não o frontend.
          </li>
          <li>
            <span className="font-medium">finalize_retry alto</span>
            {' '}→ instabilidade real de rede → retentativas com mesmo UUID são seguras (idempotência ativa).
          </li>
          <li>
            <span className="font-medium">cross_tab_detected &gt; 0</span>
            {' '}→ evidência concreta para implementar lock cross-tab (BroadcastChannel). Sem dados = overengineering.
          </li>
          <li>
            <span className="font-medium">venda_reconciled_after_timeout &gt; 0</span>
            {' '}→ próxima prioridade: feedback operacional mais claro que "venda salva, verifique antes de tentar de novo".
          </li>
          <li>
            <span className="font-medium">p95 &gt; 5s</span>
            {' '}→ operador sente travamento. Investigar: recalculo de itens no servidor, RPC, índices Postgres.
          </li>
        </ul>
      </section>
    </div>
  )
}
