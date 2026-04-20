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

export type RelatoriosGerentePayload = {
  periodo: PeriodoRelatorioResolvido
  tzRelatorio: string
  porDia: RelatorioVendaDiaDTO[]
  top: RelatorioTopProdDTO[]
  baixo: RelatorioEstoqueBaixoDTO[]
  resumoExecutivo: RelatorioResumoExecutivoDTO
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

  const rpcErro = errPorDia?.message ?? errTop?.message ?? errResumo?.message ?? null
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
    rpcErro,
    rpcErroAmigavel,
  }
}
