/**
 * FastProduct Admin — Relatórios (Fase 6)
 *
 * Server Component. Reusa `carregarDadosRelatoriosGerente`
 * (`@/app/gerente/relatorios/actions`) — nenhuma query nova. Carrega um pacote
 * único: período, vendas por dia, top produtos, estoque baixo, resumo executivo.
 *
 * Estrutura lean: resumo executivo em KPIs, tabelas para vendas/top/baixo.
 * Sem gráficos (Recharts viria se aprovado em outra fase).
 */

import { carregarDadosRelatoriosGerente } from '@/app/gerente/relatorios/actions'
import { RelatoriosContent, type RelatoriosDados } from './_components/RelatoriosContent'

type SearchParams = {
  de?: string
  ate?: string
}

type PageProps = { searchParams?: Promise<SearchParams> }

export default async function AdminRelatoriosPage({ searchParams }: PageProps) {
  const sp = (searchParams ? await searchParams : {}) ?? {}
  const dados = await carregarDadosRelatoriosGerente({
    de: sp.de,
    ate: sp.ate,
  })

  const relDados: RelatoriosDados = {
    periodo: dados.periodo,
    resumoExecutivo: dados.resumoExecutivo,
    porDia: dados.porDia,
    top: dados.top,
    baixo: dados.baixo,
    rpcErro: dados.rpcErroAmigavel,
  }

  return <RelatoriosContent dados={relDados} />
}
