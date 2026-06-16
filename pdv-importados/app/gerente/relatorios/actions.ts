'use server'

import { createClient } from '@/lib/supabase/server'
import { getRelatorioTimezone } from '@/lib/relatorios/getRelatorioTimezone'
import {
  resolverPeriodoRelatorio,
  type PeriodoRelatorioResolvido,
} from '@/lib/relatorios/periodoRelatorio'
import { mensagemErroParaUsuario } from '@/lib/errors/mensagemErroUsuario'

export type RelatorioVendaDiaDTO = {
  dia: string
  num_vendas: number
  total_liquido: number
  ticket_medio: number
  total_desconto: number
}

export type RelatorioTopProdDTO = {
  id: string
  nome: string
  origem: string
  total_quantidade: number
  total_valor: number
  num_vendas: number
}

export type RelatorioEstoqueBaixoDTO = {
  id: string
  nome: string
  codigo_barras: string | null
  quantidade_atual: number
  estoque_minimo: number
  deficit: number
}

export type RelatorioResumoExecutivoDTO = {
  itens_vendidos: number
  vendas_concluidas: number
  vendas_canceladas: number
  taxa_cancelamento: number
  cobertura_custo: number
  custo_confiavel: boolean
  margem_bruta_estimada: number | null
}

export type RelatorioMargemVendaDTO = {
  venda_id: string
  data: string
  num_itens: number
  total_liquido: number
  total_desconto: number
  custo_total_estimado: number | null
  margem_estimada: number | null
  custo_confiavel: boolean
}

export type RelatorioCurvaAbcDTO = {
  produtoId: string
  nome: string
  totalQuantidade: number
  totalValor: number
  percentualValor: number
  percentualAcumulado: number
  classeAbc: 'A' | 'B' | 'C'
}

/**
 * Indicador histórico de cobertura de estoque (view analítica passiva).
 * `diasCobertura` é determinístico e NÃO preditivo: estoque físico atual /
 * média diária de vendas recentes. Proibido usar para decisão automática.
 */
export type RelatorioCoberturaEstoqueDTO = {
  produtoId: string
  nome: string
  lojaId: string
  quantidadeAtual: number
  mediaDiariaVendida: number
  diasCobertura: number | null
}

export type RelatoriosGerentePayload = {
  periodo: PeriodoRelatorioResolvido
  tzRelatorio: string
  porDia: RelatorioVendaDiaDTO[]
  top: RelatorioTopProdDTO[]
  baixo: RelatorioEstoqueBaixoDTO[]
  resumoExecutivo: RelatorioResumoExecutivoDTO
  margemPorVenda: RelatorioMargemVendaDTO[]
  curvaAbc: RelatorioCurvaAbcDTO[]
  coberturaEstoque: RelatorioCoberturaEstoqueDTO[]
  rpcErro: string | null
  rpcErroAmigavel: string | null
}

/** Agrega RPCs e visão de estoque baixo para a tela de relatórios (cliente + RLS). */
export async function carregarDadosRelatoriosGerente(input: {
  de?: string
  ate?: string
}): Promise<RelatoriosGerentePayload> {
  const supabase = await createClient()
  const tzRelatorio = await getRelatorioTimezone(supabase)
  const periodo = resolverPeriodoRelatorio(input.de, input.ate, tzRelatorio)

  const { data: porDiaRaw, error: errPorDia } = await supabase.rpc('relatorio_vendas_por_dia_periodo', {
    p_de: periodo.de,
    p_ate: periodo.ate,
    p_tz: tzRelatorio,
  })

  const { data: topRaw, error: errTop } = await supabase.rpc('relatorio_top_produtos_periodo', {
    p_de: periodo.de,
    p_ate: periodo.ate,
    p_limite: 50,
    p_tz: tzRelatorio,
  })
  const { data: resumoRaw, error: errResumo } = await supabase.rpc(
    'relatorio_resumo_executivo_periodo',
    {
      p_de: periodo.de,
      p_ate: periodo.ate,
      p_tz: tzRelatorio,
    },
  )

  const { data: baixo } = await supabase
    .from('v_estoque_baixo')
    .select('id, nome, codigo_barras, quantidade_atual, estoque_minimo, deficit')
    .limit(40)

  const { data: margemPorVendaRaw, error: errMargemVenda } = await supabase.rpc(
    'relatorio_margem_por_venda_periodo',
    {
      p_de: periodo.de,
      p_ate: periodo.ate,
      p_tz: tzRelatorio,
      p_limite: 200,
    },
  )

  const { data: curvaAbcRaw, error: errCurvaAbc } = await supabase.rpc('relatorio_curva_abc_periodo', {
    p_de: periodo.de,
    p_ate: periodo.ate,
    p_tz: tzRelatorio,
    p_limite: 500,
  })

  const { data: coberturaEstoqueRaw, error: errCoberturaEstoque } = await supabase.rpc(
    'relatorio_cobertura_estoque',
    { p_dias_janela: 30, p_limite: 200 },
  )

  const rpcErro =
    errPorDia?.message ??
    errTop?.message ??
    errResumo?.message ??
    errMargemVenda?.message ??
    errCurvaAbc?.message ??
    errCoberturaEstoque?.message ??
    null
  const rpcErroAmigavel = rpcErro ? mensagemErroParaUsuario(rpcErro) : null
  const resumo = Array.isArray(resumoRaw) ? resumoRaw[0] : resumoRaw

  return {
    periodo: {
      de: periodo.de,
      ate: periodo.ate,
      aviso: periodo.aviso,
    },
    tzRelatorio,
    porDia: (porDiaRaw ?? []) as RelatorioVendaDiaDTO[],
    top: (topRaw ?? []) as RelatorioTopProdDTO[],
    baixo: (baixo ?? []) as RelatorioEstoqueBaixoDTO[],
    resumoExecutivo: {
      itens_vendidos: Number(resumo?.itens_vendidos ?? 0),
      vendas_concluidas: Number(resumo?.vendas_concluidas ?? 0),
      vendas_canceladas: Number(resumo?.vendas_canceladas ?? 0),
      taxa_cancelamento: Number(resumo?.taxa_cancelamento ?? 0),
      cobertura_custo: Number(resumo?.cobertura_custo ?? 0),
      custo_confiavel: Boolean(resumo?.custo_confiavel),
      margem_bruta_estimada:
        resumo?.margem_bruta_estimada === null || resumo?.margem_bruta_estimada === undefined
          ? null
          : Number(resumo.margem_bruta_estimada),
    },
    margemPorVenda: ((margemPorVendaRaw ?? []) as Array<{
      venda_id: string
      data: string
      num_itens: number | string
      total_liquido: number | string
      total_desconto: number | string
      custo_total_estimado: number | string | null
      margem_estimada: number | string | null
      custo_confiavel: boolean
    }>).map((r) => ({
      venda_id: String(r.venda_id),
      data: String(r.data),
      num_itens: Number(r.num_itens),
      total_liquido: Number(r.total_liquido),
      total_desconto: Number(r.total_desconto),
      custo_total_estimado: r.custo_total_estimado == null ? null : Number(r.custo_total_estimado),
      margem_estimada: r.margem_estimada == null ? null : Number(r.margem_estimada),
      custo_confiavel: Boolean(r.custo_confiavel),
    })),
    curvaAbc: ((curvaAbcRaw ?? []) as Array<{
      produto_id: string
      nome: string
      total_quantidade: number | string
      total_valor: number | string
      percentual_valor: number | string
      percentual_acumulado: number | string
      classe_abc: string
    }>).map((r) => ({
      produtoId: String(r.produto_id),
      nome: String(r.nome),
      totalQuantidade: Number(r.total_quantidade),
      totalValor: Number(r.total_valor),
      percentualValor: Number(r.percentual_valor),
      percentualAcumulado: Number(r.percentual_acumulado),
      classeAbc: (r.classe_abc === 'A' || r.classe_abc === 'B' ? r.classe_abc : 'C') as 'A' | 'B' | 'C',
    })),
    coberturaEstoque: ((coberturaEstoqueRaw ?? []) as Array<{
      produto_id: string
      nome: string
      loja_id: string
      quantidade_atual: number | string
      media_diaria_vendida: number | string
      dias_cobertura: number | string | null
    }>).map((r) => ({
      produtoId: String(r.produto_id),
      nome: String(r.nome),
      lojaId: String(r.loja_id),
      quantidadeAtual: Number(r.quantidade_atual),
      mediaDiariaVendida: Number(r.media_diaria_vendida),
      diasCobertura: r.dias_cobertura == null ? null : Number(r.dias_cobertura),
    })),
    rpcErro,
    rpcErroAmigavel,
  }
}
