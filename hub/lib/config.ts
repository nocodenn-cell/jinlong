import 'server-only'

type Env = Readonly<Record<string, string | undefined>>

export interface HubConfig {
  url: string
  anonKey: string
}

/**
 * Só variáveis de servidor (sem prefixo público): nada vai ao bundle do navegador.
 * O hub NÃO usa service role: toda leitura/escrita vai com o JWT do admin e passa pela RLS.
 */
export function getConfig(env: Env = process.env): HubConfig | null {
  const url = env.HUB_SUPABASE_URL?.trim().replace(/\/$/, '')
  const anonKey = env.HUB_SUPABASE_ANON_KEY?.trim()
  if (!url || !anonKey || !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)) return null
  return { url, anonKey }
}

/** Dados fictícios (só para demonstração/screenshots): nunca em produção e nunca com banco configurado. */
export function isDemoMode(env: Env = process.env): boolean {
  return env.HUB_DEMO_DATA === 'ficticio' && env.VERCEL_ENV !== 'production' && !getConfig(env)
}
