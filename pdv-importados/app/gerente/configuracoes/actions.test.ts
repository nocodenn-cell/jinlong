import { beforeEach, describe, expect, it, vi } from 'vitest'

// F1-06/F1-14: atualizarConfiguracao precisa rejeitar chave fora da whitelist
// (antes de tocar o banco) e gravar atualizado_por com o usuário da sessão.

const mockSession = {
  ok: true as const,
  session: { userId: 'gerente-1', perfil: 'GERENTE' },
}

vi.mock('@/lib/gerente/auth/assertGerenteSession', () => ({
  assertGerenteSession: vi.fn(async () => mockSession),
}))

vi.mock('@/lib/navigation/revalidarDominio', () => ({ revalidarDominio: vi.fn() }))

describe('atualizarConfiguracao (F1-06/F1-14)', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('rejeita chave fora da whitelist sem chamar o banco', async () => {
    const update = vi.fn()
    vi.doMock('@/lib/supabase/server', () => ({
      createClient: async () => ({ from: () => ({ update }) }),
    }))

    const { atualizarConfiguracao } = await import('./actions')
    const result = await atualizarConfiguracao({ chave: 'chave_inventada', valor: '1' })

    expect(result).toEqual({ success: false, error: 'Configuração desconhecida.' })
    expect(update).not.toHaveBeenCalled()
  })

  it('grava atualizado_por com o usuario da sessao para chave permitida', async () => {
    const eq = vi.fn(async () => ({ error: null }))
    const update = vi.fn(() => ({ eq }))
    vi.doMock('@/lib/supabase/server', () => ({
      createClient: async () => ({ from: () => ({ update }) }),
    }))

    const { atualizarConfiguracao } = await import('./actions')
    const result = await atualizarConfiguracao({
      chave: 'desconto_maximo_operador_percentual',
      valor: '5',
    })

    expect(result).toEqual({ success: true })
    expect(update).toHaveBeenCalledWith({ valor: '5', atualizado_por: 'gerente-1' })
    expect(eq).toHaveBeenCalledWith('chave', 'desconto_maximo_operador_percentual')
  })
})
