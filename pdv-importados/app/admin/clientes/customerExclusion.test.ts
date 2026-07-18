import { describe, expect, it, vi } from 'vitest'
import {
  createCustomerExclusionService,
  MSG_CLIENTE_NAO_ENCONTRADO,
} from './customerExclusion'
import type { CustomerExclusionEffects } from '@shared-core/src/customers'
import { CUSTOMER_ERROR_CODES, mensagemCrediarioAberto } from '@shared-core/src/customers'

function mockEffects(
  overrides: Partial<CustomerExclusionEffects> = {},
): CustomerExclusionEffects {
  return {
    loadExclusionFacts: vi.fn(),
    anonymize: vi.fn(async () => ({ ok: true as const })),
    deletePhysical: vi.fn(async () => ({ ok: true as const })),
    ...overrides,
  }
}

describe('createCustomerExclusionService', () => {
  it('cliente sem histórico → delete físico', async () => {
    const effects = mockEffects({
      loadExclusionFacts: vi.fn(async () => ({
        ok: true as const,
        facts: {
          nome: 'Ana',
          saldoCrediario: 0,
          temHistoricoContasReceber: false,
        },
      })),
    })
    const svc = createCustomerExclusionService(effects)
    await expect(svc.exclude('c1')).resolves.toEqual({ ok: true })
    expect(effects.deletePhysical).toHaveBeenCalledWith('c1')
    expect(effects.anonymize).not.toHaveBeenCalled()
  })

  it('cliente com histórico (vendas/contas_receber) → anonymize', async () => {
    const effects = mockEffects({
      loadExclusionFacts: vi.fn(async () => ({
        ok: true as const,
        facts: {
          nome: 'Bruno',
          saldoCrediario: 0,
          temHistoricoContasReceber: true,
        },
      })),
    })
    const svc = createCustomerExclusionService(effects)
    await expect(svc.exclude('c2')).resolves.toEqual({ ok: true, anonimizado: true })
    expect(effects.anonymize).toHaveBeenCalledWith('c2')
    expect(effects.deletePhysical).not.toHaveBeenCalled()
  })

  it('cliente inexistente → erro legado', async () => {
    const effects = mockEffects({
      loadExclusionFacts: vi.fn(async () => ({
        ok: false as const,
        error: MSG_CLIENTE_NAO_ENCONTRADO,
        notFound: true,
      })),
    })
    const svc = createCustomerExclusionService(effects)
    await expect(svc.exclude('missing')).resolves.toEqual({
      ok: false,
      error: MSG_CLIENTE_NAO_ENCONTRADO,
      code: CUSTOMER_ERROR_CODES.NOT_FOUND,
    })
    expect(effects.anonymize).not.toHaveBeenCalled()
    expect(effects.deletePhysical).not.toHaveBeenCalled()
  })

  it('exclusão repetida após delete → not found', async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        facts: { nome: 'C', saldoCrediario: 0, temHistoricoContasReceber: false },
      })
      .mockResolvedValueOnce({
        ok: false,
        error: MSG_CLIENTE_NAO_ENCONTRADO,
        notFound: true,
      })
    const effects = mockEffects({ loadExclusionFacts: load })
    const svc = createCustomerExclusionService(effects)

    await expect(svc.exclude('c3')).resolves.toEqual({ ok: true })
    await expect(svc.exclude('c3')).resolves.toEqual({
      ok: false,
      error: MSG_CLIENTE_NAO_ENCONTRADO,
      code: CUSTOMER_ERROR_CODES.NOT_FOUND,
    })
    expect(effects.deletePhysical).toHaveBeenCalledTimes(1)
  })

  it('exclusão repetida após anonymize → anonymize de novo (idempotente)', async () => {
    const load = vi.fn(async () => ({
      ok: true as const,
      facts: {
        nome: 'CLIENTE_ANONIMIZADO_LGPD',
        saldoCrediario: 0,
        temHistoricoContasReceber: true,
      },
    }))
    const effects = mockEffects({ loadExclusionFacts: load })
    const svc = createCustomerExclusionService(effects)

    await expect(svc.exclude('c4')).resolves.toEqual({ ok: true, anonimizado: true })
    await expect(svc.exclude('c4')).resolves.toEqual({ ok: true, anonimizado: true })
    expect(effects.anonymize).toHaveBeenCalledTimes(2)
    expect(effects.deletePhysical).not.toHaveBeenCalled()
  })

  it('saldo crediário aberto → reject com mensagem legada', async () => {
    const effects = mockEffects({
      loadExclusionFacts: vi.fn(async () => ({
        ok: true as const,
        facts: {
          nome: 'Diana',
          saldoCrediario: 15,
          temHistoricoContasReceber: true,
        },
      })),
    })
    const svc = createCustomerExclusionService(effects)
    await expect(svc.exclude('c5')).resolves.toEqual({
      ok: false,
      error: mensagemCrediarioAberto('Diana'),
      code: CUSTOMER_ERROR_CODES.HAS_OPEN_CREDIT,
      params: { nome: 'Diana' },
    })
    expect(effects.anonymize).not.toHaveBeenCalled()
    expect(effects.deletePhysical).not.toHaveBeenCalled()
  })
})
