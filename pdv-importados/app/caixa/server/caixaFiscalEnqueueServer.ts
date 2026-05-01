import { createClient } from '@/lib/supabase/server'
import type { FinalizarVendaInput } from '@/app/caixa/finalizarVendaValidation'
import { roundMoney2 } from '@/app/caixa/finalizarVendaValidation'
import type { ItemAutoritativo } from '@/app/caixa/server/caixaPrecoAutoritativoServer'

type FiscalDocType = 'NFC_E_STUB' | 'NFCE' | 'NFE'

function resolveFiscalDocType(rawValue: string | undefined): FiscalDocType {
  const normalized = (rawValue ?? '').trim().toUpperCase()
  if (normalized === 'NFCE' || normalized === 'NFE') return normalized
  return 'NFC_E_STUB'
}

export async function enfileirarDocumentoFiscalPosVenda(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: FinalizarVendaInput,
  itensAut: ItemAutoritativo[],
  dados: {
    vendaId: string
    lojaId: string
    caixaId: string
    operadorId: string
    computedFinal: { totalBruto: number; totalDesconto: number; totalLiquido: number }
  },
): Promise<void> {
  if (process.env.AUTO_ENQUEUE_FISCAL_ON_SALE !== 'true') return

  const tipoDoc = resolveFiscalDocType(process.env.FISCAL_DEFAULT_DOC_TYPE)
  const payload = {
    origem: 'caixa_web',
    venda_id: dados.vendaId,
    loja_id: dados.lojaId,
    caixa_id: dados.caixaId,
    operador_id: dados.operadorId,
    forma_pagamento: input.formaPagamento,
    pagamentos: input.pagamentos.map((p) => ({
      forma_pagamento: p.formaPagamento,
      valor: roundMoney2(p.valor),
    })),
    totais: {
      bruto: roundMoney2(dados.computedFinal.totalBruto),
      desconto: roundMoney2(dados.computedFinal.totalDesconto),
      liquido: roundMoney2(dados.computedFinal.totalLiquido),
    },
    itens: itensAut.map((i) => ({
      produto_id: i.produtoId,
      quantidade: i.quantidade,
      preco_original: roundMoney2(i.precoOriginal),
      preco_unitario: roundMoney2(i.precoUnitario),
      desconto_unitario: roundMoney2(i.descontoUnitario),
      tipo_preco: i.tipoPreco,
    })),
  }

  const { error } = await supabase.rpc('fiscal_enfileirar_documento_venda', {
    p_venda_id: dados.vendaId,
    p_tipo_doc: tipoDoc,
    p_payload: payload,
  })

  if (error) {
    // Silently handle fiscal enqueue errors
  }
}
