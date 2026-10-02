'use server'

import { createClient } from '@/lib/supabase/server'
import { getRelatorioTimezone } from '@/lib/relatorios/getRelatorioTimezone'
import {
  inicioDoDiaCivilEmUtc,
  resolverPeriodoRelatorio,
  subtrairDiasCivis,
  type PeriodoRelatorioResolvido,
} from '@/lib/relatorios/periodoRelatorio'
import { mensagemErroParaUsuario } from '@/lib/errors/mensagemErroUsuario'
import { assertGerenteSession } from '@/lib/gerente/auth/assertGerenteSession'
import { getGerenteLojaId } from '@/lib/gerente/auth/sessionContext'
import { LOJA_MATRIZ_ID } from '@/lib/auth/lojaUsuario'
import { metricasDeRpc, type KpisVendasRpcRow } from '@/lib/vendas/metricasVendas'

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

/**
 * Linhas de `v_estoque_ledger_divergencia` (migration 291): produtos cujo
 * `estoque.quantidade_atual` não bate com a soma de `movimentos_estoque_log`.
 * Detector de auditoria — não é ajustado automaticamente.
 */
export type RelatorioDivergenciaEstoqueDTO = {
  produtoId: string
  nome: string
  lojaId: string
  saldoEstoque: number
  somaMovimentos: number
  divergencia: number
  qtdMovimentos: number
  ultimoMovimentoEm: string | null
}

export type RelatoriosGerentePayload = {
  periodo: PeriodoRelatorioResolvido
  tzRelatorio: string
  porDia: RelatorioVendaDiaDTO[]
  top: RelatorioTopProdDTO[]
  baixo: RelatorioEstoqueBaixoDTO[]
  resumoExecutivo: RelatorioResumoExecutivoDTO
  /**
   * Devolução pós-venda e receita líquida do período, da mesma definição canônica de Vendas/Dashboard
   * (`kpis_vendas_gerente`). `faturado` do relatório NÃO desconta devolução; receita líquida = faturado − devoluções.
   */
  devolucoes: number
  receitaLiquida: number
  margemPorVenda: RelatorioMargemVendaDTO[]
  curvaAbc: RelatorioCurvaAbcDTO[]
  coberturaEstoque: RelatorioCoberturaEstoqueDTO[]
  divergenciaEstoque: RelatorioDivergenciaEstoqueDTO[]
  rpcErro: string | null
  rpcErroAmigavel: string | null
}

/** Agrega RPCs e visão de estoque baixo para a tela de relatórios (cliente + RLS). */
export async function carregarDadosRelatoriosGerente(input: {
  de?: string
  ate?: string
}): Promise<RelatoriosGerentePayload> {
  // Defesa em profundidade: hoje esta função só é chamada a partir de
  // /admin/relatorios e /gerente/relatorios, ambas já cobertas pelo
  // middleware, mas essa checagem não deve depender só da rota que a chama.
  const auth = await assertGerenteSession()
  if (!auth.ok) throw new Error(auth.error)

  const supabase = await createClient()
  const tzRelatorio = await getRelatorioTimezone(supabase)
  const periodo = resolverPeriodoRelatorio(input.de, input.ate, tzRelatorio)
  const lojaIdKpis = (await getGerenteLojaId()) ?? LOJA_MATRIZ_ID
  const inicioKpis = inicioDoDiaCivilEmUtc(periodo.de, tzRelatorio)
  // `p_fim` é inclusivo: último instante do dia civil `ate`.
  const fimKpis = new Date(inicioDoDiaCivilEmUtc(subtrairDiasCivis(periodo.ate, -1), tzRelatorio).getTime() - 1)

  // As 8 leituras são independentes entre si (só dependem de período/fuso, já
  // resolvidos): em paralelo. Antes eram 8 awaits em série — o tempo da tela era a
  // SOMA de todas (medido: até 12,4 s). A precedência de `rpcErro` abaixo não muda.
  const [
    { data: porDiaRaw, error: errPorDia },
    { data: topRaw, error: errTop },
    { data: resumoRaw, error: errResumo },
    { data: baixo },
    { data: margemPorVendaRaw, error: errMargemVenda },
    { data: curvaAbcRaw, error: errCurvaAbc },
    { data: coberturaEstoqueRaw, error: errCoberturaEstoque },
    { data: divergenciaEstoqueRaw },
    { data: kpisVendasRaw },
  ] = await Promise.all([
    supabase.rpc('relatorio_vendas_por_dia_periodo', {
      p_de: periodo.de,
      p_ate: periodo.ate,
      p_tz: tzRelatorio,
    }),
    supabase.rpc('relatorio_top_produtos_periodo', {
      p_de: periodo.de,
      p_ate: periodo.ate,
      p_limite: 50,
      p_tz: tzRelatorio,
    }),
    supabase.rpc('relatorio_resumo_executivo_periodo', {
      p_de: periodo.de,
      p_ate: periodo.ate,
      p_tz: tzRelatorio,
    }),
    supabase
      .from('v_estoque_baixo')
      .select('id, nome, codigo_barras, quantidade_atual, estoque_minimo, deficit')
      .limit(40),
    supabase.rpc('relatorio_margem_por_venda_periodo', {
      p_de: periodo.de,
      p_ate: periodo.ate,
      p_tz: tzRelatorio,
      p_limite: 200,
    }),
    supabase.rpc('relatorio_curva_abc_periodo', {
      p_de: periodo.de,
      p_ate: periodo.ate,
      p_tz: tzRelatorio,
      p_limite: 500,
    }),
    supabase.rpc('relatorio_cobertura_estoque', { p_dias_janela: 30, p_limite: 200 }),
    supabase
      .from('v_estoque_ledger_divergencia')
      .select(
        'produto_id, produto_nome, loja_id, saldo_estoque, soma_movimentos, divergencia, qtd_movimentos, ultimo_movimento_em',
      )
      .order('divergencia', { ascending: false })
      .limit(50),
    supabase.rpc('kpis_vendas_gerente', {
      p_loja_id: lojaIdKpis,
      p_inicio: inicioKpis.toISOString(),
      p_fim: fimKpis.toISOString(),
    }),
  ])

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
  const kpisVendas = metricasDeRpc(
    (Array.isArray(kpisVendasRaw) ? kpisVendasRaw[0] : kpisVendasRaw) as KpisVendasRpcRow | undefined,
  )

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
    devolucoes: kpisVendas.devolucoes,
    receitaLiquida: kpisVendas.receitaLiquida,
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
    divergenciaEstoque: ((divergenciaEstoqueRaw ?? []) as Array<{
      produto_id: string
      produto_nome: string
      loja_id: string
      saldo_estoque: number | string
      soma_movimentos: number | string
      divergencia: number | string
      qtd_movimentos: number | string
      ultimo_movimento_em: string | null
    }>).map((r) => ({
      produtoId: String(r.produto_id),
      nome: String(r.produto_nome),
      lojaId: String(r.loja_id),
      saldoEstoque: Number(r.saldo_estoque),
      somaMovimentos: Number(r.soma_movimentos),
      divergencia: Number(r.divergencia),
      qtdMovimentos: Number(r.qtd_movimentos),
      ultimoMovimentoEm: r.ultimo_movimento_em,
    })),
    rpcErro,
    rpcErroAmigavel,
  }
}
