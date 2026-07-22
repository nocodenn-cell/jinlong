import { describe, expect, it, vi } from 'vitest'
import type { ProductExclusionEffects } from '@shared-core/src/products'
import { PRODUCT_ERROR_CODES } from '@shared-core/src/products'
import {
  MSG_PRODUTO_NAO_ENCONTRADO,
  createProductExclusionService,
} from './productExclusion'

function mockEffects(
  overrides: Partial<ProductExclusionEffects> = {},
): ProductExclusionEffects {
  return {
    loadExclusionFacts: vi.fn(),
    inactivate: vi.fn(async () => ({ ok: true as const })),
    deletePhysical: vi.fn(async () => ({ ok: true as const })),
    ...overrides,
  }
}

const limpo = {
  ativo: true,
  temItensVenda: false,
  temRemessaItens: false,
  temMovimentosEstoque: false,
  temReposicoesCancelamento: false,
  temSaldoEstoque: false,
}

describe('createProductExclusionService', () => {
  it('produto sem histórico → delete físico', async () => {
    const effects = mockEffects({
      loadExclusionFacts: vi.fn(async () => ({
        ok: true as const,
        facts: limpo,
      })),
    })
    const svc = createProductExclusionService(effects)
    await expect(svc.exclude('p1')).resolves.toEqual({ ok: true, outcome: 'deleted' })
    expect(effects.deletePhysical).toHaveBeenCalledWith('p1')
    expect(effects.inactivate).not.toHaveBeenCalled()
  })

  it('produto vendido → inactivate (não apaga histórico)', async () => {
    const effects = mockEffects({
      loadExclusionFacts: vi.fn(async () => ({
        ok: true as const,
        facts: { ...limpo, temItensVenda: true },
      })),
    })
    const svc = createProductExclusionService(effects)
    await expect(svc.exclude('p2')).resolves.toEqual({
      ok: true,
      outcome: 'inactivated',
    })
    expect(effects.inactivate).toHaveBeenCalledWith('p2')
    expect(effects.deletePhysical).not.toHaveBeenCalled()
  })

  it('produto com estoque (só saldo) → delete — saldo não bloqueia', async () => {
    const effects = mockEffects({
      loadExclusionFacts: vi.fn(async () => ({
        ok: true as const,
        facts: { ...limpo, temSaldoEstoque: true },
      })),
    })
    const svc = createProductExclusionService(effects)
    await expect(svc.exclude('p3')).resolves.toEqual({ ok: true, outcome: 'deleted' })
    expect(effects.deletePhysical).toHaveBeenCalledWith('p3')
  })

  it('produto com movimentos de estoque → inactivate', async () => {
    const effects = mockEffects({
      loadExclusionFacts: vi.fn(async () => ({
        ok: true as const,
        facts: { ...limpo, temMovimentosEstoque: true, temSaldoEstoque: true },
      })),
    })
    const svc = createProductExclusionService(effects)
    await expect(svc.exclude('p4')).resolves.toEqual({
      ok: true,
      outcome: 'inactivated',
    })
    expect(effects.deletePhysical).not.toHaveBeenCalled()
  })

  it('produto inexistente → reject NOT_FOUND', async () => {
    const effects = mockEffects({
      loadExclusionFacts: vi.fn(async () => ({
        ok: false as const,
        error: MSG_PRODUTO_NAO_ENCONTRADO,
        notFound: true,
      })),
    })
    const svc = createProductExclusionService(effects)
    await expect(svc.exclude('missing')).resolves.toEqual({
      ok: false,
      error: MSG_PRODUTO_NAO_ENCONTRADO,
      code: PRODUCT_ERROR_CODES.NOT_FOUND,
      notFound: true,
    })
    expect(effects.deletePhysical).not.toHaveBeenCalled()
    expect(effects.inactivate).not.toHaveBeenCalled()
  })

  it('bloqueado e já inativo → already_inactive (sem write)', async () => {
    const effects = mockEffects({
      loadExclusionFacts: vi.fn(async () => ({
        ok: true as const,
        facts: { ...limpo, ativo: false, temItensVenda: true },
      })),
    })
    const svc = createProductExclusionService(effects)
    await expect(svc.exclude('p5')).resolves.toEqual({
      ok: true,
      outcome: 'already_inactive',
    })
    expect(effects.inactivate).not.toHaveBeenCalled()
    expect(effects.deletePhysical).not.toHaveBeenCalled()
  })

  it('delete falhou e ativo → fallback inactivate (legado)', async () => {
    const effects = mockEffects({
      loadExclusionFacts: vi.fn(async () => ({
        ok: true as const,
        facts: limpo,
      })),
      deletePhysical: vi.fn(async () => ({
        ok: false as const,
        error: 'Remover produto · FK',
      })),
    })
    const svc = createProductExclusionService(effects)
    await expect(svc.exclude('p6')).resolves.toEqual({
      ok: true,
      outcome: 'inactivated',
    })
    expect(effects.inactivate).toHaveBeenCalledWith('p6')
  })
})
