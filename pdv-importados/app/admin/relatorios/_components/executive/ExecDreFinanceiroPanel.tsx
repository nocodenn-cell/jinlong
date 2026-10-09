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
      ? `${formatBRL(piso, locale)} a ${formatBRL(v, locale)}`
      : formatBRL(v, locale)
  const parcialTxt = vendasSemCusto?.parcial
    ? ' — lista parcial (200 vendas mais recentes): pode haver outras vendas sem custo'
    : ''
  const hintMargem =
    piso != null && vendasSemCusto
      ? `Custo incompleto em ${vendasSemCusto.qtd} venda(s) (${formatBRL(vendasSemCusto.receita, locale)})${parcialTxt}: margem entre piso e teto${devolucoes > 0 ? '; piso conservador (há devoluções)' : ''}`
      : fusoDiverge
        ? 'Custo incompleto — apenas o teto (fuso do relatório difere do Financeiro)'
        : `Custo incompleto — margem aproximada (teto)${parcialTxt}`
  const despesas = gerencial ? gerencial.despesas_manuais + gerencial.taxas_conferidas : null
  const lucro =
    margemBruta != null && despesas != null ? margemBruta - despesas : null

  const cascata: CascataLinha[] = [
    { id: 'bruta', label: 'Receita bruta (faturamento)', valor: faturamentoBruto, tom: 'neutral' },
    { id: 'dev', label: '(−) Devolucoes', valor: -devolucoes, tom: devolucoes > 0 ? 'warning' : 'neutral' },
    { id: 'liq', label: 'Receita liquida', valor: receitaLiquida, tom: 'success', destaque: true },
    {
      id: 'cmv',
      label: '(−) CMV / custo conhecido',
      valor: cmv != null ? -cmv : null,
      tom: 'warning',
    },
    {
      id: 'mb',
      label: 'Margem bruta estimada',
      valor: margemBruta,
      texto: piso != null && margemBruta != null ? textoIntervalo(margemBruta) : undefined,
      tom: 'success',
      destaque: true,
    },
    {
      id: 'desp',
      label: '(−) Despesas + taxas',
      valor: despesas != null ? -despesas : null,
      tom: 'warning',
    },
    {
      id: 'll',
      label: 'Resultado operacional estimado',
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
      label: 'Receita bruta',
      value: formatBRL(faturamentoBruto, locale),
      icon: 'dollar-sign',
      tone: 'gold',
    },
    {
      id: 'liq',
      label: 'Receita liquida',
      value: formatBRL(receitaLiquida, locale),
      icon: 'wallet-cards',
      tone: 'success',
    },
    {
      id: 'mb',
      label: 'Margem bruta est.',
      value: margemBruta == null ? '—' : textoIntervalo(margemBruta),
      icon: 'file-check-2',
      tone: resumo.custo_confiavel ? 'gold' : 'warning',
      hint: resumo.custo_confiavel ? undefined : hintMargem,
    },
    {
      id: 'inad',
      label: 'Titulos vencidos (AR)',
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
          <SectionCard title="DRE em cascata (estimativa gerencial)">
            {financeiroErro ? (
              <p role="status" className="mb-3 text-small text-[var(--color-warning-strong)]">
                Painel financeiro parcial: {financeiroErro}. Cascata usa dados de vendas disponiveis.
              </p>
            ) : null}
            <DenseDataTable
              caption="DRE cascata"
              rows={cascata}
              rowKey={(r) => r.id}
              columns={[
                {
                  id: 'label',
                  header: 'Linha',
                  cell: (r) => (
                    <span className={r.destaque ? 'font-semibold text-fg' : 'text-fg-muted'}>
                      {r.label}
                    </span>
                  ),
                },
                {
                  id: 'valor',
                  header: 'Valor',
                  numeric: true,
                  cell: (r) =>
                    r.valor == null ? (
                      <StatusBadge tone="neutral">Indisponivel</StatusBadge>
                    ) : (
                      <StatusBadge tone={r.tom}>{r.texto ?? formatBRL(r.valor, locale)}</StatusBadge>
                    ),
                },
              ]}
            />
            <p className="mt-3 text-caption text-fg-subtle">
              Nao e lucro contabil. CMV e despesas vêm do resultado gerencial do Financeiro quando
              carregado; cadastre custos e despesas para fechar a cascata.
            </p>
          </SectionCard>
        }
        side={
          <>
            <SectionCard title="Previsao de fluxo (saldo)">
              {financeiro?.fluxo?.length ? (
                <DenseDataTable
                  caption="Fluxo"
                  rows={financeiro.fluxo.slice(0, 14)}
                  rowKey={(r) => r.dia}
                  columns={[
                    { id: 'dia', header: 'Dia', cell: (r) => r.dia },
                    {
                      id: 'ent',
                      header: 'Entradas',
                      numeric: true,
                      cell: (r) => formatBRL(r.entradas, locale),
                    },
                    {
                      id: 'sai',
                      header: 'Saidas',
                      numeric: true,
                      cell: (r) => formatBRL(r.saidas, locale),
                    },
                    {
                      id: 'saldo',
                      header: 'Saldo',
                      numeric: true,
                      cell: (r) => formatBRL(r.saldo, locale),
                    },
                  ]}
                />
              ) : (
                <EmptyState title="Fluxo nao carregado neste recorte" className="py-4" />
              )}
              <div className="mt-3 flex flex-wrap gap-3 text-small">
                <Link
                  className="underline"
                  href={financeiroHrefForTab('resumo', fluxoParams)}
                >
                  Resumo financeiro
                </Link>
                <Link
                  className="underline"
                  href={financeiroHrefForTab('resultado', fluxoParams)}
                >
                  Resultado
                </Link>
              </div>
            </SectionCard>
            <SectionCard title="Inadimplencia / titulos vencidos">
              <DenseDataTable
                caption="Vencidos a receber"
                rows={vencidos.slice(0, 15)}
                rowKey={(r) => r.id}
                empty={<EmptyState title="Nenhum titulo vencido em aberto" className="py-4" />}
                columns={[
                  { id: 'nome', header: 'Titulo', cell: (r) => r.nome },
                  {
                    id: 'venc',
                    header: 'Vencimento',
                    cell: (r) => r.vencimento ?? '—',
                  },
                  {
                    id: 'valor',
                    header: 'Aberto',
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
                Ver contas a pagar ({aPagarProx.length}+)
              </Link>
            </SectionCard>
          </>
        }
      />
      {extra}
      <p className="text-caption text-fg-subtle">
        Operacao de titulos permanece em{' '}
        <Link href={ROUTES.admin.financeiro} className="underline">
          Financeiro e fiscal
        </Link>
        .
      </p>
    </div>
  )
}
