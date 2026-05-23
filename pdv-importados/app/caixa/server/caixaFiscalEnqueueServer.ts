import { createClient } from '@/lib/supabase/server'
import type { FinalizarVendaInput } from '@/app/caixa/finalizarVendaValidation'
import { roundMoney2 } from '@/app/caixa/finalizarVendaValidation'
import type { ItemAutoritativo } from '@/app/caixa/server/caixaPrecoAutoritativoServer'
import { getCaixaSalesRuntimeConfig } from '@/lib/config/caixaSalesRuntimeConfig'

type FiscalDocType = 'NFC_E_STUB' | 'NFCE' | 'NFE'

function resolveFiscalDocType(rawValue: string | undefined): FiscalDocType {
  const normalized = (rawValue ?? '').trim().toUpperCase()
  if (normalized === 'NFCE' || normalized === 'NFE') return normalized
  return 'NFC_E_STUB'
}

export type EnfileirarFiscalResult =
  | { ok: true }
  | { ok: false; skipped: true }
  | { ok: false; skipped?: false; error: string }

/**
 * Enfileira documento fiscal após venda (fluxo legado / chamadas explícitas).
 * A venda JÁ FOI gravada quando esta função é chamada — falhas fiscais NUNCA devem
 * reverter a venda. Erros são apenas logados e retornados como resultado estruturado.
 */
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
): Promise<EnfileirarFiscalResult> {
  if (!getCaixaSalesRuntimeConfig().autoEnqueueFiscalOnSale) return { ok: false, skipped: true }

  const tipoDoc = resolveFiscalDocType(process.env.FISCAL_DEFAULT_DOC_TYPE)
  const idempotencyKey = `fiscal_${dados.vendaId}_${tipoDoc}`
  const payload = {
    origem: 'caixa_web',
    venda_id: dados.vendaId,
    loja_id: dados.lojaId,
    caixa_id: dados.caixaId,
    operador_id: dados.operadorId,
    idempotency_key: idempotencyKey,
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

  try {
    const { error } = await supabase.rpc('fiscal_enfileirar_documento_venda', {
      p_venda_id: dados.vendaId,
      p_tipo_doc: tipoDoc,
      p_payload: payload,
    })

    if (error) {
      const detalhe = {
        venda_id: dados.vendaId,
        tipo_doc: tipoDoc,
        idempotency_key: idempotencyKey,
        code: error.code,
      }
      // Best-effort: log the enqueue failure event; ignore errors from this secondary call.
      supabase.rpc('fiscal_registrar_evento_enqueue_erro', {
        p_venda_id: dados.vendaId,
        p_tipo_doc: tipoDoc,
        p_erro_mensagem: error.message,
        p_detalhe: detalhe,
      }).then(({ error: logErr }) => {
        if (logErr) console.error('[caixa.fiscal_enqueue.evento_erro_rpc]', logErr.message)
      })
      console.error('[caixa.fiscal_enqueue.rpc_error]', { ...detalhe, message: error.message })
      return { ok: false, error: error.message }
    }

    return { ok: true }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('[caixa.fiscal_enqueue.unexpected]', { venda_id: dados.vendaId, message })
    return { ok: false, error: message }
  }
}
