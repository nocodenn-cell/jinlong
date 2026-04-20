import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function isSupabaseAuthCookie(name: string): boolean {
  return name.startsWith('sb-') && name.includes('-auth-token')
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    await supabase.auth.signOut()
  } catch {
    // Mesmo com falha no provider, limpamos cookies locais abaixo.
  }

  const response = NextResponse.json({ ok: true })
  const allCookies = request.cookies.getAll()
  for (const cookie of allCookies) {
    if (!isSupabaseAuthCookie(cookie.name)) continue
    response.cookies.set({
      name: cookie.name,
      value: '',
      path: '/',
      expires: new Date(0),
    })
  }
  return response
}
