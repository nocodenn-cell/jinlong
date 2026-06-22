import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAdminSessionApi } from '@/lib/admin/auth/requireAdminSessionApi'
import { formatBRL } from '@/lib/format/money'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export type AtividadeRailTipo = 'VENDA' | 'FISCAL_OK' | 'FISCAL_ERRO' | 'CAIXA'
export type AtividadeRailSeverity = 'info' | 'warning' | 'error'

export type AtividadeRailItem = {
  id: string
  tipo: AtividadeRailTipo
  titulo: string
  ts: string
  severity: AtividadeRailSeverity
}

export type AtividadeFeedPayload = {
  items: AtividadeRailItem[]
  generatedAt: string
}

const WINDOW_MS = 2 * 60 * 60 * 1000 // 2h

function windowISO(): string {
  return new Date(Date.now() - WINDOW_MS).toISOString()
}

function fiscalTitulo(eventoTipo: string, statusDepois: string | null): string {
  if (statusDepois === 'ERRO') return `Erro fiscal · ${eventoTipo}`
  if (eventoTipo) return eventoTipo
  return 'Evento fiscal'
}

function fiscalSeverity(statusDepois: string | null): AtividadeRailSeverity {
  if (statusDepois === 'ERRO') return 'error'
  if (statusDepois === 'PENDENTE') return 'warning'
  return 'info'
}

export async function GET() {
  try {
    const auth = await requireAdminSessionApi('api:gerente:atividades:recent')
    if (auth instanceof NextResponse) return auth

    const supabase = await createClient()
    const since = windowISO()

    const [vendasRes, fiscalRes, caixaRes] = await Promise.all([
      supabase
        .from('vendas')
        .select('id, total_liquido, created_at')
        .eq('status', 'CONCLUIDA')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('documentos_fiscais_eventos')
        .select('id, evento_tipo, status_depois, created_at')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(15),
      supabase
        .from('movimentacoes_caixa')
        .select('id, tipo, valor, created_at')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(10),
    ])

    const items: AtividadeRailItem[] = []

    for (const v of vendasRes.data ?? []) {
      const val = Number(v.total_liquido ?? 0)
      const formatted = formatBRL(val)
      items.push({
        id: `venda-${v.id}`,
        tipo: 'VENDA',
        titulo: `Venda finalizada · ${formatted}`,
        ts: v.created_at,
        severity: 'info',
      })
    }

    for (const fe of fiscalRes.data ?? []) {
      const statusDepois = fe.status_depois ?? null
      items.push({
        id: `fiscal-${fe.id}`,
        tipo: statusDepois === 'ERRO' ? 'FISCAL_ERRO' : 'FISCAL_OK',
        titulo: fiscalTitulo(fe.evento_tipo, statusDepois),
        ts: fe.created_at,
        severity: fiscalSeverity(statusDepois),
      })
    }

    for (const mc of caixaRes.data ?? []) {
      const val = Number(mc.valor ?? 0)
      const formatted = formatBRL(val)
      const tipo = String(mc.tipo ?? '')
      const label = tipo === 'sangria' ? 'Sangria' : tipo === 'suprimento' ? 'Suprimento' : 'Movimentação'
      items.push({
        id: `caixa-${mc.id}`,
        tipo: 'CAIXA',
        titulo: `${label} · ${formatted}`,
        ts: mc.created_at,
        severity: 'info',
      })
    }

    items.sort((a, b) => b.ts.localeCompare(a.ts))
    const result = items.slice(0, 40)

    return NextResponse.json({ items: result, generatedAt: new Date().toISOString() } satisfies AtividadeFeedPayload)
  } catch {
    return NextResponse.json({ items: [], generatedAt: new Date().toISOString() } satisfies AtividadeFeedPayload)
  }
}
