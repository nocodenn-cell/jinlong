import type { User } from '@supabase/supabase-js'

/** Stub mínimo de User do Supabase para testes unitários. */
export function mockSupabaseUser(id: string, email: string): User {
  return {
    id,
    email,
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: '2020-01-01T00:00:00.000Z',
  }
}
