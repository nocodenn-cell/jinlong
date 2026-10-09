'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import {
  DashboardGrid,
  DenseDataTable,
  KpiStrip,
  SectionCard,
  StatusBadge,
  type KpiStripItem,
} from '@/components/ui/admin-v2'
import { EmptyState } from '@/components/ui/feedback'
import { formatBRL } from '@/lib/format/money'
import { ROUTES } from '@/lib/navigation/routes'
import type { VendaReportRow } from '@/app/gerente/relatorios/vendas/actions'
import type {
  RelatorioMargemVendaDTO,
  RelatorioResumoExecutivoDTO,
} from '@/app/gerente/relatorios/actions'
import { formatarPercentual } from '@/lib/vendas/metricasVendas'
import { CLIENTE_NAO_IDENTIFICADO, construirSegmentacaoRfv } from './rfvSegmentacao'
import { useExecT, type ExecTextKey } from '@/lib/i18n/useExecT'

type Props = {
  vendas: readonly VendaReportRow[]
  margemPorVenda: readonly RelatorioMargemVendaDTO[]
  resumo: RelatorioResumoExecutivoDTO
  faturamento: number
  periodoAte: string
  locale: string
}

type OperadorPerf = {
  nome: string
  faturamento: number
  vendas: number
  canceladas: number
}

/**
 * Aba 5 — CRM, Equipe & Auditoria de Perdas (BI).
 */
export function ExecCrmAuditoriaPanel({
  vendas,
  margemPorVenda,
  resumo,
  faturamento,
  periodoAte,
  locale,
}: Props) {
  const t = useExecT()
  const rfv = useMemo(
    () => construirSegmentacaoRfv(vendas, periodoAte, 30),
    [vendas, periodoAte],
  )

  const operadores = useMemo(() => {
    const map = new Map<string, OperadorPerf>()
    for (const v of vendas) {
      const nome = (v.vendedor_nome ?? '').trim() || t('com.sem_operador')
      const prev = map.get(nome) ?? { nome, faturamento: 0, vendas: 0, canceladas: 0 }
      if (v.status === 'CANCELADA') {
        prev.canceladas += 1
      } else if (v.status === 'CONCLUIDA') {
        prev.vendas += 1
        prev.faturamento += Number(v.total_liquido) || 0
      }
      map.set(nome, prev)
    }
    return [...map.values()].sort((a, b) => b.faturamento - a.faturamento).slice(0, 20)
  }, [vendas, t])

  const descontos = useMemo(
    () => margemPorVenda.reduce((acc, v) => acc + (Number(v.total_desconto) || 0), 0),
    [margemPorVenda],
  )
  const canceladas = resumo.vendas_canceladas
  const taxaCancel = resumo.taxa_cancelamento

  const kpis: KpiStripItem[] = [
    {
      id: 'clientes',
      label: t('crm.kpi_clientes'),
      value: String(rfv.length),
      icon: 'shopping-bag',
      tone: 'gold',
      href: ROUTES.admin.clientes,
    },
    {
      id: 'cancel',
      label: t('crm.kpi_cancel'),
      value: formatarPercentual(taxaCancel, locale),
      icon: 'x-circle',
      tone: taxaCancel > 0.05 ? 'danger' : 'success',
      deltaPositiveIsGood: false,
    },
    {
      id: 'desc',
      label: t('crm.kpi_desc'),
      value: formatBRL(descontos, locale),
      icon: 'list-filter',
      tone: descontos > 0 ? 'warning' : 'success',
    },
    {
      id: 'comissoes',
      label: t('crm.kpi_comissoes'),
      value: t('com.abrir'),
      icon: 'file-check-2',
      href: ROUTES.admin.comissoes,
      hint: t('crm.kpi_comissoes_hint'),
    },
  ]

  return (
    <div data-testid="exec-crm-auditoria" className="admin-v2-stack">
      <DashboardGrid
        kpis={<KpiStrip items={kpis} />}
        main={
          <SectionCard title={t('crm.sec_rfv')}>
            <p className="mb-3 text-caption text-fg-subtle">
              {t('crm.rfv_nota')}{' '}
              <Link href={ROUTES.admin.clientes} className="underline">
                {t('crm.rfv_link')}
              </Link>
              .
            </p>
            <DenseDataTable
              caption={t('crm.cap_rfv')}
              rows={rfv}
              rowKey={(r) => r.cliente}
              empty={<EmptyState title={t('crm.empty_rfv')} className="py-6" />}
              columns={[
                {
                  id: 'cli',
                  header: t('com.cliente'),
                  cell: (r) => (r.cliente === CLIENTE_NAO_IDENTIFICADO ? t('crm.cliente_anonimo') : r.cliente),
                },
                {
                  id: 'seg',
                  header: t('crm.col_segmento'),
                  cell: (r) => {
                    const tone =
                      r.segmento === 'Campeões' || r.segmento === 'Fieis'
                        ? 'success'
                        : r.segmento === 'Em risco'
                          ? 'warning'
                          : 'neutral'
                    return <StatusBadge tone={tone}>{t(`crm.seg.${r.segmento}` as ExecTextKey)}</StatusBadge>
                  },
                },
                {
                  id: 'r',
                  header: t('crm.col_r'),
                  numeric: true,
                  cell: (r) => String(r.recenciaDias),
                },
                {
                  id: 'f',
                  header: 'F',
                  numeric: true,
                  cell: (r) => String(r.frequencia),
                },
                {
                  id: 'v',
                  header: t('com.valor'),
                  numeric: true,
                  cell: (r) => formatBRL(r.valor, locale),
                },
              ]}
            />
          </SectionCard>
        }
        side={
          <>
            <SectionCard title={t('crm.sec_operadores')}>
              <DenseDataTable
                caption={t('crm.cap_operadores')}
                rows={operadores}
                rowKey={(r) => r.nome}
                empty={<EmptyState title={t('crm.empty_operadores')} className="py-4" />}
                columns={[
                  { id: 'nome', header: t('com.operador'), cell: (r) => r.nome },
                  {
                    id: 'fat',
                    header: t('crm.col_fat'),
                    numeric: true,
                    cell: (r) => formatBRL(r.faturamento, locale),
                  },
                  {
                    id: 'n',
                    header: t('crm.col_vendas'),
                    numeric: true,
                    cell: (r) => String(r.vendas),
                  },
                  {
                    id: 'canc',
                    header: t('crm.col_canc'),
                    numeric: true,
                    cell: (r) => (
                      <StatusBadge tone={r.canceladas > 0 ? 'danger' : 'success'}>
                        {r.canceladas}
                      </StatusBadge>
                    ),
                  },
                ]}
              />
              <Link
                href={ROUTES.admin.comissoes}
                className="mt-3 inline-block text-small font-medium text-brand underline-offset-2 hover:underline"
              >
                {t('crm.link_comissoes')}
              </Link>
            </SectionCard>
            <SectionCard title={t('crm.sec_perdas')}>
              <ul className="space-y-2 text-small">
                <li className="flex items-center justify-between gap-2">
                  <span>{t('crm.perda_cancel')}</span>
                  <StatusBadge tone={canceladas > 0 ? 'danger' : 'success'}>
                    {canceladas} · {formatarPercentual(taxaCancel, locale)}
                  </StatusBadge>
                </li>
                <li className="flex items-center justify-between gap-2">
                  <span>{t('crm.perda_desc')}</span>
                  <StatusBadge tone={descontos > 0 ? 'warning' : 'neutral'}>
                    {formatBRL(descontos, locale)}
                  </StatusBadge>
                </li>
                <li className="flex items-center justify-between gap-2">
                  <span>{t('crm.perda_base')}</span>
                  <span className="tabular-nums font-medium">{formatBRL(faturamento, locale)}</span>
                </li>
              </ul>
              <Link
                href={ROUTES.admin.auditoria}
                className="mt-3 inline-block text-small underline"
              >
                {t('crm.link_auditoria')}
              </Link>
            </SectionCard>
          </>
        }
      />
    </div>
  )
}
