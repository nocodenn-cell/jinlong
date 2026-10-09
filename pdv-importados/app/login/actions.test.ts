import { beforeEach, describe, expect, it, vi } from 'vitest'

const cookieSetMock = vi.fn()
const revalidatePathMock = vi.fn()

vi.mock('next/headers', () => ({
  cookies: async () => ({ set: cookieSetMock }),
}))

vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}))

import { setIdiomaPreLoginAction } from './actions'

function formComIdioma(valor: string | null) {
  const fd = new FormData()
  if (valor !== null) fd.set('idioma', valor)
  return fd
}

describe('setIdiomaPreLoginAction', () => {
  beforeEach(() => {
    cookieSetMock.mockClear()
    revalidatePathMock.mockClear()
  })

  it('grava o cookie legado idioma_preferido como zh e revalida /login', async () => {
    await setIdiomaPreLoginAction(formComIdioma('zh'))

    expect(cookieSetMock).toHaveBeenCalledWith(
      'idioma_preferido',
      'zh',
      expect.objectContaining({ path: '/', httpOnly: true, sameSite: 'lax', maxAge: 31536000 }),
    )
    expect(revalidatePathMock).toHaveBeenCalledWith('/login')
  })

  it('valor inválido vira pt (mesma regra de normalizeIdioma)', async () => {
    await setIdiomaPreLoginAction(formComIdioma('en-US'))
    expect(cookieSetMock.mock.calls[0][1]).toBe('pt')
  })

  it('sem campo idioma usa pt, sem lançar erro', async () => {
    await setIdiomaPreLoginAction(formComIdioma(null))
    expect(cookieSetMock.mock.calls[0][1]).toBe('pt')
  })
})
