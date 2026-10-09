'use client'

import type { ExecutiveRelatoriosViewId } from '@/lib/navigation/executiveViews'
import type { RelatoriosDados } from '../RelatoriosContent'
import type { ExecutiveExtras } from './executiveExtras'
import { ExecVendasCaixasPanel } from './ExecVendasCaixasPanel'
import { ExecProdutosEstoquePanel } from './ExecProdutosEstoquePanel'
import { ExecDreFinanceiroPanel, resumirVendasSemCusto } from './ExecDreFinanceiroPanel'
import { ExecCrmAuditoriaPanel } from './ExecCrmAuditoriaPanel'
import { SectionCard } from '@/components/ui/admin-v2'
import type { KardexAlvo } from '@/app/admin/estoque/_components/KardexSheet'
import { sortPorDiaAsc, sumFaturamento, ticketMedio } from '../relatoriosUi'
import type { RelatoriosLabels } from '../RelatoriosContent'
import {
  DivergenciaEstoqueList,
  FaturamentoPorDiaCard,
  MargemPorVendaList,
  StatusVendasCard,
  TicketMedioKpi,
  TopProdutosList,
} from '../RelatoriosSections'

type Props = {
  view: ExecutiveRelatoriosViewId
  dados: RelatoriosDados
  extras?: ExecutiveExtras
  locale: string
  /**
   * Rótulos do relatório clássico. Quando presentes, as views mostram também as seções que
   * antes só existiam nas abas clássicas (ticket médio, faturamento por dia, status das vendas,
   * mais vendidos, divergência de estoque, margem por venda). Sem eles (testes), só o painel base.
   */
  labels?: RelatoriosLabels
  onAbrirKardex?: (alvo: KardexAlvo) => void
}

/**
 * Router das abas executivas 2–5 (conteudo de dominio Fase 2).
 */
export function ExecutiveDomainView({ view, dados, extras = {}, locale, labels, onAbrirKardex }: Props) {
  const faturamento = sumFaturamento(dados.porDia)
  const porDiaOrdenado = sortPorDiaAsc(dados.porDia)
  const ticket = ticketMedio(faturamento, dados.resumoExecutivo.vendas_concluidas)

  if (view === 'vendas-caixas') {
    return (
      <ExecVendasCaixasPanel
        vendas={dados.vendasDetalhe}
        vendasErro={dados.vendasDetalheErro}
        resumo={dados.resumoExecutivo}
        faturamento={faturamento}
        locale={locale}
        tzRelatorio={dados.tzRelatorio}
        caixasResumo={extras.caixasResumo}
        caixasLinhas={extras.caixasLinhas}
        caixasErro={extras.caixasErro}
        extra={
          labels ? (
            <div data-testid="exec-extra-vendas" className="admin-v2-stack">
              <div className="admin-v2-grid-kpi">
                <TicketMedioKpi ticket={ticket} labels={labels} />
              </div>
              <div className="admin-v2-grid-2">
                <FaturamentoPorDiaCard porDiaOrdenado={porDiaOrdenado} labels={labels} />
                <StatusVendasCard resumo={dados.resumoExecutivo} labels={labels} />
              </div>
            </div>
          ) : undefined
        }
      />
    )
  }

  if (view === 'produtos-estoque') {
    return (
      <ExecProdutosEstoquePanel
        curvaAbc={dados.curvaAbc}
        semGiro={dados.semGiro}
        baixo={dados.baixo}
        cobertura={dados.coberturaEstoque}
        locale={locale}
        extra={
          labels ? (
            <div data-testid="exec-extra-produtos" className="admin-v2-stack">
              <SectionCard title={labels.secTopProdutos}>
                <TopProdutosList top={dados.top} labels={labels} />
              </SectionCard>
              <SectionCard title={labels.secDivergenciaEstoque}>
                <DivergenciaEstoqueList
                  itens={dados.divergenciaEstoque}
                  labels={labels}
                  onAbrirKardex={(alvo) => onAbrirKardex?.(alvo)}
                />
              </SectionCard>
            </div>
          ) : undefined
        }
      />
    )
  }

  if (view === 'dre-financeiro') {
    return (
      <ExecDreFinanceiroPanel
        faturamentoBruto={faturamento}
        receitaLiquida={dados.receitaLiquida ?? faturamento}
        devolucoes={dados.devolucoes ?? 0}
        resumo={dados.resumoExecutivo}
        locale={locale}
        periodoDe={dados.periodo.de}
        periodoAte={dados.periodo.ate}
        financeiro={extras.financeiro}
        financeiroErro={extras.financeiroErro}
        vendasSemCusto={resumirVendasSemCusto(dados.margemPorVenda)}
        // O RPC financeiro fixa America/Sao_Paulo; com outro fuso o piso nao seria comparavel ao teto.
        fusoDiverge={dados.tzRelatorio !== 'America/Sao_Paulo'}
        extra={
          labels ? (
            <div data-testid="exec-extra-dre">
              <SectionCard title={labels.secMargemPorVenda}>
                <MargemPorVendaList vendas={dados.margemPorVenda} labels={labels} />
              </SectionCard>
            </div>
          ) : undefined
        }
      />
    )
  }

  return (
    <ExecCrmAuditoriaPanel
      vendas={dados.vendasDetalhe}
      margemPorVenda={dados.margemPorVenda}
      resumo={dados.resumoExecutivo}
      faturamento={faturamento}
      periodoAte={dados.periodo.ate}
      locale={locale}
    />
  )
}
