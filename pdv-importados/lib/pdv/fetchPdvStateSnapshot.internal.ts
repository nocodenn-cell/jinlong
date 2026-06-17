import { createClient } from '@/lib/supabase/server'
import { roundMoney2 } from '@/app/caixa/finalizarVendaValidation'
import type { PdvStateSnapshot } from '../../../shared-core/src/pdv/invariants'

export async function fetchPdvStateSnapshot(
  caixaId: string,
): Promise<PdvStateSnapshot | null> {
  const supabase = await createClient()

  const { data: caixa, error: caixaErr } = await supabase
    .from('caixas')
    .select(
      'id, operador_id, loja_id, status, valor_inicial, valor_fechamento, fechamento_diferenca, fechamento_observacao, data_abertura, data_fechamento',
    )
    .eq('id', caixaId)
    .maybeSingle()

  if (caixaErr || !caixa) return null

  const versionSource = caixa.data_fechamento ?? caixa.data_abertura
  const caixaVersion = Date.parse(versionSource)
  if (!Number.isFinite(caixaVersion)) return null

  const { data: vendas, error: vendasErr } = await supabase
    .from('vendas')
    .select('id, caixa_id, status, total_liquido, forma_pagamento')
    .eq('caixa_id', caixaId)

  if (vendasErr) return null

  const vendaIds = (vendas ?? []).map((v) => v.id)
  let itensPorVenda: PdvStateSnapshot['itensPorVenda'] = {}

  if (vendaIds.length > 0) {
    const { data: itens, error: itensErr } = await supabase
      .from('itens_venda')
      .select('id, venda_id, produto_id, quantidade, preco_unitario, desconto_unitario')
      .in('venda_id', vendaIds)

    if (itensErr) return null

    itensPorVenda = {}
    for (const item of itens ?? []) {
      const list = itensPorVenda[item.venda_id] ?? []
      list.push({
        id: item.id,
        venda_id: item.venda_id,
        produto_id: item.produto_id,
        quantidade: Number(item.quantidade),
        preco_unitario: Number(item.preco_unitario),
        desconto_unitario: Number(item.desconto_unitario ?? 0),
      })
      itensPorVenda[item.venda_id] = list
    }
  }

  // Mesma fonte de verdade do fechamento de caixa: a RPC do banco. Evita
  // acoplar lib/pdv aos internals server do Caixa (boundary). Comportamento
  // idêntico ao wrapper original: parse, validação finita e arredondamento.
  const { data: vsData, error: vsErr } = await supabase.rpc(
    'calcular_valor_sistema_dinheiro_caixa',
    { p_caixa_id: caixaId },
  )
  const vsNum = typeof vsData === 'string' ? Number.parseFloat(vsData) : Number(vsData)
  if (vsErr || !Number.isFinite(vsNum)) {
    return null
  }
  const valorSistemaCalculado = roundMoney2(vsNum)

  return {
    generatedAt: new Date().toISOString(),
    caixaVersion,
    caixa: {
      id: caixa.id,
      operador_id: caixa.operador_id,
      loja_id: caixa.loja_id,
      status: caixa.status,
      valor_inicial: Number(caixa.valor_inicial ?? 0),
      valor_fechamento:
        caixa.valor_fechamento != null ? Number(caixa.valor_fechamento) : null,
      fechamento_diferenca:
        caixa.fechamento_diferenca != null ? Number(caixa.fechamento_diferenca) : null,
      fechamento_observacao: caixa.fechamento_observacao,
      data_abertura: caixa.data_abertura,
      data_fechamento: caixa.data_fechamento,
    },
    vendas: (vendas ?? []).map((v) => ({
      id: v.id,
      caixa_id: v.caixa_id,
      status: v.status,
      total_liquido: Number(v.total_liquido ?? 0),
      forma_pagamento: v.forma_pagamento,
    })),
    itensPorVenda,
    valorSistemaCalculado,
  }
}
