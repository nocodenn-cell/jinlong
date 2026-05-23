import Link from 'next/link'
import {
  DollarSign,
  ShoppingCart,
  TrendingUp,
  Percent,
  AlertCircle,
  PackageX,
  Activity,
  Receipt,
  Boxes,
  Wallet,
} from 'lucide-react'
import { obterDashboardResumo } from './actions'
import type { DashboardAtividadeTipo, DashboardResumoDTO } from '@/lib/gerente/dashboardResumoTypes'
import { getDashboardMetrics } from './dashboard-actions'
import { MetricCard } from '@/components/gerente/MetricCard'
import { DashboardHeader } from '@/components/gerente/DashboardHeader'
import { Sparkline } from '@/components/gerente/Sparkline'
import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import { getMessages } from '@/i18n/getMessages'
import { localeFromIdioma } from '@/lib/idioma/localeFromIdioma'
import { formatBRL, formatNumberLocale } from '@/lib/format/money'
import { formatDateTimeOrDash } from '@/lib/format/datetime'
import { painelGerencialHref } from '@/lib/navigation/painelGerencialNav'
import { formatLinhaAtividade, interpolateTemplate } from '@/lib/gerente/formatDashboardAtividade'
import { GerentePageZone } from '@/components/gerente/GerentePageZone'

export const revalidate = 30

function getVariacaoPercentual(hoje: number, ontem: number): number {
  if (ontem > 0) return ((hoje - ontem) / ontem) * 100
  if (hoje > 0) return 100
  return 0
}

function picoFaturamentoHora(serie: { faturamento: number }[]): number {
  if (serie.length === 0) return 0
  return Math.max(...serie.map((p) => p.faturamento), 0)
}

const ZERO_RESUMO: DashboardResumoDTO = {
  tz: 'America/Sao_Paulo',
  hoje: '',
  ontem: '',
  inicio_semana_atual: null,
  inicio_semana_anterior: null,
  faturamento_hoje: 0,
  faturamento_ontem: 0,
  quantidade_vendas_hoje: 0,
  quantidade_vendas_ontem: 0,
  ticket_medio_hoje: 0,
  ticket_medio_ontem: 0,
  faturamento_semana_atual: 0,
  faturamento_semana_anterior: 0,
  quantidade_vendas_semana_atual: 0,
  quantidade_vendas_semana_anterior: 0,
  ticket_medio_semana_atual: 0,
  ticket_medio_semana_anterior: 0,
  margem_estimada: null,
  cobertura_custo: 0,
  custo_confiavel: false,
  serie_horaria_hoje: [],
  estoque_critico: [],
  atividades_recentes: [],
  produto_mais_vendido: 'Nenhum hoje (0 un)',
}

const ATIVIDADE_ICON: Record<DashboardAtividadeTipo, typeof Receipt> = {
  VENDA: Receipt,
  ESTOQUE: Boxes,
  CAIXA: Wallet,
}

export default async function GerenteInicioPage() {
  const { idioma, perfil } = await getUsuarioIdioma()
  const m = getMessages(idioma)
  const locale = localeFromIdioma(idioma)
  const di = m.gerente.dashboard_inicio

  const [resumoResult, headerMetrics] = await Promise.all([
    obterDashboardResumo(),
    getDashboardMetrics(),
  ])

  const resumo: DashboardResumoDTO = resumoResult.ok ? resumoResult.data : ZERO_RESUMO
  const erroResumo = resumoResult.ok ? null : resumoResult.error

  const variacaoFaturamento = getVariacaoPercentual(
    resumo.faturamento_hoje,
    resumo.faturamento_ontem,
  )
  const variacaoTicket = getVariacaoPercentual(
    resumo.ticket_medio_hoje,
    resumo.ticket_medio_ontem,
  )
  const variacaoVendas = getVariacaoPercentual(
    resumo.quantidade_vendas_hoje,
    resumo.quantidade_vendas_ontem,
  )

  const variacaoSemFat = getVariacaoPercentual(
    resumo.faturamento_semana_atual,
    resumo.faturamento_semana_anterior,
  )
  const variacaoSemVendas = getVariacaoPercentual(
    resumo.quantidade_vendas_semana_atual,
    resumo.quantidade_vendas_semana_anterior,
  )
  const variacaoSemTicket = getVariacaoPercentual(
    resumo.ticket_medio_semana_atual,
    resumo.ticket_medio_semana_anterior,
  )

  const margemRotulo =
    resumo.custo_confiavel && resumo.margem_estimada !== null
      ? formatBRL(resumo.margem_estimada, locale)
      : m.relatorios.kpi_margem_indisponivel

  return (
    <div className="mx-auto max-w-7xl px-4 pb-10 pt-8 sm:px-6 sm:pb-12 lg:px-8 lg:pb-14">
      <DashboardHeader
        m={m}
        documentosFiscaisPendentes={headerMetrics.documentosFiscaisPendentes}
      />

      {erroResumo && (
        <div
          role="alert"
          className="mt-6 flex items-start gap-3 rounded-lg dragon-glass-card p-4 text-sm text-jl-fg-3"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-jl-fg-1" aria-hidden />
          <div>
            <div className="font-medium text-jl-fg-1">{di.erro_kpis_titulo}</div>
            <div className="mt-1">{erroResumo}</div>
          </div>
        </div>
      )}

      <GerentePageZone kind="kpi-critico" className="mt-8">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            tier={1}
            title={di.kpi_faturamento_hoje}
            value={formatBRL(resumo.faturamento_hoje, locale)}
            icon={DollarSign}
            trend={{
              value: Number(variacaoFaturamento.toFixed(1)),
              isPositive: variacaoFaturamento >= 0,
            }}
          />
          <MetricCard
            tier={1}
            title={di.kpi_ticket_hoje}
            value={formatBRL(resumo.ticket_medio_hoje, locale)}
            icon={TrendingUp}
            trend={{
              value: Number(variacaoTicket.toFixed(1)),
              isPositive: variacaoTicket >= 0,
            }}
          />
          <MetricCard
            tier={1}
            title={di.kpi_vendas_hoje}
            value={formatNumberLocale(resumo.quantidade_vendas_hoje, locale)}
            icon={ShoppingCart}
            trend={{
              value: Number(variacaoVendas.toFixed(1)),
              isPositive: variacaoVendas >= 0,
            }}
          />
          <MetricCard tier={1} title={di.kpi_margem_hoje} value={margemRotulo} icon={Percent} />
        </div>
        <p className="mt-2 text-xs text-jl-fg-3">{m.gerente.vs_dia_anterior}</p>
      </GerentePageZone>

      <GerentePageZone kind="kpi-oper" aria-labelledby="dashboard-semana-heading">
        <h2 id="dashboard-semana-heading" className="text-sm font-semibold text-jl-fg-1">
          {di.secao_semana_titulo}
        </h2>
        <p className="mt-1 text-xs text-jl-fg-3">{di.secao_semana_subtitulo}</p>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          <MetricCard
            tier={2}
            title={di.kpi_faturamento_semana}
            value={formatBRL(resumo.faturamento_semana_atual, locale)}
            icon={DollarSign}
            trend={{
              value: Number(variacaoSemFat.toFixed(1)),
              isPositive: variacaoSemFat >= 0,
            }}
          />
          <MetricCard
            tier={2}
            title={di.kpi_vendas_semana}
            value={formatNumberLocale(resumo.quantidade_vendas_semana_atual, locale)}
            icon={ShoppingCart}
            trend={{
              value: Number(variacaoSemVendas.toFixed(1)),
              isPositive: variacaoSemVendas >= 0,
            }}
          />
          <MetricCard
            tier={2}
            title={di.kpi_ticket_semana}
            value={formatBRL(resumo.ticket_medio_semana_atual, locale)}
            icon={TrendingUp}
            trend={{
              value: Number(variacaoSemTicket.toFixed(1)),
              isPositive: variacaoSemTicket >= 0,
            }}
          />
        </div>
        <p className="mt-2 text-xs text-jl-fg-3">{m.gerente.vs_semana_anterior}</p>
      </GerentePageZone>

      <section
        aria-labelledby="dashboard-sparkline-heading"
        className="mt-8 rounded-xl dragon-glass-card p-5"
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 id="dashboard-sparkline-heading" className="text-sm font-semibold text-jl-fg-1">
              {di.sparkline_titulo}
            </h2>
            <p className="mt-1 text-xs text-jl-fg-3">{di.sparkline_subtitulo}</p>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-jl-fg-3">{di.sparkline_pico}</div>
            <div className="text-sm font-semibold text-jl-fg-1 tabular-nums">
              {formatBRL(picoFaturamentoHora(resumo.serie_horaria_hoje), locale)}
            </div>
          </div>
        </div>
        <div className="mt-4">
          <Sparkline
            ariaLabel={di.sparkline_aria}
            points={resumo.serie_horaria_hoje.map((p) => ({ x: p.hora, y: p.faturamento }))}
          />
          <div className="mt-1 flex justify-between text-[10px] text-jl-fg-3">
            <span>{di.sparkline_eixo_00}</span>
            <span>{di.sparkline_eixo_06}</span>
            <span>{di.sparkline_eixo_12}</span>
            <span>{di.sparkline_eixo_18}</span>
            <span>{di.sparkline_eixo_24}</span>
          </div>
        </div>
      </section>

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <section
          aria-labelledby="dashboard-estoque-heading"
          className="rounded-xl dragon-glass-card p-5"
        >
          <div className="flex items-center gap-2">
            <PackageX className="h-4 w-4 text-jl-fg-3" aria-hidden />
            <h2 id="dashboard-estoque-heading" className="text-sm font-semibold text-jl-fg-1">
              {di.estoque_critico_titulo}
            </h2>
          </div>
          <p className="mt-1 text-xs text-jl-fg-3">{di.estoque_critico_subtitulo}</p>
          {resumo.estoque_critico.length === 0 ? (
            <p className="mt-4 text-sm text-jl-fg-3">{di.estoque_critico_empty}</p>
          ) : (
            <ul className="mt-4 divide-y divide-jl-border-1">
              {resumo.estoque_critico.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-jl-fg-1">{item.nome}</div>
                    {item.sku && (
                      <div className="truncate text-xs text-jl-fg-3">{item.sku}</div>
                    )}
                  </div>
                  <div className="shrink-0 text-right tabular-nums">
                    <div className="text-sm font-semibold text-jl-fg-1">
                      {formatNumberLocale(item.quantidade_atual, locale)}
                      <span className="text-jl-fg-3">
                        {' '}
                        / {formatNumberLocale(item.estoque_minimo, locale)}
                      </span>
                    </div>
                    <div className="text-xs text-jl-fg-3">
                      {interpolateTemplate(di.estoque_critico_deficit, {
                        valor: formatNumberLocale(item.deficit, locale),
                      })}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4">
            <Link
              href={painelGerencialHref('estoque')}
              className="text-xs font-medium text-jl-fg-2 underline-offset-4 hover:underline"
            >
              {di.estoque_critico_ver_todos} →
            </Link>
          </div>
        </section>

        <section
          aria-labelledby="dashboard-atividades-heading"
          className="rounded-xl dragon-glass-card p-5"
        >
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-jl-fg-3" aria-hidden />
            <h2 id="dashboard-atividades-heading" className="text-sm font-semibold text-jl-fg-1">
              {di.atividades_titulo}
            </h2>
          </div>
          <p className="mt-1 text-xs text-jl-fg-3">{di.atividades_subtitulo}</p>
          {resumo.atividades_recentes.length === 0 ? (
            <p className="mt-4 text-sm text-jl-fg-3">{di.atividades_empty}</p>
          ) : (
            <ul className="mt-4 divide-y divide-jl-border-1">
              {resumo.atividades_recentes.map((ativ, idx) => {
                const Icon = ATIVIDADE_ICON[ativ.tipo] ?? Receipt
                const linha = formatLinhaAtividade(di, locale, ativ)
                return (
                  <li key={`${ativ.data_hora}-${idx}`} className="flex items-start gap-3 py-3">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-jl-fg-3" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-jl-fg-1">{linha}</div>
                      <div className="mt-0.5 text-xs text-jl-fg-3 tabular-nums">
                        {formatDateTimeOrDash(ativ.data_hora, locale)}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>

      {perfil === 'DONO' && (
        <div className="mt-10">
          <h2 className="text-lg font-semibold text-jl-fg-1">{m.gerente.secao_dono_titulo}</h2>
          <p className="mt-2 text-sm text-jl-fg-3">{m.gerente.secao_dono_subtitulo}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Link
              href="/admin/dashboard"
              className="block rounded-xl border border-white/[0.07] dragon-glass-card p-4 transition-colors hover:bg-white/[0.05]"
            >
              <div className="text-sm font-semibold text-jl-fg-1">{m.gerente.secao_dono_admin_titulo}</div>
              <div className="mt-1 text-xs text-jl-fg-3">{m.gerente.secao_dono_admin_desc}</div>
            </Link>
            <Link
              href={painelGerencialHref('financeiro')}
              className="block rounded-xl border border-white/[0.07] dragon-glass-card p-4 transition-colors hover:bg-white/[0.05]"
            >
              <div className="text-sm font-semibold text-jl-fg-1">{m.gerente.secao_dono_fin_titulo}</div>
              <div className="mt-1 text-xs text-jl-fg-3">{m.gerente.secao_dono_fin_desc}</div>
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
