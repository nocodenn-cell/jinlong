import { describe, expect, it, vi } from 'vitest'
import {
  assertProdutoDaLojaSessao,
  MSG_PRODUTO_FORA_DA_LOJA,
  MSG_PRODUTO_SEM_LOJA_SESSAO,
} from './assertProdutoDaLojaSessao'

/**
 * Guard de tenant produto→loja. Cobre o comportamento que a RLS de `produtos`
 * hoje NÃO garante: um `produtoId` de outra loja precisa ser recusado antes de
 * qualquer leitura de dado sensível.
 */

function fakeSupabase(result: { data: unknown; error: unknown }) {
  const calls: { table?: string; cols?: string; eq?: [string, string] } = {}
  const builder = {
    from: (table: string) => {
      calls.table = table
      return builder
    },
    select: (cols: string) => {
      calls.cols = cols
      return builder
    },
    eq: (col: string, val: string) => {
      calls.eq = [col, val]
      return builder
    },
    maybeSingle: async () => result,
  }
  return { builder, calls }
}

const PRODUTO = 'prod-1'

describe('assertProdutoDaLojaSessao', () => {
  it('autoriza produto da própria loja', async () => {
    const { builder, calls } = fakeSupabase({ data: { loja_id: 'loja-1' }, error: null })
    const r = await assertProdutoDaLojaSessao(builder as never, PRODUTO, {
      lojaId: 'loja-1',
      perfil: 'GERENTE',
    })
    expect(r.ok).toBe(true)
    expect(calls.table).toBe('produtos')
    expect(calls.cols).toBe('loja_id')
    expect(calls.eq).toEqual(['id', PRODUTO])
  })

  it('recusa produto de outra loja', async () => {
    const { builder } = fakeSupabase({ data: { loja_id: 'loja-2' }, error: null })
    const r = await assertProdutoDaLojaSessao(builder as never, PRODUTO, {
      lojaId: 'loja-1',
      perfil: 'GERENTE',
    })
    expect(r).toEqual({ ok: false, error: MSG_PRODUTO_FORA_DA_LOJA })
  })

  it('produto inexistente devolve a MESMA mensagem de outra loja (sem oráculo de enumeração)', async () => {
    const { builder } = fakeSupabase({ data: null, error: null })
    const r = await assertProdutoDaLojaSessao(builder as never, PRODUTO, {
      lojaId: 'loja-1',
      perfil: 'GERENTE',
    })
    expect(r).toEqual({ ok: false, error: MSG_PRODUTO_FORA_DA_LOJA })
  })

  it('erro de infraestrutura falha FECHADO (não autoriza)', async () => {
    const { builder } = fakeSupabase({ data: null, error: { message: 'connection reset' } })
    const r = await assertProdutoDaLojaSessao(builder as never, PRODUTO, {
      lojaId: 'loja-1',
      perfil: 'GERENTE',
    })
    expect(r.ok).toBe(false)
  })

  it('sessão sem lojaId é recusada sem consultar o banco', async () => {
    const { builder, calls } = fakeSupabase({ data: { loja_id: 'loja-1' }, error: null })
    const r = await assertProdutoDaLojaSessao(builder as never, PRODUTO, {
      lojaId: null,
      perfil: 'GERENTE',
    })
    expect(r).toEqual({ ok: false, error: MSG_PRODUTO_SEM_LOJA_SESSAO })
    expect(calls.table).toBeUndefined()
  })

  it('DONO é escopado à própria loja (não tem visão global em produtos)', async () => {
    const { builder } = fakeSupabase({ data: { loja_id: 'loja-2' }, error: null })
    const r = await assertProdutoDaLojaSessao(builder as never, PRODUTO, {
      lojaId: 'loja-1',
      perfil: 'DONO',
    })
    expect(r.ok).toBe(false)
  })

  it('ADMIN é global: autoriza sem consultar o banco', async () => {
    const consultou = vi.fn()
    const builder = {
      from: () => {
        consultou()
        return builder
      },
    }
    const r = await assertProdutoDaLojaSessao(builder as never, PRODUTO, {
      lojaId: null,
      perfil: 'ADMIN',
    })
    expect(r.ok).toBe(true)
    expect(consultou).not.toHaveBeenCalled()
  })
})
