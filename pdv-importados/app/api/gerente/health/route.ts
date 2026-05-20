import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const t0 = Date.now()
  try {
    const supabase = await createClient()
    const { error } = await supabase.from('lojas').select('id').limit(1)
    const latency = Date.now() - t0
    if (error) return NextResponse.json({ status: 'degraded', latency })
    return NextResponse.json({ status: 'online', latency })
  } catch {
    return NextResponse.json({ status: 'offline', latency: Date.now() - t0 })
  }
}
