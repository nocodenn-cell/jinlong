import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { assertSupabasePublicEnv } from '@/lib/supabase/env'
import { COOKIE_EMPRESA, headersEmpresa } from '@/lib/multiempresa/empresaSelecionada'

export async function createClient() {
  const { url, key } = assertSupabasePublicEnv()

  const cookieStore = await cookies()

  return createServerClient(
    url,
    key,
    {
      // Multiempresa: empresa escolhida (só estreita o escopo no banco).
      global: { headers: headersEmpresa(cookieStore.get(COOKIE_EMPRESA)?.value) },
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(
          cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]
        ) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}
