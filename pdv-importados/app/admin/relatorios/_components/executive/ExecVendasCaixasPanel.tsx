'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import {
  ChartCard,
  DashboardGrid,
  DenseDataTable,
  KpiStrip,
  SectionCard,
  StatusBadge,
  type KpiStripItem,
} from '@/components/ui/admin-v2'
import { EmptyState } from '@/components/ui/feedback'
import { formatBRL } from '@/lib/format/money'
import { formatDateTimeOrDash } from '@/lib/format/datetime'
import { ROUTES, adminVendaDetalheQuery } from '@/lib/navigation/routes'
import type { VendaReportRow } from '@/app/gerente/relatorios/vendas/actions'
import type { RelatorioResumoExecutivoDTO } from '@/app/gerente/relatorios/actions'
import type { CaixaHistoricoLinha } from '@/app/gerente/caixas/caixasHistorico'
import type { ResumoCaixas } from '@/app/gerente/caixas/actions'
import { formatarPercentual } from '@/lib/vendas/metricasVendas'
import { agruparVendasPorHora, picoDeVendas } from './vendasPorHora'
import { useExecT } from '@/lib/i18n/useExecT'

type Props = {
  /** Seções migradas do relatório clássico (UX-IA-01 D1/D2); ausentes em testes. */
  extra?: ReactNode
  vendas: readonly VendaReportRow[]
  vendasErro: string | null
  resumo: RelatorioResumoExecutivoDTO
  faturamento: number
  locale: string
  tzRelatorio: string
  caixasResumo?: ResumoCaixas | null
  caixasLinhas?: readonly CaixaHistoricoLinha[]
  caixasErro?: string | null
}

function tomDivergencia(diferenca: number): 'success' | 'warning' | 'danger' {
  if (Math.abs(diferenca) < 0.01) return 'success'
  if (Math.abs(diferenca) < 10) return 'warning'
  return 'danger'
}

/**
 * Aba 2 — Vendas & Operações de Caixa (BI).
 */
export function ExecVendasCaixasPanel({
  vendas,
  vendasErro,
  resumo,
  faturamento,
  locale,
  tzRelatorio,
  caixasResumo,
  caixasLinhas = [],
  caixasErro,
  extra,
}: Props) {
  const t = useExecT()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = useMemo(
    () => vendas.find((v) => v.id === selectedId) ?? null,
    [vendas, selectedId],
  )

  const buckets = useMemo(
    () => agruparVendasPorHora(vendas, tzRelatorio),
    [vendas, tzRelatorio],
  )
  const pico = picoDeVendas(buckets)
  const maxHourTotal = Math.max(...buckets.map((b) => b.total), 1)

  const kpis: KpiStripItem[] = [
    {
      id: 'fat',
      label: t('vc.kpi_fat'),
      value: formatBRL(faturamento, locale),
      icon: 'dollar-sign',
      tone: 'gold',
    },
    {
      id: 'vendas',
      label: t('vc.kpi_vendas'),
      value: String(resumo.vendas_concluidas),
      icon: 'shopping-bag',
      tone: 'success',
    },
    {
      id: 'cancel',
      label: t('vc.kpi_cancel'),
      value: formatarPercentual(resumo.taxa_cancelamento, locale),
      icon: 'x-circle',
      tone: resumo.taxa_cancelamento > 0.05 ? 'danger' : 'gold',
      deltaPositiveIsGood: false,
    },
    {
      id: 'div-caixa',
      label: t('vc.kpi_divcaixa'),
      value: String(caixasResumo?.comDiferenca ?? '—'),
      icon: 'alert-circle',
      tone: (caixasResumo?.comDiferenca ?? 0) > 0 ? 'warning' : 'success',
      href: ROUTES.admin.caixas,
      hint: t('vc.kpi_divcaixa_hint'),
    },
  ]

  return (
    <div data-testid="exec-vendas-caixas" className="admin-v2-stack">
      {extra}
      <DashboardGrid
        kpis={<KpiStrip items={kpis} />}
        main={
          <>
            <ChartCard title={t('vc.chart_hora')}>
              {vendasErro ? (
                <EmptyState title={vendasErro} className="py-8" />
              ) : pico == null ? (
                <EmptyState title={t('vc.sem_vendas')} className="py-8" />
              ) : (
                <div className="space-y-2">
                  <p className="text-caption text-fg-subtle">
                    {t('vc.pico')}: <strong className="text-fg">{pico.label}</strong> ·{' '}
                    {formatBRL(pico.total, locale)} {t('vc.pico_vendas', { n: pico.count })}
                  </p>
                  <ul className="flex h-40 items-end gap-0.5" aria-label={t('vc.aria_barras')}>
                    {buckets.map((b) => (
                      <li key={b.hour} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                        <div
                          className="w-full rounded-t bg-[color-mix(in_srgb,var(--color-brand-primary)_80%,transparent)]"
                          style={{ height: `${Math.max(4, (b.total / maxHourTotal) * 100)}%` }}
                          title={`${b.label}: ${formatBRL(b.total, locale)}`}
                        />
                        {b.hour % 3 === 0 ? (
                          <span className="text-[9px] text-fg-subtle">{b.hour}</span>
                        ) : (
                          <span className="text-[9px] text-transparent">·</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </ChartCard>

            <SectionCard title={t('vc.sec_transacoes')}>
              {vendasErro ? (
                <EmptyState title={vendasErro} className="py-6" />
              ) : (
                <DenseDataTable
                  caption={t('vc.cap_transacoes')}
                  rows={vendas.slice(0, 50)}
                  rowKey={(r) => r.id}
                  empty={<EmptyState title={t('vc.empty_transacoes')} className="py-6" />}
                  columns={[
                    {
                      id: 'quando',
                      header: t('com.data'),
                      cell: (r) => formatDateTimeOrDash(r.data, locale, 'short'),
                    },
                    {
                      id: 'cliente',
                      header: t('com.cliente'),
                      cell: (r) => r.cliente_nome ?? '—',
                    },
                    {
                      id: 'op',
                      header: t('com.operador'),
                      cell: (r) => r.vendedor_nome ?? '—',
                    },
                    {
                      id: 'pag',
                      header: t('vc.col_pagamento'),
                      cell: (r) => r.forma_pagamento ?? '—',
                    },
                    {
                      id: 'status',
                      header: t('com.status'),
                      cell: (r) => (
                        <StatusBadge tone={r.status === 'CANCELADA' ? 'danger' : 'success'}>
                          {r.status === 'CANCELADA' ? t('vc.st_cancelada') : t('vc.st_concluida')}
                        </StatusBadge>
                      ),
                    },
                    {
                      id: 'valor',
                      header: t('com.valor'),
                      numeric: true,
                      cell: (r) => (
                        <button
                          type="button"
                          className="underline-offset-2 hover:underline"
                          onClick={() => setSelectedId(r.id)}
                        >
                          {formatBRL(r.total_liquido, locale)}
                        </button>
                      ),
                    },
                  ]}
                />
              )}
            </SectionCard>
          </>
        }
        side={
          <>
            <SectionCard
              title={t('vc.sec_caixas')}
              subtitle={t('vc.sec_caixas_sub')}
            >
              {caixasErro ? (
                <p className="text-small text-[var(--color-danger-strong)]">{caixasErro}</p>
              ) : null}
              <div className="mb-3 flex flex-wrap gap-2 text-caption">
                <StatusBadge tone="neutral">
                  {t('vc.fechados_hoje', { n: caixasResumo?.fechadosHoje ?? '—' })}
                </StatusBadge>
                <StatusBadge tone={(caixasResumo?.comDiferenca ?? 0) > 0 ? 'warning' : 'success'}>
                  {t('vc.com_div', { n: caixasResumo?.comDiferenca ?? '—' })}
                </StatusBadge>
              </div>
              <DenseDataTable
                caption={t('vc.cap_caixas')}
                rows={caixasLinhas.slice(0, 12)}
                rowKey={(r) => r.id}
                empty={
                  <p className="text-small text-fg-subtle">
                    {t('vc.empty_caixas')}{' '}
                    <Link href={ROUTES.admin.caixas} className="underline">
                      {t('vc.abrir_caixas')}
                    </Link>
                  </p>
                }
                columns={[
                  { id: 'op', header: t('com.operador'), cell: (r) => r.operadorNome },
                  {
                    id: 'sis',
                    header: t('vc.col_sistema'),
                    numeric: true,
                    cell: (r) => formatBRL(r.valorSistema, locale),
                  },
                  {
                    id: 'cont',
                    header: t('vc.col_contado'),
                    numeric: true,
                    cell: (r) => formatBRL(r.valorContado, locale),
                  },
                  {
                    id: 'diff',
                    header: t('vc.col_diverg'),
                    numeric: true,
                    cell: (r) => (
                      <StatusBadge tone={tomDivergencia(r.diferenca)}>
                        {formatBRL(r.diferenca, locale)}
                      </StatusBadge>
                    ),
                  },
                ]}
              />
              <Link
                href={ROUTES.admin.caixas}
                className="mt-3 inline-block text-small font-medium text-brand underline-offset-2 hover:underline"
              >
                {t('vc.ver_historico')}
              </Link>
            </SectionCard>

            {selected ? (
              <aside
                className="rounded-card border border-[var(--color-border)] p-3"
                data-testid="exec-venda-drawer"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="text-small font-semibold">{t('vc.det_pedido')}</h3>
                  <button
                    type="button"
                    className="text-caption text-fg-subtle underline"
                    onClick={() => setSelectedId(null)}
                  >
                    {t('com.fechar')}
                  </button>
                </div>
                <dl className="space-y-1.5 text-small">
                  <div className="flex justify-between gap-2">
                    <dt className="text-fg-subtle">ID</dt>
                    <dd className="tabular-nums">{selected.id.slice(0, 8)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-fg-subtle">{t('com.cliente')}</dt>
                    <dd>{selected.cliente_nome ?? '—'}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-fg-subtle">{t('com.operador')}</dt>
                    <dd>{selected.vendedor_nome ?? '—'}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-fg-subtle">{t('com.valor')}</dt>
                    <dd className="tabular-nums font-medium">
                      {formatBRL(selected.total_liquido, locale)}
                    </dd>
                  </div>
                </dl>
                <Link
                  href={adminVendaDetalheQuery(selected.id)}
                  className="mt-3 inline-block text-small font-medium text-brand underline-offset-2 hover:underline"
                >
                  {t('vc.abrir_ficha')}
                </Link>
              </aside>
            ) : (
              <p className="text-caption text-fg-subtle">
                {t('vc.clique_valor')}
              </p>
            )}
          </>
        }
      />
    </div>
  )
}
