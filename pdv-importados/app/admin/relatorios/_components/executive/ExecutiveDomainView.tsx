'use client'

import type { ExecutiveRelatoriosViewId } from '@/lib/navigation/executiveViews'
import type { RelatoriosDados } from '../RelatoriosContent'
import type { ExecutiveExtras } from './executiveExtras'
import { ExecVendasCaixasPanel } from './ExecVendasCaixasPanel'
import { ExecProdutosEstoquePanel } from './ExecProdutosEstoquePanel'
import { ExecDreFinanceiroPanel } from './ExecDreFinanceiroPanel'
import { ExecCrmAuditoriaPanel } from './ExecCrmAuditoriaPanel'
import { sumFaturamento } from '../relatoriosUi'

type Props = {
  view: ExecutiveRelatoriosViewId
  dados: RelatoriosDados
  extras?: ExecutiveExtras
  locale: string
}

/**
 * Router das abas executivas 2–5 (conteudo de dominio Fase 2).
 */
export function ExecutiveDomainView({ view, dados, extras = {}, locale }: Props) {
  const faturamento = sumFaturamento(dados.porDia)

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
