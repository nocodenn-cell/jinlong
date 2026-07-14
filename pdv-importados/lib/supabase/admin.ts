// ATENÇÃO — SOMENTE SERVIDOR
// Este módulo usa SUPABASE_SERVICE_ROLE_KEY, que é uma variável de ambiente
// privada (sem prefixo NEXT_PUBLIC_). O Next.js a oculta automaticamente em
// bundles de cliente; importar este arquivo — direta ou indiretamente — em
// um Client Component causará erro de inicialização ou build failure.
//
// Uso permitido: Server Actions ('use server'), API Routes (app/api/**),
//                implementações de servidor (app/**/server/**).
// Uso proibido: Client Components ('use client'), hooks de frontend, páginas
//               que não são Server Components.
import 'server-only'

import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { ADMIN_CLIENT_ENV_MISSING_MSG } from './adminEnv'

export { ADMIN_CLIENT_ENV_MISSING_MSG }

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? ''
  if (!url || !key) {
    throw new Error(ADMIN_CLIENT_ENV_MISSING_MSG)
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
