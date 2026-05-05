import Link from 'next/link'
import { DollarSign, ShoppingCart, FileText, TrendingUp, AlertCircle } from 'lucide-react'
import { getDashboardMetrics } from './dashboard-actions'
import { MetricCard } from '@/components/gerente/MetricCard'
import { DashboardHeader } from '@/components/gerente/DashboardHeader'
import { getUsuarioIdioma } from '@/idioma/usuarioIdioma'
import { getMessages } from '@/i18n/getMessages'
import { localeFromIdioma } from '@/lib/idioma/localeFromIdioma'
import { formatBRL } from '@/lib/format/money'
import {
  gerenteInicioAtalhoKeys,
  gerenteNavLabel,
  painelGerencialHref,
} from '@/lib/navigation/painelGerencialNav'

export default async function GerenteInicioPage() {
  const { idioma, perfil } = await getUsuarioIdioma()
  const m = getMessages(idioma)
  const locale = localeFromIdioma(idioma)
  
  // Buscar métricas do dashboard
  const metrics = await getDashboardMetrics()
  
  const atalhos = gerenteInicioAtalhoKeys(false).map((key) => ({
    href: painelGerencialHref(key),
    label: gerenteNavLabel(m, key),
  }))

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header com título e botão fiscal */}
      <DashboardHeader 
        m={m} 
        documentosFiscaisPendentes={metrics.documentosFiscaisPendentes} 
      />

      {/* Grid de cards de métricas */}
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Faturamento Hoje"
          value={formatBRL(metrics.faturamentoHoje, locale)}
          icon={DollarSign}
          trend={{
            value: 12.5, // TODO: calcular tendência real
            isPositive: true,
          }}
        />
        
        <MetricCard
          title="Ticket Médio Hoje"
          value={formatBRL(metrics.ticketMedioHoje, locale)}
          icon={TrendingUp}
          trend={{
            value: 8.3, // TODO: calcular tendência real
            isPositive: true,
          }}
        />
        
        <MetricCard
          title="Quantidade de Vendas Hoje"
          value={metrics.quantidadeVendasHoje}
          icon={ShoppingCart}
          trend={{
            value: -3.2, // TODO: calcular tendência real
            isPositive: false,
          }}
        />
        
        <MetricCard
          title="Títulos em Aberto"
          value={formatBRL(metrics.titulosEmAberto, locale)}
          icon={FileText}
        />
      </div>

      {/* Alerta para documentos fiscais pendentes */}
      {metrics.documentosFiscaisPendentes > 0 && (
        <div className="mt-6 rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-800 dark:bg-yellow-900/20">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-500" />
            <div>
              <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-300">
                Documentos Fiscais Pendentes
              </h3>
              <p className="mt-1 text-sm text-yellow-700 dark:text-yellow-400">
                Existem {metrics.documentosFiscaisPendentes} documentos aguardando processamento.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Seção de atalhos */}
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

      {/* Seção para perfil DONO */}
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
