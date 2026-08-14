'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { assertGerenteSession } from '@/lib/gerente/auth/assertGerenteSession'
import { LOJA_MATRIZ_ID } from '@/lib/auth/lojaUsuario'
import { mensagemErroComSecao } from '@/lib/errors/mensagemErroUsuario'

type ActionResult<T> = { success: true; data: T } | { success: false; error: string }

/**
 * KPIs por operador. Semântica explícita (contrato de
 * `public.resumo_comissoes_por_operador`, que projeta a view certificada
 * `comissoes_reconstrucao_auditoria` — nenhum valor aqui é recalculado no
 * frontend):
 *  - totalComissaoBruta: soma do fato original congelado na venda, ANTES de
 *    qualquer ajuste.
 *  - totalAjustes: soma dos ajustes lançados (cancelamento/devolução/troca)
 *    no período.
 *  - totalLiquidoPago: soma do que REALMENTE saiu do caixa (valor líquido de
 *    `comissoes_pagamentos`), não o bruto das comissões marcadas 'pago'.
 *  - totalSaldoResidual: quanto ainda falta compensar/pagar para esse
 *    operador agora — inclui ajuste que chegou depois de uma comissão já paga.
 */
export type ComissaoResumoRow = {
  operadorId: string
  operadorNome: string
  totalVendas: number
  totalComissaoBruta: number
  totalAjustes: number
  totalLiquidoPago: number
  totalSaldoResidual: number
}

export type AjusteComissao = {
  ajusteId: string
  tipo: 'CANCELAMENTO' | 'DEVOLUCAO' | 'TROCA'
  valor: number
  atorId: string | null
  origemTipo: 'VENDA' | 'OPERACAO_POS_VENDA'
  origemOcorridaEm: string | null
  vendaSubstitutaId: string | null
  createdAt: string
  valorConsumido: number
  valorPendente: number
}

/**
 * Detalhe por comissão (fato original congelado), com o array de ajustes que
 * a afetaram. Todos os valores vêm de `public.detalhe_comissoes_operador`,
 * que projeta as views certificadas de DB-05E — nada é recalculado aqui.
 *
 * `valorCompensado` é quanto do ajuste DESTA venda já foi absorvido por
 * ALGUM pagamento (não necessariamente o pagamento desta própria comissão —
 * o motor de liquidação consome ajustes do operador do mais antigo para o
 * mais novo, não por comissão isolada). `valorPago` é o que ESTA comissão
 * especificamente rendeu quando foi paga, que pode diferir de
 * bruto−ajustado exatamente por esse motivo.
 */
export type ComissaoDetalheRow = {
  comissaoId: string
  vendaId: string
  baseCalculo: number
  status: string
  createdAt: string
  valorOriginal: number
  valorAjustado: number
  valorCompensado: number
  valorLiquidoApurado: number
  valorPago: number | null
  pagamentoId: string | null
  pagoEm: string | null
  saldoFinal: number
  ajustes: AjusteComissao[]
}

/** Resultado real de `liquidar_comissoes` — nunca reduzido a uma contagem. */
export type LiquidacaoResultado = {
  pagamentoId: string
  valorBruto: number
  valorCompensado: number
  valorLiquido: number
  comissoesPagas: number
  idempotentReplay: boolean
}

const FiltroComissoesSchema = z.object({
  de: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  ate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.enum(['todos', 'pendente', 'pago']).default('todos'),
})

export type FiltroComissoes = z.infer<typeof FiltroComissoesSchema>

export async function carregarResumoComissoes(
  filtro: unknown,
): Promise<ActionResult<ComissaoResumoRow[]>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = FiltroComissoesSchema.safeParse(filtro)
  if (!parsed.success) return { success: false, error: 'Filtro inválido.' }

  const lojaId = auth.session.lojaId ?? LOJA_MATRIZ_ID
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('resumo_comissoes_por_operador', {
    p_loja_id: lojaId,
    p_de: parsed.data.de ?? null,
    p_ate: parsed.data.ate ?? null,
    p_status: parsed.data.status,
  })

  if (error) return { success: false, error: mensagemErroComSecao('Comissões', error.message) }

  return {
    success: true,
    data: (data ?? []).map((r: Record<string, unknown>) => ({
      operadorId: String(r.operador_id),
      operadorNome: String(r.operador_nome),
      totalVendas: Number(r.total_vendas),
      totalComissaoBruta: Number(r.total_comissao_bruta),
      totalAjustes: Number(r.total_ajustes),
      totalLiquidoPago: Number(r.total_liquido_pago),
      totalSaldoResidual: Number(r.total_saldo_residual),
    })),
  }
}

export async function carregarDetalheComissoes(
  operadorId: string,
  filtro: FiltroComissoes,
): Promise<ActionResult<ComissaoDetalheRow[]>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const lojaId = auth.session.lojaId ?? LOJA_MATRIZ_ID
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('detalhe_comissoes_operador', {
    p_loja_id: lojaId,
    p_operador_id: operadorId,
    p_de: filtro.de ?? null,
    p_ate: filtro.ate ?? null,
  })

  if (error) return { success: false, error: mensagemErroComSecao('Comissões detalhe', error.message) }

  return {
    success: true,
    data: (data ?? []).map((r: Record<string, unknown>) => {
      const ajustesRaw = Array.isArray(r.ajustes) ? (r.ajustes as Record<string, unknown>[]) : []
      return {
        comissaoId: String(r.comissao_id),
        vendaId: String(r.venda_id),
        baseCalculo: Number(r.base_calculo),
        status: String(r.status),
        createdAt: String(r.created_at),
        valorOriginal: Number(r.valor_original),
        valorAjustado: Number(r.valor_ajustado),
        valorCompensado: Number(r.valor_compensado),
        valorLiquidoApurado: Number(r.valor_liquido_apurado),
        valorPago: r.valor_pago == null ? null : Number(r.valor_pago),
        pagamentoId: r.pagamento_id ? String(r.pagamento_id) : null,
        pagoEm: r.pago_em ? String(r.pago_em) : null,
        saldoFinal: Number(r.saldo_final),
        ajustes: ajustesRaw.map((a) => ({
          ajusteId: String(a.ajuste_id),
          tipo: a.tipo as AjusteComissao['tipo'],
          valor: Number(a.valor),
          atorId: a.ator_id ? String(a.ator_id) : null,
          origemTipo: a.origem_tipo as AjusteComissao['origemTipo'],
          origemOcorridaEm: a.origem_ocorrida_em ? String(a.origem_ocorrida_em) : null,
          vendaSubstitutaId: a.venda_substituta_id ? String(a.venda_substituta_id) : null,
          createdAt: String(a.created_at),
          valorConsumido: Number(a.valor_consumido),
          valorPendente: Number(a.valor_pendente),
        })),
      }
    }),
  }
}

const MarcarPagasSchema = z.object({
  operador_id: z.string().uuid(),
  ids: z.array(z.string().uuid()).min(1),
})

/**
 * Chave de idempotência determinística para uma liquidação: mesmo operador +
 * mesmo conjunto de comissões sempre produz a mesma chave, independente da
 * ordem de seleção na UI — um retry (duplo clique, falha de rede) cai no
 * mesmo `idempotent_replay` em vez de criar um segundo pagamento. Isto não é
 * uma regra financeira: é só a formatação da chave que `liquidar_comissoes`
 * já exige como parâmetro.
 */
function chaveIdempotenciaLiquidacao(lojaId: string, operadorId: string, ids: string[]): string {
  const ordenados = [...ids].sort()
  return `liquidacao-ui:${lojaId}:${operadorId}:${ordenados.join(',')}`
}

/**
 * Liquida as comissões selecionadas via `liquidar_comissoes` (DB-05A,
 * certificada) e devolve o resultado real — bruto, compensado, líquido e o
 * pagamento gerado. Não usa mais `marcar_comissoes_pagas`, cujo contrato
 * (`RETURNS integer`) descartava essa informação.
 */
export async function marcarComissoesPagas(
  input: unknown,
): Promise<ActionResult<LiquidacaoResultado>> {
  const auth = await assertGerenteSession()
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = MarcarPagasSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Dados inválidos.' }

  const lojaId = auth.session.lojaId ?? LOJA_MATRIZ_ID
  const supabase = await createClient()
  const idempotencyKey = chaveIdempotenciaLiquidacao(lojaId, parsed.data.operador_id, parsed.data.ids)

  const { data, error } = await supabase.rpc('liquidar_comissoes', {
    p_loja_id: lojaId,
    p_operador_id: parsed.data.operador_id,
    p_ids: parsed.data.ids,
    p_idempotency_key: idempotencyKey,
  })

  if (error) return { success: false, error: mensagemErroComSecao('Liquidar comissões', error.message) }

  const row = Array.isArray(data) ? data[0] : data
  if (!row) return { success: false, error: 'Liquidação não retornou resultado.' }

  revalidatePath('/gerente/comissoes')
  return {
    success: true,
    data: {
      pagamentoId: String(row.pagamento_id),
      valorBruto: Number(row.valor_bruto),
      valorCompensado: Number(row.valor_compensado),
      valorLiquido: Number(row.valor_liquido),
      comissoesPagas: Number(row.comissoes_pagas),
      idempotentReplay: Boolean(row.idempotent_replay),
    },
  }
}
