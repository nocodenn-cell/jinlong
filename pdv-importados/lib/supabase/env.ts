/**
 * Validação comum das variáveis públicas do Supabase (browser + SSR).
 * NEXT_PUBLIC_* são embutidas no bundle no start do dev/build — reinicie após alterar .env.local.
 */

function isValidSupabaseUrl(raw: string): boolean {
  const u = raw.trim()
  if (!/^https?:\/\//i.test(u)) return false
  try {
    const parsed = new URL(u)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export function assertSupabasePublicEnv(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? ''
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? ''

  if (!url || !key) {
    throw new Error(
      'Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY em pdv-importados/.env.local (raiz do projeto Next). ' +
        'Copie de Supabase → Project Settings → API. Reinicie o servidor: npm run dev',
    )
  }

  if (!isValidSupabaseUrl(url)) {
    throw new Error(
      `NEXT_PUBLIC_SUPABASE_URL deve ser uma URL completa com https:// (ex.: https://abcdefgh.supabase.co). Valor atual inválido: "${url.slice(0, 40)}${url.length > 40 ? '…' : ''}"`,
    )
  }

  return { url, key }
}
