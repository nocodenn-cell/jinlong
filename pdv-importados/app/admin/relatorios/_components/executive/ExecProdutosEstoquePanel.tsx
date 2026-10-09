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
  const reposicao = sortReposicaoPorDeficit([...baixo]).slice(0, 20)
  const coberturaUrgente = sortCoberturaUrgente([...cobertura]).slice(0, 15)
  const encalhe = semGiro.slice(0, 20)

  const kpis: KpiStripItem[] = [
    {
      id: 'abc-a',
      label: 'Classe A',
      value: String(curvaAbc.filter((p) => p.classeAbc === 'A').length),
      icon: 'shopping-bag',
      tone: 'gold',
    },
    {
      id: 'encalhe',
      label: 'Sem giro (>30d)',
      value: String(semGiro.length),
      icon: 'package',
      tone: semGiro.length > 0 ? 'warning' : 'success',
      href: ROUTES.admin.estoque,
    },
    {
      id: 'reposicao',
      label: 'Reposicao urgente',
      value: String(baixo.length),
      icon: 'alert-circle',
      tone: baixo.length > 0 ? 'danger' : 'success',
      href: ROUTES.admin.estoque,
    },
    {
      id: 'compras',
      label: 'Ordens de compra',
      value: 'Abrir',
      icon: 'list-filter',
      href: ROUTES.admin.compras,
      hint: 'Acompanhar OC em transito no modulo Compras',
    },
  ]

  return (
    <div data-testid="exec-produtos-estoque" className="admin-v2-stack">
      <DashboardGrid
        kpis={<KpiStrip items={kpis} />}
        main={
          <SectionCard title="Curva ABC por contribuicao de receita">
            <DenseDataTable
              caption="Curva ABC"
              rows={curvaAbc.slice(0, 40)}
              rowKey={(r) => r.produtoId}
              empty={<EmptyState title="Sem dados de curva ABC no periodo" className="py-6" />}
              columns={[
                {
                  id: 'nome',
                  header: 'Produto',
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
                  header: 'Receita',
                  numeric: true,
                  cell: (r) => formatBRL(r.totalValor, locale),
                },
                {
                  id: 'part',
                  header: 'Part. %',
                  numeric: true,
                  cell: (r) => formatPercent(r.percentualValor / 100, locale),
                },
                {
                  id: 'acum',
                  header: 'Acum. %',
                  numeric: true,
                  cell: (r) => formatPercent(r.percentualAcumulado / 100, locale),
                },
                {
                  id: 'classe',
                  header: 'Classe',
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
            <SectionCard title="Encalhe (sem giro)">
              <DenseDataTable
                caption="Encalhe"
                rows={encalhe}
                rowKey={(r) => r.produto_id}
                empty={<EmptyState title="Nenhum item sem giro no recorte" className="py-4" />}
                columns={[
                  {
                    id: 'nome',
                    header: 'Produto',
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
                    header: 'Saldo',
                    numeric: true,
                    cell: (r) => String(r.quantidade_atual),
                  },
                  {
                    id: 'ult',
                    header: 'Ult. venda',
                    cell: (r) =>
                      r.ultima_venda
                        ? formatDateTimeOrDash(r.ultima_venda, locale, 'short')
                        : 'Nunca',
                  },
                ]}
              />
            </SectionCard>
            <SectionCard title="Reposicao urgente">
              <DenseDataTable
                caption="Reposicao"
                rows={reposicao}
                rowKey={(r) => r.id}
                empty={<EmptyState title="Nenhum item abaixo do minimo" className="py-4" />}
                columns={[
                  { id: 'nome', header: 'Produto', cell: (r) => r.nome },
                  {
                    id: 'def',
                    header: 'Deficit',
                    numeric: true,
                    cell: (r) => (
                      <StatusBadge tone="danger">{r.deficit}</StatusBadge>
                    ),
                  },
                  {
                    id: 'saldo',
                    header: 'Atual/min',
                    numeric: true,
                    cell: (r) => `${r.quantidade_atual}/${r.estoque_minimo}`,
                  },
                ]}
              />
              <Link
                href={ROUTES.admin.compras}
                className="mt-3 inline-block text-small font-medium text-brand underline-offset-2 hover:underline"
              >
                Criar / acompanhar OC
              </Link>
            </SectionCard>
          </>
        }
        footer={
          <SectionCard title="Cobertura de estoque (dias)">
            <DenseDataTable
              caption="Cobertura"
              rows={coberturaUrgente}
              rowKey={(r) => `${r.produtoId}-${r.lojaId}`}
              empty={<EmptyState title="Sem cobertura calculada" className="py-4" />}
              columns={[
                { id: 'nome', header: 'Produto', cell: (r) => r.nome },
                {
                  id: 'qtd',
                  header: 'Saldo',
                  numeric: true,
                  cell: (r) => String(r.quantidadeAtual),
                },
                {
                  id: 'dias',
                  header: 'Cobertura',
                  numeric: true,
                  cell: (r) =>
                    r.diasCobertura == null
                      ? '—'
                      : formatDiasCobertura(r.diasCobertura, {
                          dias: 'dias',
                          diasCap: '>{{n}} dias',
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
