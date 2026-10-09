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
import { formatBRL } from '@/lib/format/money'
import { ROUTES } from '@/lib/navigation/routes'
import { financeiroHrefForTab } from '@/lib/navigation/financeiroHubQuery'
import { useExecT } from '@/lib/i18n/useExecT'
import type { RelatorioResumoExecutivoDTO } from '@/app/gerente/relatorios/actions'
import type { FinanceiroPainel } from '@/app/admin/financeiro/financeiroLojaTypes'

type Props = {
  /** Seções migradas do relatório clássico (UX-IA-01 D1/D2); ausentes em testes. */
  extra?: ReactNode
  faturamentoBruto: number
  receitaLiquida: number
  devolucoes: number
  resumo: RelatorioResumoExecutivoDTO
  locale: string
  periodoDe: string
  periodoAte: string
  financeiro?: FinanceiroPainel | null
  financeiroErro?: string | null
  /**
   * Vendas do periodo sem custo confiavel (UX-IA-01 R5, opcao b): a margem aproximada
   * e um teto; o piso desconta a receita dessas vendas (custo >= 0). `parcial` quando a
   * lista do RPC atingiu o limite e pode haver mais vendas sem custo.
   */
  vendasSemCusto?: { qtd: number; receita: number; parcial: boolean }
  /** Fuso do relatorio difere do usado pelo Financeiro: o piso nao e confiavel, so o teto. */
  fusoDiverge?: boolean
}

export const LIMITE_MARGEM_POR_VENDA = 200

/** Resume vendas sem custo confiavel a partir da lista do RPC de margem por venda. */
export function resumirVendasSemCusto(
  vendas: ReadonlyArray<{ custo_confiavel: boolean; total_liquido: number }>,
): { qtd: number; receita: number; parcial: boolean } {
  const sem = vendas.filter((v) => !v.custo_confiavel)
  return {
    qtd: sem.length,
    receita: Math.round(sem.reduce((a, v) => a + (Number(v.total_liquido) || 0), 0) * 100) / 100,
    parcial: vendas.length >= LIMITE_MARGEM_POR_VENDA,
  }
}

type CascataLinha = {
  id: string
  label: string
  valor: number | null
  tom: 'neutral' | 'success' | 'warning' | 'danger'
  destaque?: boolean
  /** Texto no lugar do valor (ex.: intervalo de margem). */
  texto?: string
}

/**
 * Aba 3 — DRE & Gestao Financeira (BI).
 * Cascata a partir de vendas + resultado gerencial do painel financeiro quando disponivel.
 */
export function ExecDreFinanceiroPanel({
  faturamentoBruto,
  receitaLiquida,
  devolucoes,
  resumo,
  locale,
  periodoDe,
  periodoAte,
  financeiro,
  financeiroErro,
  extra,
  vendasSemCusto,
  fusoDiverge = false,
}: Props) {
  const t = useExecT()
  const gerencial = financeiro?.resultado_gerencial
  const cmv = gerencial?.custo_conhecido ?? null
  const margemBruta =
    resumo.custo_confiavel && resumo.margem_bruta_estimada != null
      ? resumo.margem_bruta_estimada
      : gerencial
        ? gerencial.receita_vendas - gerencial.custo_conhecido
        : null
  const aproximada = !resumo.custo_confiavel && margemBruta != null
  const piso =
    aproximada && !fusoDiverge && vendasSemCusto && vendasSemCusto.qtd > 0
      ? Math.round((margemBruta - vendasSemCusto.receita) * 100) / 100
      : null
  const textoIntervalo = (v: number) =>
    piso != null
      ? t('dre.mb_faixa', { piso: formatBRL(piso, locale), teto: formatBRL(v, locale) })
      : formatBRL(v, locale)
  const parcialTxt = vendasSemCusto?.parcial ? t('dre.hint_parcial') : ''
  const hintMargem =
    piso != null && vendasSemCusto
      ? t('dre.hint_faixa', {
          n: vendasSemCusto.qtd,
          valor: formatBRL(vendasSemCusto.receita, locale),
          parcial: parcialTxt,
          devolucoes: devolucoes > 0 ? t('dre.hint_devolucoes') : '',
        })
      : fusoDiverge
        ? t('dre.hint_fuso')
        : t('dre.hint_teto', { parcial: parcialTxt })
  const despesas = gerencial ? gerencial.despesas_manuais + gerencial.taxas_conferidas : null
  const lucro =
    margemBruta != null && despesas != null ? margemBruta - despesas : null

  const cascata: CascataLinha[] = [
    { id: 'bruta', label: t('dre.cascata_bruta'), valor: faturamentoBruto, tom: 'neutral' },
    { id: 'dev', label: t('dre.cascata_dev'), valor: -devolucoes, tom: devolucoes > 0 ? 'warning' : 'neutral' },
    { id: 'liq', label: t('dre.cascata_liq'), valor: receitaLiquida, tom: 'success', destaque: true },
    {
      id: 'cmv',
      label: t('dre.cascata_cmv'),
      valor: cmv != null ? -cmv : null,
      tom: 'warning',
    },
    {
      id: 'mb',
      label: t('dre.cascata_mb'),
      valor: margemBruta,
      texto: piso != null && margemBruta != null ? textoIntervalo(margemBruta) : undefined,
      tom: 'success',
      destaque: true,
    },
    {
      id: 'desp',
      label: t('dre.cascata_desp'),
      valor: despesas != null ? -despesas : null,
      tom: 'warning',
    },
    {
      id: 'll',
      label: t('dre.cascata_ll'),
      valor: lucro,
      tom: lucro != null && lucro < 0 ? 'danger' : 'success',
      destaque: true,
    },
  ]

  const hoje = financeiro?.hoje ?? periodoAte
  const vencidos = (financeiro?.receber ?? []).filter((t) => {
    if (t.status === 'PAGO' || t.status === 'CANCELADO') return false
    if (!t.vencimento) return false
    return t.vencimento < hoje
  })
  const aPagarProx = (financeiro?.pagar ?? [])
    .filter((t) => t.status !== 'PAGO' && t.status !== 'CANCELADO')
    .slice(0, 12)

  const fluxoParams = new URLSearchParams({ de: periodoDe, ate: periodoAte })

  const kpis: KpiStripItem[] = [
    {
      id: 'bruta',
      label: t('dre.kpi_bruta'),
      value: formatBRL(faturamentoBruto, locale),
      icon: 'dollar-sign',
      tone: 'gold',
    },
    {
      id: 'liq',
      label: t('dre.kpi_liq'),
      value: formatBRL(receitaLiquida, locale),
      icon: 'wallet-cards',
      tone: 'success',
    },
    {
      id: 'mb',
      label: t('dre.kpi_mb'),
      value: margemBruta == null ? '—' : textoIntervalo(margemBruta),
      icon: 'file-check-2',
      tone: resumo.custo_confiavel ? 'gold' : 'warning',
      hint: resumo.custo_confiavel ? undefined : hintMargem,
    },
    {
      id: 'inad',
      label: t('dre.kpi_vencidos'),
      value: String(vencidos.length),
      icon: 'alert-circle',
      tone: vencidos.length > 0 ? 'danger' : 'success',
      href: financeiroHrefForTab('receber', fluxoParams),
    },
  ]

  return (
    <div data-testid="exec-dre-financeiro" className="admin-v2-stack">
      <DashboardGrid
        kpis={<KpiStrip items={kpis} />}
        main={
          <SectionCard title={t('dre.sec_cascata')}>
            {financeiroErro ? (
              <p role="status" className="mb-3 text-small text-[var(--color-warning-strong)]">
                {t('dre.parcial_fin', { erro: financeiroErro })}
              </p>
            ) : null}
            <DenseDataTable
              caption={t('dre.cap_cascata')}
              rows={cascata}
              rowKey={(r) => r.id}
              columns={[
                {
                  id: 'label',
                  header: t('dre.col_linha'),
                  cell: (r) => (
                    <span className={r.destaque ? 'font-semibold text-fg' : 'text-fg-muted'}>
                      {r.label}
                    </span>
                  ),
                },
                {
                  id: 'valor',
                  header: t('com.valor'),
                  numeric: true,
                  cell: (r) =>
                    r.valor == null ? (
                      <StatusBadge tone="neutral">{t('com.indisponivel')}</StatusBadge>
                    ) : (
                      <StatusBadge tone={r.tom}>{r.texto ?? formatBRL(r.valor, locale)}</StatusBadge>
                    ),
                },
              ]}
            />
            <p className="mt-3 text-caption text-fg-subtle">
              {t('dre.nota_contabil')}
            </p>
          </SectionCard>
        }
        side={
          <>
            <SectionCard title={t('dre.sec_fluxo')}>
              {financeiro?.fluxo?.length ? (
                <DenseDataTable
                  caption={t('dre.cap_fluxo')}
                  rows={financeiro.fluxo.slice(0, 14)}
                  rowKey={(r) => r.dia}
                  columns={[
                    { id: 'dia', header: t('dre.col_dia'), cell: (r) => r.dia },
                    {
                      id: 'ent',
                      header: t('dre.col_entradas'),
                      numeric: true,
                      cell: (r) => formatBRL(r.entradas, locale),
                    },
                    {
                      id: 'sai',
                      header: t('dre.col_saidas'),
                      numeric: true,
                      cell: (r) => formatBRL(r.saidas, locale),
                    },
                    {
                      id: 'saldo',
                      header: t('dre.col_saldo'),
                      numeric: true,
                      cell: (r) => formatBRL(r.saldo, locale),
                    },
                  ]}
                />
              ) : (
                <EmptyState title={t('dre.empty_fluxo')} className="py-4" />
              )}
              <div className="mt-3 flex flex-wrap gap-3 text-small">
                <Link
                  className="underline"
                  href={financeiroHrefForTab('resumo', fluxoParams)}
                >
                  {t('dre.link_resumo')}
                </Link>
                <Link
                  className="underline"
                  href={financeiroHrefForTab('resultado', fluxoParams)}
                >
                  {t('dre.link_resultado')}
                </Link>
              </div>
            </SectionCard>
            <SectionCard title={t('dre.sec_inadimplencia')}>
              <DenseDataTable
                caption={t('dre.cap_vencidos')}
                rows={vencidos.slice(0, 15)}
                rowKey={(r) => r.id}
                empty={<EmptyState title={t('dre.empty_vencidos')} className="py-4" />}
                columns={[
                  { id: 'nome', header: t('dre.col_titulo'), cell: (r) => r.nome },
                  {
                    id: 'venc',
                    header: t('dre.col_vencimento'),
                    cell: (r) => r.vencimento ?? '—',
                  },
                  {
                    id: 'valor',
                    header: t('dre.col_aberto'),
                    numeric: true,
                    cell: (r) => (
                      <StatusBadge tone="danger">
                        {formatBRL(r.valor_aberto ?? r.valor_total, locale)}
                      </StatusBadge>
                    ),
                  },
                ]}
              />
              <Link
                href={financeiroHrefForTab('pagar', fluxoParams)}
                className="mt-3 inline-block text-small underline"
              >
                {t('dre.link_pagar', { n: aPagarProx.length })}
              </Link>
            </SectionCard>
          </>
        }
      />
      {extra}
      <p className="text-caption text-fg-subtle">
        {t('dre.rodape')}{' '}
        <Link href={ROUTES.admin.financeiro} className="underline">
          {t('dre.rodape_link')}
        </Link>
        .
      </p>
    </div>
  )
}
