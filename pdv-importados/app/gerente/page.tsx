import Link from 'next/link'
import { DollarSign, ShoppingCart, TrendingUp, Percent, AlertCircle } from 'lucide-react'
import { obterDashboardResumo, type DashboardResumoDTO } from './actions'
import { getDashboardMetrics } from './dashboard-actions'
import { MetricCard } from '@/components/gerente/MetricCard'
import { DashboardHeader } from '@/components/gerente/DashboardHeader'
import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import { getMessages } from '@/i18n/getMessages'
import { localeFromIdioma } from '@/lib/idioma/localeFromIdioma'
import { formatBRL, formatNumberLocale } from '@/lib/format/money'
import {
  gerenteInicioAtalhoKeys,
  gerenteNavLabel,
  painelGerencialHref,
} from '@/lib/navigation/painelGerencialNav'

// Revalida o snapshot dos KPIs no máximo a cada 30s. `unstable_cache` foi
// preterido aqui porque a RPC depende do JWT do usuário (cookies), e funções
// embrulhadas em `unstable_cache` rodam fora do contexto de request.
export const revalidate = 30

function getVariacaoPercentual(hoje: number, ontem: number): number {
  if (ontem > 0) return ((hoje - ontem) / ontem) * 100
  if (hoje > 0) return 100
  return 0
}

const ZERO_RESUMO: DashboardResumoDTO = {
  tz: 'America/Sao_Paulo',
  hoje: '',
  ontem: '',
  faturamento_hoje: 0,
  faturamento_ontem: 0,
  quantidade_vendas_hoje: 0,
  quantidade_vendas_ontem: 0,
  ticket_medio_hoje: 0,
  ticket_medio_ontem: 0,
  margem_estimada: null,
  cobertura_custo: 0,
  custo_confiavel: false,
}

export default async function GerenteInicioPage() {
  const { idioma, perfil } = await getUsuarioIdioma()
  const m = getMessages(idioma)
  const locale = localeFromIdioma(idioma)

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

  const atalhos = gerenteInicioAtalhoKeys(false).map((key) => ({
    href: painelGerencialHref(key),
    label: gerenteNavLabel(m, key),
  }))

  const margemRotulo = resumo.custo_confiavel && resumo.margem_estimada !== null
    ? formatBRL(resumo.margem_estimada, locale)
    : m.relatorios.kpi_margem_indisponivel

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <DashboardHeader
        m={m}
        documentosFiscaisPendentes={headerMetrics.documentosFiscaisPendentes}
      />

      {erroResumo && (
        <div
          role="alert"
          className="mt-6 flex items-start gap-3 rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-foreground" aria-hidden />
          <div>
            <div className="font-medium text-foreground">Não foi possível carregar os KPIs</div>
            <div className="mt-1">{erroResumo}</div>
          </div>
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Faturamento Hoje"
          value={formatBRL(resumo.faturamento_hoje, locale)}
          icon={DollarSign}
          trend={{
            value: Number(variacaoFaturamento.toFixed(1)),
            isPositive: variacaoFaturamento >= 0,
          }}
        />

        <MetricCard
          title="Ticket Médio Hoje"
          value={formatBRL(resumo.ticket_medio_hoje, locale)}
          icon={TrendingUp}
          trend={{
            value: Number(variacaoTicket.toFixed(1)),
            isPositive: variacaoTicket >= 0,
          }}
        />

        <MetricCard
          title="Vendas Hoje"
          value={formatNumberLocale(resumo.quantidade_vendas_hoje, locale)}
          icon={ShoppingCart}
          trend={{
            value: Number(variacaoVendas.toFixed(1)),
            isPositive: variacaoVendas >= 0,
          }}
        />

        <MetricCard
          title="Margem Estimada Hoje"
          value={margemRotulo}
          icon={Percent}
        />
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        {m.gerente.vs_dia_anterior}
      </p>

      <div className="mt-10">
        <h2 className="text-lg font-semibold text-foreground">{m.gerente.atalhos_modulos}</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {atalhos.map((atalho) => (
            <Link
              key={atalho.href}
              href={atalho.href}
              className="block rounded-lg border border-border bg-card p-4 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              {atalho.label}
            </Link>
          ))}
        </div>
      </div>

      {perfil === 'DONO' && (
        <div className="mt-10">
          <h2 className="text-lg font-semibold text-foreground">{m.gerente.secao_dono_titulo}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{m.gerente.secao_dono_subtitulo}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Link
              href="/admin/dashboard"
              className="block rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <div className="text-sm font-semibold text-foreground">{m.gerente.secao_dono_admin_titulo}</div>
              <div className="mt-1 text-xs text-muted-foreground">{m.gerente.secao_dono_admin_desc}</div>
            </Link>
            <Link
              href={painelGerencialHref('financeiro')}
              className="block rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <div className="text-sm font-semibold text-foreground">{m.gerente.secao_dono_fin_titulo}</div>
              <div className="mt-1 text-xs text-muted-foreground">{m.gerente.secao_dono_fin_desc}</div>
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
