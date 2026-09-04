import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ProductExclusionEffects } from '@shared-core/src/products'
import { PRODUCT_ERROR_CODES } from '@shared-core/src/products'
import {
  MSG_PRODUTO_NAO_ENCONTRADO,
  createProductExclusionEffects,
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

type SelectCall = { table: string; columns: string }

function thenableCount() {
  return Promise.resolve({ data: [], error: null, count: 0 })
}

function mockSupabaseForExclusionFacts(opts: {
  selects: SelectCall[]
  estoqueRow?: { quantidade_atual: number } | null
  estoqueError?: { message: string } | null
}): SupabaseClient {
  return {
    from(table: string) {
      const builder = {
        select(columns: string) {
          opts.selects.push({ table, columns })
          return builder
        },
        eq() {
          return builder
        },
        maybeSingle() {
          if (table === 'produtos') {
            return Promise.resolve({ data: { id: 'p1', ativo: true }, error: null })
          }
          if (table === 'estoque') {
            if (opts.estoqueError) {
              return Promise.resolve({ data: null, error: opts.estoqueError })
            }
            return Promise.resolve({ data: opts.estoqueRow ?? null, error: null })
          }
          return Promise.resolve({ data: null, error: null })
        },
        then(onFulfilled: (v: unknown) => unknown) {
          return thenableCount().then(onFulfilled)
        },
      }
      return builder
    },
  } as unknown as SupabaseClient
}

describe('createProductExclusionEffects.loadExclusionFacts', () => {
  it('lê estoque.quantidade_atual (não a coluna inexistente quantidade)', async () => {
    const selects: SelectCall[] = []
    const supabase = mockSupabaseForExclusionFacts({
      selects,
      estoqueRow: { quantidade_atual: 3 },
    })
    const effects = createProductExclusionEffects(supabase)
    const loaded = await effects.loadExclusionFacts('p1')

    expect(loaded.ok).toBe(true)
    if (loaded.ok) expect(loaded.facts.temSaldoEstoque).toBe(true)
    expect(selects).toContainEqual({ table: 'estoque', columns: 'quantidade_atual' })
    expect(selects.some((c) => c.table === 'estoque' && c.columns === 'quantidade')).toBe(false)
  })

  it('aborta a exclusão quando a leitura de estoque falha (PostgREST)', async () => {
    const selects: SelectCall[] = []
    const supabase = mockSupabaseForExclusionFacts({
      selects,
      estoqueError: { message: "column estoque.quantidade does not exist" },
    })
    const effects = createProductExclusionEffects(supabase)
    const loaded = await effects.loadExclusionFacts('p1')

    expect(loaded.ok).toBe(false)
    if (!loaded.ok) expect(loaded.error).toMatch(/estoque: column estoque.quantidade does not exist/)
  })
})
