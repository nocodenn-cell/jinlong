import type { AsaasApi } from './asaas'

type Rpc = { rpc: (fn: string, a?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> }

export type ResultadoConciliacao = { assinaturas: number; pagamentos: number; falhasAsaas: number; falhasBanco: number }

/**
 * Polling do Asaas (fonte da verdade) para cada assinatura não cancelada; aplica o status atual de cada
 * cobrança como evento idempotente (`cobranca_conciliar_pagamento`). Recupera webhook perdido e
 * corrige ordem. Falha ao falar com o Asaas é TRANSITÓRIA: conta e segue, sem alterar nada no banco.
 */
export async function conciliarComAsaas(db: Rpc, asaas: AsaasApi): Promise<ResultadoConciliacao> {
  const r: ResultadoConciliacao = { assinaturas: 0, pagamentos: 0, falhasAsaas: 0, falhasBanco: 0 }
  const { data, error } = await db.rpc('cobranca_assinaturas_para_conciliar')
  if (error || !Array.isArray(data)) return { ...r, falhasBanco: 1 }
  for (const a of data as { asaas_subscription_id: string }[]) {
    r.assinaturas++
    let cobrancas
    try {
      cobrancas = await asaas.cobrancasDaAssinatura(a.asaas_subscription_id)
    } catch {
      r.falhasAsaas++
      continue
    }
    for (const c of cobrancas) {
      const { error: e } = await db.rpc('cobranca_conciliar_pagamento', {
        p_payment: { ...c, subscription: a.asaas_subscription_id },
      })
      if (e) r.falhasBanco++
      else r.pagamentos++
    }
  }
  return r
}
