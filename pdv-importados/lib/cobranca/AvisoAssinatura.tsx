import 'server-only'
import React from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { ROUTES } from '@/lib/navigation/routes'

type Minha = { legado: boolean; status: string | null; motivo_status: string | null; trial_fim: string | null } | null

/** Faixa no topo do painel: dias de trial, atraso, suspensão (leva o dono à escolha de plano). Best-effort. */
export async function AvisoAssinatura() {
  let a: Minha = null
  try {
    const supabase = await createClient()
    const { data } = await (supabase as unknown as { rpc: (f: string) => Promise<{ data: unknown }> }).rpc('fp_minha_assinatura')
    a = (data ?? null) as Minha
  } catch {
    return null
  }
  if (!a || a.legado || !a.status || a.status === 'ATIVA') return null
  let texto: string
  if (a.status === 'TRIAL') {
    const dias = Math.max(0, Math.ceil((new Date(a.trial_fim ?? 0).getTime() - Date.now()) / 86_400_000))
    texto = `Teste grátis: ${dias} dia(s) restante(s). / 免费试用剩余 ${dias} 天。`
  } else if (a.status === 'INADIMPLENTE') {
    texto = 'Pagamento em atraso: regularize para evitar a suspensão. / 付款逾期，请尽快处理以免暂停。'
  } else if (a.motivo_status === 'TRIAL_EXPIRADO') {
    texto = 'Seu teste grátis terminou. Escolha um plano para voltar a vender. / 免费试用已结束，请选择方案以继续销售。'
  } else {
    texto = 'Assinatura suspensa ou cancelada: vendas bloqueadas. / 订阅已暂停或取消，销售已锁定。'
  }
  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-2 bg-amber-100 px-4 py-2 text-sm text-amber-900">
      <span>{texto}</span>
      <Link href={ROUTES.admin.assinatura} className="font-medium underline">Assinatura / 订阅</Link>
    </div>
  )
}
