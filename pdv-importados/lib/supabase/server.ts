import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { assertSupabasePublicEnv } from '@/lib/supabase/env'

export async function createClient() {
  const { url, key } = assertSupabasePublicEnv()

  const cookieStore = await cookies()

  return createServerClient(
    url,
    key,
    {
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
          } catch {
            // Expected in Server Components where cookies are read-only.
            // Supabase SSR calls setAll to refresh tokens — safe to ignore here
            // as the middleware handles the actual cookie refresh.
          }
        },
      },
    }
  )
}
