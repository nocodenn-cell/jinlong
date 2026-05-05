/**
 * Server actions para buscar dados do dashboard gerente
 */

import { createClient } from '@/lib/supabase/server'

export interface DashboardMetrics {
  faturamentoHoje: number
  ticketMedioHoje: number
  quantidadeVendasHoje: number
  documentosFiscaisPendentes: number
  titulosEmAberto: number
}

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const supabase = await createClient()

  // Data de hoje
  const inicio = new Date()
  inicio.setHours(0, 0, 0, 0)
  const fim = new Date(inicio)
  fim.setDate(fim.getDate() + 1)

  // 1. Faturamento hoje
  const { data: vendasHoje } = await supabase
    .from('vendas')
    .select('total_liquido')
    .gte('data', inicio.toISOString())
    .lt('data', fim.toISOString())
    .eq('status', 'CONCLUIDA')

  const faturamentoHoje = (vendasHoje ?? []).reduce((s, r) => s + Number(r.total_liquido ?? 0), 0)

  // 2. Quantidade de vendas hoje
  const { count: quantidadeVendasHoje } = await supabase
    .from('vendas')
    .select('*', { count: 'exact', head: true })
    .gte('data', inicio.toISOString())
    .lt('data', fim.toISOString())
    .eq('status', 'CONCLUIDA')

  // 3. Ticket médio hoje
  const ticketMedioHoje = (quantidadeVendasHoje ?? 0) > 0 ? faturamentoHoje / Number(quantidadeVendasHoje) : 0

  // 4. Documentos fiscais pendentes
  const { count: documentosFiscaisPendentes } = await supabase
    .from('documentos_fiscais_pendentes')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'PENDENTE')

  // 5. Títulos em aberto (total a receber)
  const { data: titulosAbertos } = await supabase
    .from('titulos_receber')
    .select('valor')
    .eq('status', 'ABERTO')

  const titulosEmAberto = (titulosAbertos ?? []).reduce((s, r) => s + Number(r.valor ?? 0), 0)

  return {
    faturamentoHoje,
    ticketMedioHoje,
    quantidadeVendasHoje: quantidadeVendasHoje ?? 0,
    documentosFiscaisPendentes: documentosFiscaisPendentes ?? 0,
    titulosEmAberto,
  }
}
