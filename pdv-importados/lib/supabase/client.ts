import { createBrowserClient } from '@supabase/ssr'
import { getDeviceFingerprint } from '@/lib/security/deviceFingerprint'
import { empresaDoDocumentCookie, headersEmpresa } from '@/lib/multiempresa/empresaSelecionada'

export function createClient() {
  // Garante que está usando as variáveis corretas do Vercel
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  return createBrowserClient(url, key, {
    global: {
      headers: {
        'x-device-fingerprint': getDeviceFingerprint(),
        ...headersEmpresa(empresaDoDocumentCookie(typeof document === 'undefined' ? undefined : document.cookie)),
      },
    },
  })
}
