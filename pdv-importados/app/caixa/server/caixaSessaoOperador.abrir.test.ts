// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const writerOpen = vi.fn()

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'op-1' } } }) } }),
}))
vi.mock('@/lib/auth/lojaUsuario', () => ({
  getLojaIdUsuario: async () => 'loja-1',
  LOJA_MATRIZ_ID: 'loja-matriz',
}))
vi.mock('@/shared/unified-logger', () => ({ logJson: vi.fn() }))
vi.mock('@/idioma/usuarioIdioma', () => ({ getUsuarioIdioma: async () => ({ idioma: 'pt' }) }))
vi.mock('@/app/caixa/server/cashSession', () => ({
  createCashSessionReader: vi.fn(),
  createCashSessionWriter: () => ({ open: writerOpen }),
}))

import { abrirCaixaOperadorImpl } from '@/app/caixa/server/caixaSessaoOperador.impl'
import { CASH_ERROR_CODES } from '@shared-core/src/cash'

const MSG_CAIXA_JA_ABERTO = 'Já existe um caixa aberto para este operador.'

describe('abrirCaixaOperadorImpl: erro de caixa já aberto', () => {
  beforeEach(() => {
    writerOpen.mockReset()
  })

  it('devolve a mensagem já localizada do servidor, sem trocar pelo fallback genérico', async () => {
    writerOpen.mockResolvedValue({
      ok: false,
      error: MSG_CAIXA_JA_ABERTO,
      code: CASH_ERROR_CODES.SESSION_ALREADY_OPEN,
    })
    const r = await abrirCaixaOperadorImpl(300)
    expect(r).toEqual({ ok: false, error: MSG_CAIXA_JA_ABERTO })
    expect(r.ok === false && r.error).not.toBe('Não foi possível concluir. Tente novamente.')
  })

  it('erros que não são de caixa já aberto continuam passando pelo mapeador', async () => {
    writerOpen.mockResolvedValue({
      ok: false,
      error: 'Database connection error.',
      code: CASH_ERROR_CODES.OPEN_FAILED,
    })
    const r = await abrirCaixaOperadorImpl(300)
    expect(r).toEqual({ ok: false, error: 'Não foi possível concluir. Tente novamente.' })
  })
})
