import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { resolveAdminSession } from './resolveAdminSession'

describe('resolveAdminSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('retorna null sem usuário autenticado', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      },
    } as never)

    const session = await resolveAdminSession()
    expect(session).toBeNull()
  })

  it('retorna null para perfil operador', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'u1', email: 'a@b.c' } },
          error: null,
        }),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { perfil: 'OPERADOR', idioma_preferido: 'pt', loja_id: 'l1' },
              error: null,
            }),
          }),
        }),
      }),
    } as never)

    const session = await resolveAdminSession()
    expect(session).toBeNull()
  })

  it('retorna AdminSession para gerente', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'u1', email: 'a@b.c' } },
          error: null,
        }),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { perfil: 'GERENTE', idioma_preferido: 'pt', loja_id: 'l1' },
              error: null,
            }),
          }),
        }),
      }),
    } as never)

    const session = await resolveAdminSession()
    expect(session?.userId).toBe('u1')
    expect(session?.perfil).toBe('GERENTE')
    expect(session?.lojaId).toBe('l1')
  })
})
