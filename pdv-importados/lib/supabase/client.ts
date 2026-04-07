import { createBrowserClient } from '@supabase/ssr'
import { assertSupabasePublicEnv } from '@/lib/supabase/env'
import { getDeviceFingerprint } from '@/lib/security/deviceFingerprint'

export function createClient() {
  const { url, key } = assertSupabasePublicEnv()
  return createBrowserClient(url, key, {
    global: {
      headers: {
        'x-device-fingerprint': getDeviceFingerprint(),
      },
    },
  })
}
