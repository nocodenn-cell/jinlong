import { describe, expect, it } from 'vitest'
import { ADMIN_CLIENT_ENV_MISSING_MSG } from '@/lib/supabase/adminEnv'

describe('adminClient env message', () => {
  it('mensagem amigável aponta Vercel e service_role', () => {
    expect(ADMIN_CLIENT_ENV_MISSING_MSG).toContain('SUPABASE_SERVICE_ROLE_KEY')
    expect(ADMIN_CLIENT_ENV_MISSING_MSG).toContain('estoque')
    expect(ADMIN_CLIENT_ENV_MISSING_MSG.toLowerCase()).toContain('vercel')
  })
})
