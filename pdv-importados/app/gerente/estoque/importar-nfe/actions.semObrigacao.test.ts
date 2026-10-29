import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * SSOT-003 — a recusa do banco por falta de duplicatas chega à tela em texto operacional,
 * sem código técnico. A confirmação recusada não altera nada (o banco reverte a transação).
 */

const assertGerenteSession = vi.hoisted(() => vi.fn())
const createClient = vi.hoisted(() => vi.fn())
const getGerenteLojaId = vi.hoisted(() => vi.fn())
const confirmarImportacao = vi.hoisted(() => vi.fn())

vi.mock('@/lib/gerente/auth/assertGerenteSession', () => ({ assertGerenteSession }))
vi.mock('@/lib/supabase/server', () => ({ createClient }))
vi.mock('@/lib/gerente/auth/sessionContext', () => ({ getGerenteLojaId, getGerenteUserId: vi.fn() }))
vi.mock('@/app/admin/estoque/inventoryMovementWriter', () => ({
  createInventoryMovementWriter: () => ({ confirmarImportacaoNfe: confirmarImportacao }),
}))

import { confirmarImportacaoNfe } from './actions'

const IMPORTACAO = '11111111-1111-4111-8111-111111111111'

describe('confirmarImportacaoNfe — valor sem duplicatas', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    assertGerenteSession.mockResolvedValue({ ok: true, session: { lojaId: 'loja-a', idioma: 'pt', userId: 'u1' } })
    getGerenteLojaId.mockResolvedValue('loja-a')
    createClient.mockResolvedValue({
      from: () => ({
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { ordem_compra_id: null }, error: null }) }) }) }),
      }),
    })
  })

  it('traduz a recusa para texto operacional, sem código técnico', async () => {
    confirmarImportacao.mockResolvedValue({ ok: false, error: 'IMPORT_NFE_OBRIGACAO_SEM_DUPLICATA' })

    const r = await confirmarImportacaoNfe({ importacao_id: IMPORTACAO })

    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error).toContain('não traz duplicatas')
      expect(r.error).toContain('Nada foi lançado no estoque')
      expect(r.error).not.toMatch(/IMPORT_NFE_/)
    }
  })
})
