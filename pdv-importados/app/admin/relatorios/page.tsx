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
import { loadAdminContext } from '@/lib/admin/auth/loadAdminContext'
import { getMessages } from '@/i18n/getMessages'
import { localeFromIdioma } from '@/lib/idioma/localeFromIdioma'
import { ROUTES } from '@shared-core/navigation/routes'
import { createClient } from '@/lib/supabase/server'
import { formatBRL } from '@/lib/format/money'
import { SectionCard } from '@/components/ui/admin-v2'
import { RelatoriosContent, type RelatoriosDados } from './_components/RelatoriosContent'

type SearchParams = {
  de?: string
  ate?: string
}

type PageProps = { searchParams?: Promise<SearchParams> }

export default async function AdminRelatoriosPage({ searchParams }: PageProps) {
  const { session } = await loadAdminContext({
    pathname: ROUTES.admin.relatorios,
    resource: `route:${ROUTES.admin.relatorios}`,
  })
  const m = getMessages(session.idioma)
  const ui = m.admin_ui
  const locale = localeFromIdioma(session.idioma)

  const sp = (searchParams ? await searchParams : {}) ?? {}
  const supabase = await createClient()

  const despesasDe = sp.de
    ? (() => { const d = new Date(sp.de); d.setHours(0, 0, 0, 0); return d.toISOString() })()
    : new Date(Date.now() - 30 * 86_400_000).toISOString()
  const despesasAte = sp.ate
    ? (() => { const d = new Date(sp.ate); d.setHours(23, 59, 59, 999); return d.toISOString() })()
    : new Date().toISOString()

  const [dados, despesasRes] = await Promise.all([
    carregarDadosRelatoriosGerente({ de: sp.de, ate: sp.ate }),
    supabase
      .from('contas_pagar_pagamentos')
      .select('valor')
      .gte('data_pagamento', despesasDe)
      .lte('data_pagamento', despesasAte),
  ])

  const receitaLiquida = dados.porDia.reduce((s, r) => s + Number(r.total_liquido ?? 0), 0)
  const totalDescontos = dados.porDia.reduce((s, r) => s + Number(r.total_desconto ?? 0), 0)
  const receitaBruta = receitaLiquida + totalDescontos
  const margemBruta = dados.resumoExecutivo.custo_confiavel
    ? (dados.resumoExecutivo.margem_bruta_estimada ?? null)
    : null
  const custoEstimado = margemBruta !== null ? receitaLiquida - margemBruta : null
  const despesasPagas = despesasRes.error
    ? null
    : (despesasRes.data ?? []).reduce((s, r) => s + Number(r.valor ?? 0), 0)
  const resultadoEstimado =
    margemBruta !== null && despesasPagas !== null ? margemBruta - despesasPagas : null

  const relDados: RelatoriosDados = {
    periodo: dados.periodo,
    resumoExecutivo: dados.resumoExecutivo,
    porDia: dados.porDia,
    top: dados.top,
    baixo: dados.baixo,
    margemPorVenda: dados.margemPorVenda,
    curvaAbc: dados.curvaAbc,
    coberturaEstoque: dados.coberturaEstoque,
    rpcErro: dados.rpcErroAmigavel,
  }

  const fmtBrl = (n: number) => formatBRL(n, locale)

  return (
    <>
    <SectionCard
      title="DRE Simplificado"
      subtitle={`Período: ${dados.periodo.de} a ${dados.periodo.ate}`}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[360px] text-sm">
          <tbody>
            <tr className="border-b border-[#1e1e1e]">
              <td className="py-2 pr-4 text-jl-fg-3">Receita bruta</td>
              <td className="py-2 tabular-nums text-right text-jl-fg-1 font-medium">{fmtBrl(receitaBruta)}</td>
            </tr>
            <tr className="border-b border-[#1e1e1e]">
              <td className="py-2 pr-4 text-jl-fg-3">(-) Descontos concedidos</td>
              <td className="py-2 tabular-nums text-right text-red-400">({fmtBrl(totalDescontos)})</td>
            </tr>
            <tr className="border-b border-[#242424] bg-[#0d0d0d]">
              <td className="py-2.5 pr-4 font-semibold text-jl-fg-1">= Receita líquida</td>
              <td className="py-2.5 tabular-nums text-right font-semibold text-jl-fg-1">{fmtBrl(receitaLiquida)}</td>
            </tr>
            <tr className="border-b border-[#1e1e1e]">
              <td className="py-2 pr-4 text-jl-fg-3">(-) Custo estimado dos produtos</td>
              <td className="py-2 tabular-nums text-right text-red-400">
                {custoEstimado !== null ? `(${fmtBrl(custoEstimado)})` : '—'}
              </td>
            </tr>
            <tr className="border-b border-[#242424] bg-[#0d0d0d]">
              <td className="py-2.5 pr-4 font-semibold text-jl-fg-1">= Margem bruta estimada</td>
              <td className={`py-2.5 tabular-nums text-right font-semibold ${margemBruta !== null ? 'text-emerald-400' : 'text-jl-fg-3'}`}>
                {margemBruta !== null ? fmtBrl(margemBruta) : '—'}
              </td>
            </tr>
            <tr className="border-b border-[#1e1e1e]">
              <td className="py-2 pr-4 text-jl-fg-3">(-) Despesas pagas (contas a pagar)</td>
              <td className="py-2 tabular-nums text-right text-red-400">
                {despesasPagas !== null ? `(${fmtBrl(despesasPagas)})` : '—'}
              </td>
            </tr>
            <tr className="bg-[#0d0d0d]">
              <td className="py-3 pr-4 font-bold text-jl-fg-1 text-base">= Resultado estimado do período</td>
              <td className={`py-3 tabular-nums text-right font-bold text-base ${resultadoEstimado === null ? 'text-jl-fg-3' : resultadoEstimado >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {resultadoEstimado !== null ? fmtBrl(resultadoEstimado) : '—'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      {(!dados.resumoExecutivo.custo_confiavel || despesasRes.error) ? (
        <p className="mt-3 text-[11px] text-amber-400/80">
          {!dados.resumoExecutivo.custo_confiavel
            ? 'Custo dos produtos indisponível (cobertura < 95%) — cadastre o preço de custo nos produtos para ativar o cálculo de margem.'
            : 'Não foi possível carregar as despesas pagas no período.'}
        </p>
      ) : null}
    </SectionCard>

    <RelatoriosContent
      dados={relDados}
      labels={{
        titulo: ui.relatorios_titulo,
        periodoLabel: ui.relatorios_periodo_label,
        aSeparator: ui.relatorios_a_separator,
        custoNaoConfiavel: ui.relatorios_custo_nao_confiavel,
        chartFaturamento: ui.relatorios_chart_faturamento,
        chartPagamentos: ui.relatorios_chart_pagamentos,
        labelConcluidas: ui.relatorios_label_concluidas,
        labelCanceladas: ui.relatorios_label_canceladas,
        labelAjustes: ui.relatorios_label_ajustes,
        secTopProdutos: ui.relatorios_sec_top_produtos,
        secEstoqueReposicao: ui.relatorios_sec_estoque_reposicao,
        secMargemPorVenda: ui.relatorios_sec_margem_por_venda,
        margemVendaColData: ui.relatorios_margem_venda_col_data,
        margemVendaColLiquido: ui.relatorios_margem_venda_col_liquido,
        margemVendaColCusto: ui.relatorios_margem_venda_col_custo,
        margemVendaColMargem: ui.relatorios_margem_venda_col_margem,
        margemVendaCustoIndisponivel: ui.relatorios_margem_venda_custo_indisponivel,
        vazioMargemVenda: ui.relatorios_vazio_margem_venda,
        secCurvaAbc: ui.relatorios_sec_curva_abc,
        curvaAbcColNome: ui.relatorios_curva_abc_col_nome,
        curvaAbcColValor: ui.relatorios_curva_abc_col_valor,
        curvaAbcColAcumulado: ui.relatorios_curva_abc_col_acumulado,
        curvaAbcColClasse: ui.relatorios_curva_abc_col_classe,
        vazioCurvaAbc: ui.relatorios_vazio_curva_abc,
        secCoberturaEstoque: ui.relatorios_sec_cobertura_estoque,
        coberturaEstoqueHint: ui.relatorios_cobertura_estoque_hint,
        coberturaEstoqueColAtual: ui.relatorios_cobertura_estoque_col_atual,
        coberturaEstoqueColMedia: ui.relatorios_cobertura_estoque_col_media,
        coberturaEstoqueColDias: ui.relatorios_cobertura_estoque_col_dias,
        vazioCoberturaEstoque: ui.relatorios_vazio_cobertura_estoque,
        origemChina: ui.relatorios_origem_china,
        origemBrasil: ui.relatorios_origem_brasil,
        vazioProdutos: ui.relatorios_vazio_produtos,
        saldoMinTemplate: ui.relatorios_saldo_min_template,
        reporTemplate: ui.relatorios_repor_template,
        vazioEstoque: ui.relatorios_vazio_estoque,
        tooltipFaturado: ui.relatorios_tooltip_faturado,
        noDataLabel: ui.relatorios_vazio_produtos,
        filtros: {
          de: ui.relatorios_filtro_de,
          ate: ui.relatorios_filtro_ate,
          aplicar: ui.relatorios_filtro_aplicar,
          exportarCsv: ui.relatorios_filtro_exportar_csv,
          xlsx: ui.relatorios_filtro_xlsx,
          csvFilename: ui.relatorios_csv_filename,
        },
        locale,
      }}
    />
    </>
  )
}
