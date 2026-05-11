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
import { obterDashboardResumo, type DashboardAtividadeTipo, type DashboardResumoDTO } from './actions'
import { getDashboardMetrics } from './dashboard-actions'
import { MetricCard } from '@/components/gerente/MetricCard'
import { DashboardHeader } from '@/components/gerente/DashboardHeader'
import { Sparkline } from '@/components/gerente/Sparkline'
import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import { getMessages } from '@/i18n/getMessages'
import { localeFromIdioma } from '@/lib/idioma/localeFromIdioma'
import { formatBRL, formatNumberLocale } from '@/lib/format/money'
import { formatDateTimeOrDash } from '@/lib/format/datetime'
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

function picoFaturamentoHora(serie: { faturamento: number }[]): number {
  if (serie.length === 0) return 0
  return Math.max(...serie.map((p) => p.faturamento), 0)
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
  serie_horaria_hoje: [],
  estoque_critico: [],
  atividades_recentes: [],
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

      <section
        aria-labelledby="dashboard-sparkline-heading"
        className="mt-8 rounded-lg border border-border bg-card p-5"
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 id="dashboard-sparkline-heading" className="text-sm font-semibold text-foreground">
              Faturamento por hora · hoje
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Curva acumulada do dia. Cada ponto representa o total faturado naquela hora.
            </p>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Pico</div>
            <div className="text-sm font-semibold text-foreground tabular-nums">
              {formatBRL(picoFaturamentoHora(resumo.serie_horaria_hoje), locale)}
            </div>
          </div>
        </div>
        <div className="mt-4">
          <Sparkline
            ariaLabel="Faturamento por hora hoje"
            points={resumo.serie_horaria_hoje.map((p) => ({ x: p.hora, y: p.faturamento }))}
          />
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
            <span>00h</span>
            <span>06h</span>
            <span>12h</span>
            <span>18h</span>
            <span>24h</span>
          </div>
        </div>
      </section>

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <section
          aria-labelledby="dashboard-estoque-heading"
          className="rounded-lg border border-border bg-card p-5"
        >
          <div className="flex items-center gap-2">
            <PackageX className="h-4 w-4 text-muted-foreground" aria-hidden />
            <h2 id="dashboard-estoque-heading" className="text-sm font-semibold text-foreground">
              Estoque crítico
            </h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Top 5 produtos com saldo igual ou abaixo do mínimo na sua loja.
          </p>
          {resumo.estoque_critico.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              Nenhum produto abaixo do mínimo no momento.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-border">
              {resumo.estoque_critico.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">{item.nome}</div>
                    {item.sku && (
                      <div className="truncate text-xs text-muted-foreground">{item.sku}</div>
                    )}
                  </div>
                  <div className="shrink-0 text-right tabular-nums">
                    <div className="text-sm font-semibold text-foreground">
                      {formatNumberLocale(item.quantidade_atual, locale)}
                      <span className="text-muted-foreground"> / {formatNumberLocale(item.estoque_minimo, locale)}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">déficit {formatNumberLocale(item.deficit, locale)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4">
            <Link
              href={painelGerencialHref('estoque')}
              className="text-xs font-medium text-foreground underline-offset-4 hover:underline"
            >
              Ver todos →
            </Link>
          </div>
        </section>

        <section
          aria-labelledby="dashboard-atividades-heading"
          className="rounded-lg border border-border bg-card p-5"
        >
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" aria-hidden />
            <h2 id="dashboard-atividades-heading" className="text-sm font-semibold text-foreground">
              Atividades recentes
            </h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Vendas, movimentos de estoque e caixa nas últimas 48h.
          </p>
          {resumo.atividades_recentes.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              Sem atividades registradas nas últimas 48h.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-border">
              {resumo.atividades_recentes.map((ativ, idx) => {
                const Icon = ATIVIDADE_ICON[ativ.tipo] ?? Receipt
                return (
                  <li key={`${ativ.data_hora}-${idx}`} className="flex items-start gap-3 py-3">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-foreground">{ativ.descricao}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground tabular-nums">
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
