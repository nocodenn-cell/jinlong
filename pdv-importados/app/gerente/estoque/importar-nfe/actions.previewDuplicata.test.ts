import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #390 — `<dup>` malformada aborta no parser; o preview mostra a mensagem amigável
 * de `IMPORT_NFE_DUPLICATA_INVALIDA` e NÃO toca no banco. As demais mensagens de
 * leitura do XML continuam saindo como antes (sem prefixo de seção).
 */

const assertGerenteSession = vi.hoisted(() => vi.fn())
const createClient = vi.hoisted(() => vi.fn())
const getGerenteLojaId = vi.hoisted(() => vi.fn())
const parseNfeXml = vi.hoisted(() => vi.fn())

vi.mock('@/lib/gerente/auth/assertGerenteSession', () => ({ assertGerenteSession }))
vi.mock('@/lib/supabase/server', () => ({ createClient }))
vi.mock('@/lib/gerente/auth/sessionContext', () => ({ getGerenteLojaId, getGerenteUserId: vi.fn() }))
vi.mock('@/lib/nfe/nfeParser', () => ({ parseNfeXml }))

import { previewImportacaoNfe } from './actions'

describe('previewImportacaoNfe — duplicata inválida', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    assertGerenteSession.mockResolvedValue({ ok: true, session: { lojaId: 'loja-a', idioma: 'pt', userId: 'u1' } })
    getGerenteLojaId.mockResolvedValue('loja-a')
  })

  it('devolve o texto amigável e não consulta o banco', async () => {
    parseNfeXml.mockImplementation(() => {
      throw new Error('IMPORT_NFE_DUPLICATA_INVALIDA')
    })

    const r = await previewImportacaoNfe('<xml/>')

    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error).toContain('duplicatas (parcelas a pagar)')
      expect(r.error).toContain('nada foi gravado')
      expect(r.error).not.toContain('IMPORT_NFE_DUPLICATA_INVALIDA')
    }
    expect(createClient).not.toHaveBeenCalled()
  })

  it('outros erros de leitura do XML seguem com a mensagem original', async () => {
    parseNfeXml.mockImplementation(() => {
      throw new Error('Nenhum item (<det>/<prod>) encontrado na NF-e.')
    })

    const r = await previewImportacaoNfe('<xml/>')

    expect(r).toEqual({ success: false, error: 'Nenhum item (<det>/<prod>) encontrado na NF-e.' })
    expect(createClient).not.toHaveBeenCalled()
  })
})
