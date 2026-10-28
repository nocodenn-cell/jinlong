import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
const assertGerente = vi.fn()
const revalidate = vi.fn()

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc }) }))
vi.mock('@/lib/gerente/auth/assertGerenteSession', () => ({ assertGerenteSession: () => assertGerente() }))
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidate(p) }))

const { listarRevisoesOffline, decidirRevisaoOffline } = await import('./actions')

const ID = '11111111-2222-4333-8444-555555555555'

beforeEach(() => {
  rpc.mockReset()
  assertGerente.mockReset()
  revalidate.mockReset()
  assertGerente.mockResolvedValue({ ok: true, session: { userId: 'u1' } })
})

describe('listarRevisoesOffline', () => {
  it('sem sessão DONO/GERENTE: não chama o banco', async () => {
    assertGerente.mockResolvedValue({ ok: false, error: 'x' })
    expect(await listarRevisoesOffline('PENDENTE')).toEqual({ ok: false, erro: 'sessao' })
    expect(rpc).not.toHaveBeenCalled()
  })
  it('passa só filtro saneado e limite fixo (nada de loja/empresa vindo do navegador)', async () => {
    rpc.mockResolvedValue({ data: [], error: null })
    await listarRevisoesOffline('TODOS')
    expect(rpc).toHaveBeenCalledWith('listar_revisoes_offline', { p_status: 'PENDENTE', p_limite: 100 })
  })
  it('mapeia linhas', async () => {
    rpc.mockResolvedValue({ data: [{ id: ID, status: 'PENDENTE', classificacao: 'APOS_INATIVACAO' }], error: null })
    const r = await listarRevisoesOffline('PENDENTE')
    expect(r.ok && r.itens[0].classificacao).toBe('APOS_INATIVACAO')
  })
  it('erro do banco vira código', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'REVISAO_EXIGE_USUARIO' } })
    expect(await listarRevisoesOffline()).toEqual({ ok: false, erro: 'sem_permissao' })
  })
})

describe('decidirRevisaoOffline', () => {
  it('justificativa obrigatória antes de qualquer chamada', async () => {
    expect(await decidirRevisaoOffline({ id: ID, decisao: 'APROVAR', motivo: '  ' })).toEqual({
      ok: false,
      erro: 'motivo_obrigatorio',
    })
    expect(assertGerente).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })
  it('sem sessão: não decide', async () => {
    assertGerente.mockResolvedValue({ ok: false, error: 'x' })
    expect(await decidirRevisaoOffline({ id: ID, decisao: 'APROVAR', motivo: 'conferido' })).toEqual({ ok: false, erro: 'sessao' })
    expect(rpc).not.toHaveBeenCalled()
  })
  it('aprova via RPC e revalida', async () => {
    rpc.mockResolvedValue({ data: { status: 'APROVADO' }, error: null })
    expect(await decidirRevisaoOffline({ id: ID, decisao: 'APROVAR', motivo: ' conferido ' })).toEqual({
      ok: true,
      status: 'APROVADO',
      idempotente: false,
    })
    expect(rpc).toHaveBeenCalledWith('revisar_evento_offline', { p_id: ID, p_decisao: 'APROVAR', p_motivo: 'conferido' })
    expect(revalidate).toHaveBeenCalledWith('/admin/revisao-offline')
  })
  it('repetição idempotente', async () => {
    rpc.mockResolvedValue({ data: { status: 'REJEITADO', idempotente: true }, error: null })
    expect(await decidirRevisaoOffline({ id: ID, decisao: 'REJEITAR', motivo: 'duplicado' })).toEqual({
      ok: true,
      status: 'REJEITADO',
      idempotente: true,
    })
  })
  it('autoaprovação, já decidida e outra empresa vêm do banco', async () => {
    for (const [msg, erro] of [
      ['REVISAO_AUTOAPROVACAO_PROIBIDA', 'autoaprovacao'],
      ['REVISAO_JA_DECIDIDA', 'ja_decidida'],
      ['REVISAO_NAO_ENCONTRADA_OU_SEM_PERMISSAO', 'sem_permissao'],
    ] as const) {
      rpc.mockResolvedValueOnce({ data: null, error: { message: msg } })
      expect(await decidirRevisaoOffline({ id: ID, decisao: 'APROVAR', motivo: 'conferido' })).toEqual({ ok: false, erro })
    }
    expect(revalidate).not.toHaveBeenCalled()
  })
})
