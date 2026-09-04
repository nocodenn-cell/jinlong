import { describe, expect, it, vi } from 'vitest'

const supabaseResultRef: { current: { error: { message: string } | null } } = {
  current: { error: null },
}

function fromMock() {
  const api = {
    select: () => api,
    abortSignal: () => api,
    limit: () => Promise.resolve(supabaseResultRef.current),
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: fromMock }),
}))

describe('GET /api/health', () => {
  it('status ok quando Supabase responde sem erro (item 17)', async () => {
    supabaseResultRef.current = { error: null }
    const { GET } = await import('./route')
    const res = await GET()
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.status).toBe('ok')
    expect(body.checks.supabase).toBe('ok')
    expect(typeof body.deploymentId).toBe('string')
  })

  it('status degraded (mas HTTP 200) quando Supabase falha — não derruba o endpoint nem quebra o gate SSRA', async () => {
    supabaseResultRef.current = { error: { message: 'connection refused' } }
    const { GET } = await import('./route')
    const res = await GET()
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.status).toBe('degraded')
    expect(body.checks.supabase).toBe('fail')
    expect(typeof body.deploymentId).toBe('string')
  })
})
