'use client'

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

type Props = {
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
}: Props) {
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
      label: 'Faturamento',
      value: formatBRL(faturamento, locale),
      icon: 'dollar-sign',
      tone: 'gold',
    },
    {
      id: 'vendas',
      label: 'Vendas concluidas',
      value: String(resumo.vendas_concluidas),
      icon: 'shopping-bag',
      tone: 'success',
    },
    {
      id: 'cancel',
      label: 'Taxa cancelamento',
      value: formatarPercentual(resumo.taxa_cancelamento, locale),
      icon: 'x-circle',
      tone: resumo.taxa_cancelamento > 0.05 ? 'danger' : 'gold',
      deltaPositiveIsGood: false,
    },
    {
      id: 'div-caixa',
      label: 'Caixas com divergencia',
      value: String(caixasResumo?.comDiferenca ?? '—'),
      icon: 'alert-circle',
      tone: (caixasResumo?.comDiferenca ?? 0) > 0 ? 'warning' : 'success',
      href: ROUTES.admin.caixas,
      hint: 'Abrir auditoria operacional de caixas',
    },
  ]

  return (
    <div data-testid="exec-vendas-caixas" className="admin-v2-stack">
      <DashboardGrid
        kpis={<KpiStrip items={kpis} />}
        main={
          <>
            <ChartCard title="Vendas por hora do dia">
              {vendasErro ? (
                <EmptyState title={vendasErro} className="py-8" />
              ) : pico == null ? (
                <EmptyState title="Sem vendas concluidas no periodo" className="py-8" />
              ) : (
                <div className="space-y-2">
                  <p className="text-caption text-fg-subtle">
                    Pico: <strong className="text-fg">{pico.label}</strong> ·{' '}
                    {formatBRL(pico.total, locale)} ({pico.count} vendas)
                  </p>
                  <ul className="flex h-40 items-end gap-0.5" aria-label="Barras por hora">
                    {buckets.map((b) => (
                      <li key={b.hour} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                        <div
                          className="w-full rounded-t bg-[var(--color-brand-primary)]/80"
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

            <SectionCard title="Transacoes do periodo">
              {vendasErro ? (
                <EmptyState title={vendasErro} className="py-6" />
              ) : (
                <DenseDataTable
                  caption="Transacoes"
                  rows={vendas.slice(0, 50)}
                  rowKey={(r) => r.id}
                  empty={<EmptyState title="Nenhuma venda no periodo" className="py-6" />}
                  columns={[
                    {
                      id: 'quando',
                      header: 'Data',
                      cell: (r) => formatDateTimeOrDash(r.data, locale, 'short'),
                    },
                    {
                      id: 'op',
                      header: 'Operador',
                      cell: (r) => r.vendedor_nome ?? '—',
                    },
                    {
                      id: 'pag',
                      header: 'Pagamento',
                      cell: (r) => r.forma_pagamento ?? '—',
                    },
                    {
                      id: 'status',
                      header: 'Status',
                      cell: (r) => (
                        <StatusBadge tone={r.status === 'CANCELADA' ? 'danger' : 'success'}>
                          {r.status === 'CANCELADA' ? 'Cancelada' : 'Concluida'}
                        </StatusBadge>
                      ),
                    },
                    {
                      id: 'valor',
                      header: 'Valor',
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
              title="Auditoria de caixas"
              subtitle="Sistema vs contado (fechamentos do periodo)"
            >
              {caixasErro ? (
                <p className="text-small text-[var(--color-danger-strong)]">{caixasErro}</p>
              ) : null}
              <div className="mb-3 flex flex-wrap gap-2 text-caption">
                <StatusBadge tone="neutral">
                  Fechados hoje: {caixasResumo?.fechadosHoje ?? '—'}
                </StatusBadge>
                <StatusBadge tone={(caixasResumo?.comDiferenca ?? 0) > 0 ? 'warning' : 'success'}>
                  Com divergencia: {caixasResumo?.comDiferenca ?? '—'}
                </StatusBadge>
              </div>
              <DenseDataTable
                caption="Caixas fechados"
                rows={caixasLinhas.slice(0, 12)}
                rowKey={(r) => r.id}
                empty={
                  <p className="text-small text-fg-subtle">
                    Nenhum fechamento no recorte.{' '}
                    <Link href={ROUTES.admin.caixas} className="underline">
                      Abrir Caixas
                    </Link>
                  </p>
                }
                columns={[
                  { id: 'op', header: 'Operador', cell: (r) => r.operadorNome },
                  {
                    id: 'sis',
                    header: 'Sistema',
                    numeric: true,
                    cell: (r) => formatBRL(r.valorSistema, locale),
                  },
                  {
                    id: 'cont',
                    header: 'Contado',
                    numeric: true,
                    cell: (r) => formatBRL(r.valorContado, locale),
                  },
                  {
                    id: 'diff',
                    header: 'Diverg.',
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
                Ver historico completo
              </Link>
            </SectionCard>

            {selected ? (
              <aside
                className="rounded-card border border-[var(--color-border)] p-3"
                data-testid="exec-venda-drawer"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="text-small font-semibold">Detalhe do pedido</h3>
                  <button
                    type="button"
                    className="text-caption text-fg-subtle underline"
                    onClick={() => setSelectedId(null)}
                  >
                    Fechar
                  </button>
                </div>
                <dl className="space-y-1.5 text-small">
                  <div className="flex justify-between gap-2">
                    <dt className="text-fg-subtle">ID</dt>
                    <dd className="tabular-nums">{selected.id.slice(0, 8)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-fg-subtle">Cliente</dt>
                    <dd>{selected.cliente_nome ?? '—'}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-fg-subtle">Operador</dt>
                    <dd>{selected.vendedor_nome ?? '—'}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-fg-subtle">Valor</dt>
                    <dd className="tabular-nums font-medium">
                      {formatBRL(selected.total_liquido, locale)}
                    </dd>
                  </div>
                </dl>
                <Link
                  href={adminVendaDetalheQuery(selected.id)}
                  className="mt-3 inline-block text-small font-medium text-brand underline-offset-2 hover:underline"
                >
                  Abrir ficha completa
                </Link>
              </aside>
            ) : (
              <p className="text-caption text-fg-subtle">
                Clique no valor de uma transacao para ver o resumo lateral.
              </p>
            )}
          </>
        }
      />
    </div>
  )
}
