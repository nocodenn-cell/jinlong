import { describe, expect, it, vi } from 'vitest'
import { requireModulo, type ClienteSessao } from './requireModulo'

const EMP_A = '11111111-1111-4111-8111-111111111111'
const EMP_B = '22222222-2222-4222-8222-222222222222'

function cliente(opts: {
  user?: { id: string } | null
  rpcData?: unknown
  rpcError?: unknown
  userError?: unknown
  lanca?: boolean
}) {
  const rpc = vi.fn(async () => {
    if (opts.lanca) throw new Error('rede')
    return { data: opts.rpcData ?? null, error: opts.rpcError ?? null }
  })
  const c: ClienteSessao = {
    auth: {
      getUser: async () => ({
        data: { user: opts.user === undefined ? { id: 'u1' } : opts.user },
        error: opts.userError ?? null,
      }),
    },
    rpc,
  }
  return { c, rpc }
}

describe('requireModulo', () => {
  it('libera com a empresa derivada pelo banco', async () => {
    const { c, rpc } = cliente({ rpcData: EMP_A })
    await expect(requireModulo(c, 'IMPORT_INTELLIGENCE')).resolves.toEqual({
      ok: true,
      empresaId: EMP_A,
      modulo: 'IMPORT_INTELLIGENCE',
    })
    expect(rpc).toHaveBeenCalledWith('fp_empresa_contexto_modulo', {
      p_modulo: 'IMPORT_INTELLIGENCE',
      p_papeis: ['DONO'],
      p_empresa: null,
    })
  })

  it('nega sem sessão, sem consultar o banco', async () => {
    const { c, rpc } = cliente({ user: null })
    await expect(requireModulo(c, 'IMPORT_INTELLIGENCE')).resolves.toEqual({ ok: false, motivo: 'SEM_SESSAO' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('nega quando o banco não resolve empresa (módulo desabilitado, papel, ambiguidade)', async () => {
    const { c } = cliente({ rpcData: null })
    await expect(requireModulo(c, 'IMPORT_INTELLIGENCE')).resolves.toEqual({ ok: false, motivo: 'NEGADO' })
  })

  it('nega (fail closed) em erro do RPC ou exceção de rede', async () => {
    await expect(requireModulo(cliente({ rpcError: { message: 'x' } }).c, 'IMPORT_INTELLIGENCE')).resolves.toEqual({
      ok: false,
      motivo: 'ERRO',
    })
    await expect(requireModulo(cliente({ lanca: true }).c, 'IMPORT_INTELLIGENCE')).resolves.toEqual({
      ok: false,
      motivo: 'ERRO',
    })
  })

  it('empresa pedida pelo frontend é só uma escolha: precisa ser confirmada pelo banco', async () => {
    const { c, rpc } = cliente({ rpcData: EMP_A })
    await expect(requireModulo(c, 'IMPORT_INTELLIGENCE', { empresaId: EMP_B })).resolves.toEqual({
      ok: false,
      motivo: 'NEGADO',
    })
    expect(rpc).toHaveBeenCalledWith('fp_empresa_contexto_modulo', expect.objectContaining({ p_empresa: EMP_B }))
  })

  it('rejeita empresaId malformado sem consultar o banco', async () => {
    const { c, rpc } = cliente({ rpcData: EMP_A })
    await expect(requireModulo(c, 'IMPORT_INTELLIGENCE', { empresaId: "x' OR 1=1" })).resolves.toEqual({
      ok: false,
      motivo: 'NEGADO',
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('rejeita módulo fora do catálogo e resposta não-UUID', async () => {
    const { c } = cliente({ rpcData: EMP_A })
    await expect(requireModulo(c, 'OUTRO' as never)).resolves.toEqual({ ok: false, motivo: 'NEGADO' })
    await expect(requireModulo(cliente({ rpcData: true }).c, 'IMPORT_INTELLIGENCE')).resolves.toEqual({
      ok: false,
      motivo: 'NEGADO',
    })
  })

  it('repassa papéis explícitos', async () => {
    const { c, rpc } = cliente({ rpcData: EMP_A })
    await requireModulo(c, 'IMPORT_INTELLIGENCE', { papeis: ['DONO', 'GERENTE'] })
    expect(rpc).toHaveBeenCalledWith(
      'fp_empresa_contexto_modulo',
      expect.objectContaining({ p_papeis: ['DONO', 'GERENTE'] }),
    )
  })
})
