import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'

function supabaseConfigOk(url: string | undefined, anonKey: string | undefined): boolean {
  if (!url?.trim() || !anonKey?.trim()) return false
  try {
    const u = new URL(url.trim())
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

export function isSupabaseConfigOk(): boolean {
  return supabaseConfigOk(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
}

/** Cliente Supabase edge + response com cookies atualizados (refresh de sessão). */
export function createMiddlewareSupabase(request: NextRequest): {
  supabase: SupabaseClient
  response: NextResponse
} {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim()
  const supabaseKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim()
  const response = NextResponse.next({ request })

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(
        cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]
      ) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value)
          response.cookies.set(name, value, options)
        })
      },
    },
  })

  return { supabase, response }
}
