import { describe, expect, it, vi } from 'vitest'
import { PRODUCT_ERROR_CODES } from '@shared-core/src/products'
import { createProductLifecycleService } from './productLifecycle'

type UpdateResult = {
  data: { id: string }[] | null
  error: { message: string } | null
  count: number | null
}

function mockSupabase(result: UpdateResult) {
  const builder = {
    update: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    select: vi.fn(),
  }
  builder.update.mockReturnValue(builder)
  builder.eq.mockReturnValue(builder)
  builder.in.mockReturnValue(builder)
  builder.select.mockResolvedValue(result)

  return {
    from: vi.fn(() => builder),
    builder,
  }
}

describe('createProductLifecycleService', () => {
  it('setStatus PUBLICADO success', async () => {
    const sb = mockSupabase({
      data: [{ id: 'prod-1' }],
      error: null,
      count: 1,
    })
    const svc = createProductLifecycleService(sb as never)

    const r = await svc.setStatus({
      id: 'prod-1',
      lojaId: 'loja-1',
      status: 'PUBLICADO',
    })

    expect(r).toEqual({ ok: true })
    expect(sb.from).toHaveBeenCalledWith('produtos')
    expect(sb.builder.update).toHaveBeenCalledWith({
      status_publicacao: 'PUBLICADO',
      ativo: true,
    })
    expect(sb.builder.eq).toHaveBeenCalledWith('id', 'prod-1')
    expect(sb.builder.eq).toHaveBeenCalledWith('loja_id', 'loja-1')
  })

  it('setStatusLote success with count', async () => {
    const sb = mockSupabase({
      data: [{ id: 'p1' }, { id: 'p2' }],
      error: null,
      count: 2,
    })
    const svc = createProductLifecycleService(sb as never)

    const r = await svc.setStatusLote({
      ids: ['p1', 'p2'],
      lojaId: 'loja-1',
      status: 'INATIVO',
    })

    expect(r).toEqual({ ok: true, atualizados: 2 })
    expect(sb.builder.update).toHaveBeenCalledWith({
      status_publicacao: 'INATIVO',
      ativo: false,
    })
    expect(sb.builder.in).toHaveBeenCalledWith('id', ['p1', 'p2'])
    expect(sb.builder.eq).toHaveBeenCalledWith('loja_id', 'loja-1')
  })

  it('failure returns LIFECYCLE_FAILED', async () => {
    const sb = mockSupabase({
      data: null,
      error: { message: 'db down' },
      count: null,
    })
    const svc = createProductLifecycleService(sb as never)

    const r = await svc.setStatus({
      id: 'prod-1',
      lojaId: 'loja-1',
      status: 'DRAFT',
    })

    expect(r).toEqual({
      ok: false,
      error: PRODUCT_ERROR_CODES.LIFECYCLE_FAILED,
      code: PRODUCT_ERROR_CODES.LIFECYCLE_FAILED,
    })
  })
})
