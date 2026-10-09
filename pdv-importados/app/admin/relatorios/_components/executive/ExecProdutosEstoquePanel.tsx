'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import {
  DashboardGrid,
  DenseDataTable,
  KpiStrip,
  SectionCard,
  StatusBadge,
  type KpiStripItem,
} from '@/components/ui/admin-v2'
import { EmptyState } from '@/components/ui/feedback'
import { formatBRL, formatPercent } from '@/lib/format/money'
import { formatDateTimeOrDash } from '@/lib/format/datetime'
import { ROUTES, adminCatalogoCompletoEditarHref } from '@/lib/navigation/routes'
import type {
  RelatorioCoberturaEstoqueDTO,
  RelatorioCurvaAbcDTO,
  RelatorioEstoqueBaixoDTO,
} from '@/app/gerente/relatorios/actions'
import type { RelatorioSemGiroDTO } from '@/app/gerente/relatorios/sem-giro/actions'
import { formatDiasCobertura, sortCoberturaUrgente, sortReposicaoPorDeficit } from '../relatoriosUi'
import { useExecT } from '@/lib/i18n/useExecT'

type Props = {
  /** Seções migradas do relatório clássico (UX-IA-01 D1/D2); ausentes em testes. */
  extra?: ReactNode
  curvaAbc: readonly RelatorioCurvaAbcDTO[]
  semGiro: readonly RelatorioSemGiroDTO[]
  baixo: readonly RelatorioEstoqueBaixoDTO[]
  cobertura: readonly RelatorioCoberturaEstoqueDTO[]
  locale: string
}

/**
 * Aba 4 — Produtos, Compras & Estoque (BI).
 */
export function ExecProdutosEstoquePanel({
  curvaAbc,
  semGiro,
  baixo,
  cobertura,
  locale,
  extra,
}: Props) {
  const t = useExecT()
  const reposicao = sortReposicaoPorDeficit([...baixo]).slice(0, 20)
  const coberturaUrgente = sortCoberturaUrgente([...cobertura]).slice(0, 15)
  const encalhe = semGiro.slice(0, 20)

  const kpis: KpiStripItem[] = [
    {
      id: 'abc-a',
      label: t('pe.kpi_classe_a'),
      value: String(curvaAbc.filter((p) => p.classeAbc === 'A').length),
      icon: 'shopping-bag',
      tone: 'gold',
    },
    {
      id: 'encalhe',
      label: t('pe.kpi_sem_giro'),
      value: String(semGiro.length),
      icon: 'package',
      tone: semGiro.length > 0 ? 'warning' : 'success',
      href: ROUTES.admin.estoque,
    },
    {
      id: 'reposicao',
      label: t('pe.kpi_reposicao'),
      value: String(baixo.length),
      icon: 'alert-circle',
      tone: baixo.length > 0 ? 'danger' : 'success',
      href: ROUTES.admin.estoque,
    },
    {
      id: 'compras',
      label: t('pe.kpi_oc'),
      value: t('com.abrir'),
      icon: 'list-filter',
      href: ROUTES.admin.compras,
      hint: t('pe.kpi_oc_hint'),
    },
  ]

  return (
    <div data-testid="exec-produtos-estoque" className="admin-v2-stack">
      <DashboardGrid
        kpis={<KpiStrip items={kpis} />}
        main={
          <SectionCard title={t('pe.sec_abc')}>
            <DenseDataTable
              caption={t('pe.cap_abc')}
              rows={curvaAbc.slice(0, 40)}
              rowKey={(r) => r.produtoId}
              empty={<EmptyState title={t('pe.empty_abc')} className="py-6" />}
              columns={[
                {
                  id: 'nome',
                  header: t('com.produto'),
                  cell: (r) => (
                    <Link
                      href={adminCatalogoCompletoEditarHref(r.produtoId)}
                      className="hover:underline"
                    >
                      {r.nome}
                    </Link>
                  ),
                },
                {
                  id: 'valor',
                  header: t('pe.col_receita'),
                  numeric: true,
                  cell: (r) => formatBRL(r.totalValor, locale),
                },
                {
                  id: 'part',
                  header: t('pe.col_part'),
                  numeric: true,
                  cell: (r) => formatPercent(r.percentualValor / 100, locale),
                },
                {
                  id: 'acum',
                  header: t('pe.col_acum'),
                  numeric: true,
                  cell: (r) => formatPercent(r.percentualAcumulado / 100, locale),
                },
                {
                  id: 'classe',
                  header: t('pe.col_classe'),
                  cell: (r) => (
                    <StatusBadge
                      tone={r.classeAbc === 'A' ? 'success' : r.classeAbc === 'B' ? 'warning' : 'neutral'}
                    >
                      {r.classeAbc}
                    </StatusBadge>
                  ),
                },
              ]}
            />
          </SectionCard>
        }
        side={
          <>
            <SectionCard title={t('pe.sec_encalhe')}>
              <DenseDataTable
                caption={t('pe.cap_encalhe')}
                rows={encalhe}
                rowKey={(r) => r.produto_id}
                empty={<EmptyState title={t('pe.empty_encalhe')} className="py-4" />}
                columns={[
                  {
                    id: 'nome',
                    header: t('com.produto'),
                    cell: (r) => (
                      <Link
                        href={adminCatalogoCompletoEditarHref(r.produto_id)}
                        className="hover:underline"
                      >
                        {r.nome}
                      </Link>
                    ),
                  },
                  {
                    id: 'saldo',
                    header: t('pe.col_saldo'),
                    numeric: true,
                    cell: (r) => String(r.quantidade_atual),
                  },
                  {
                    id: 'imob',
                    header: t('pe.col_imob'),
                    numeric: true,
                    cell: (r) => formatBRL(r.valor_imobilizado),
                  },
                  {
                    id: 'ult',
                    header: t('pe.col_ult'),
                    cell: (r) =>
                      r.ultima_venda
                        ? formatDateTimeOrDash(r.ultima_venda, locale, 'short')
                        : t('com.nunca'),
                  },
                ]}
              />
            </SectionCard>
            <SectionCard title={t('pe.sec_reposicao')}>
              <DenseDataTable
                caption={t('pe.cap_reposicao')}
                rows={reposicao}
                rowKey={(r) => r.id}
                empty={<EmptyState title={t('pe.empty_reposicao')} className="py-4" />}
                columns={[
                  {
                    id: 'nome',
                    header: t('com.produto'),
                    cell: (r) => (
                      <Link href={adminCatalogoCompletoEditarHref(r.id)} className="hover:underline">
                        {r.nome}
                      </Link>
                    ),
                  },
                  {
                    id: 'def',
                    header: t('pe.col_deficit'),
                    numeric: true,
                    cell: (r) => (
                      <StatusBadge tone="danger">{r.deficit}</StatusBadge>
                    ),
                  },
                  {
                    id: 'saldo',
                    header: t('pe.col_atual_min'),
                    numeric: true,
                    cell: (r) => `${r.quantidade_atual}/${r.estoque_minimo}`,
                  },
                ]}
              />
              <Link
                href={ROUTES.admin.compras}
                className="mt-3 inline-block text-small font-medium text-brand underline-offset-2 hover:underline"
              >
                {t('pe.link_oc')}
              </Link>
            </SectionCard>
          </>
        }
        footer={
          <SectionCard title={t('pe.sec_cobertura')}>
            <DenseDataTable
              caption={t('pe.cap_cobertura')}
              rows={coberturaUrgente}
              rowKey={(r) => `${r.produtoId}-${r.lojaId}`}
              empty={<EmptyState title={t('pe.empty_cobertura')} className="py-4" />}
              columns={[
                {
                  id: 'nome',
                  header: t('com.produto'),
                  cell: (r) => (
                    <Link href={adminCatalogoCompletoEditarHref(r.produtoId)} className="hover:underline">
                      {r.nome}
                    </Link>
                  ),
                },
                {
                  id: 'qtd',
                  header: t('pe.col_saldo'),
                  numeric: true,
                  cell: (r) => String(r.quantidadeAtual),
                },
                {
                  id: 'media',
                  header: t('pe.col_media'),
                  numeric: true,
                  cell: (r) => r.mediaDiariaVendida.toFixed(2),
                },
                {
                  id: 'dias',
                  header: t('pe.col_cobertura'),
                  numeric: true,
                  cell: (r) =>
                    r.diasCobertura == null
                      ? '—'
                      : formatDiasCobertura(r.diasCobertura, {
                          dias: t('pe.dias'),
                          diasCap: t('pe.dias_cap'),
                        }),
                },
              ]}
            />
          </SectionCard>
        }
      />
      {extra}
    </div>
  )
}
