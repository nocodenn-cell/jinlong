import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { AtividadeRailItem, AtividadeRailTipo, AtividadeRailSeverity } from '../recent/route'

export type { AtividadeRailItem, AtividadeRailTipo }

export type AtividadeHistoryPayload = {
  items: AtividadeRailItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50

const WINDOW_MAP: Record<string, number> = {
  '2h':  2  * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d':  7  * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
}

function sinceISO(w: string): string {
  const ms = WINDOW_MAP[w] ?? WINDOW_MAP['24h']
  return new Date(Date.now() - ms).toISOString()
}

function fiscalTitulo(eventoTipo: string, statusDepois: string | null): string {
  if (statusDepois === 'ERRO') return `Erro fiscal · ${eventoTipo}`
  return eventoTipo || 'Evento fiscal'
}

function fiscalSeverity(statusDepois: string | null): AtividadeRailSeverity {
  if (statusDepois === 'ERRO') return 'error'
  if (statusDepois === 'PENDENTE') return 'warning'
  return 'info'
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const windowParam = searchParams.get('window') ?? '24h'
  const tipo        = searchParams.get('tipo')   ?? 'ALL'
  const page        = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))

  try {
    const supabase = await createClient()
    const since    = sinceISO(windowParam)
    const items: AtividadeRailItem[] = []

    if (tipo === 'ALL' || tipo === 'VENDA') {
      const { data } = await supabase
        .from('vendas')
        .select('id, total_liquido, created_at')
        .eq('status', 'FINALIZADA')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(200)
      for (const v of data ?? []) {
        const val = Number(v.total_liquido ?? 0)
        const fmt = val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
        items.push({ id: `venda-${v.id}`, tipo: 'VENDA', titulo: `Venda finalizada · ${fmt}`, ts: v.created_at, severity: 'info' })
      }
    }

    if (tipo === 'ALL' || tipo === 'FISCAL_OK' || tipo === 'FISCAL_ERRO') {
      const { data } = await supabase
        .from('documentos_fiscais_eventos')
        .select('id, evento_tipo, status_depois, created_at')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(200)
      for (const fe of data ?? []) {
        const sd: string | null = fe.status_depois ?? null
        const computedTipo: AtividadeRailTipo = sd === 'ERRO' ? 'FISCAL_ERRO' : 'FISCAL_OK'
        if (tipo !== 'ALL' && tipo !== computedTipo) continue
        items.push({ id: `fiscal-${fe.id}`, tipo: computedTipo, titulo: fiscalTitulo(fe.evento_tipo, sd), ts: fe.created_at, severity: fiscalSeverity(sd) })
      }
    }

    if (tipo === 'ALL' || tipo === 'CAIXA') {
      const { data } = await supabase
        .from('movimentacoes_caixa')
        .select('id, tipo, valor, created_at')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(200)
      for (const mc of data ?? []) {
        const val = Number(mc.valor ?? 0)
        const fmt = val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
        const t   = String(mc.tipo ?? '')
        const label = t === 'sangria' ? 'Sangria' : t === 'suprimento' ? 'Suprimento' : 'Movimentação'
        items.push({ id: `caixa-${mc.id}`, tipo: 'CAIXA', titulo: `${label} · ${fmt}`, ts: mc.created_at, severity: 'info' })
      }
    }

    items.sort((a, b) => b.ts.localeCompare(a.ts))
    const total      = items.length
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
    const safePage   = Math.min(page, totalPages)
    const slice      = items.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

    return NextResponse.json({ items: slice, total, page: safePage, pageSize: PAGE_SIZE, totalPages } satisfies AtividadeHistoryPayload)
  } catch {
    return NextResponse.json({ items: [], total: 0, page: 1, pageSize: PAGE_SIZE, totalPages: 1 } satisfies AtividadeHistoryPayload)
  }
}
