import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchRawSession, normalizeAdminSession, type RawVinculo } from './sessionConsistency'
import { mockSupabaseUser } from '../../../tests/helpers/mockSupabaseUser'

const user = mockSupabaseUser('dono-1', 'dono@test.local')
const row = (perfil: string, vinculos?: RawVinculo[]) => ({
  status: 'authenticated' as const,
  user,
  usuario: { perfil, idioma_preferido: 'pt', loja_id: 'loja-1', ativo: true, vinculos },
})
const v = (empresa_id: string, papel: RawVinculo['papel'] = 'DONO'): RawVinculo => ({ empresa_id, loja_id: null, papel })

describe('sessão multiempresa (ESPEC §9)', () => {
  it('carrega empresa e vínculos', () => {
    const n = normalizeAdminSession(row('DONO', [v('e1')]), 'ssr')
    expect(n.authState).toBe('authenticated')
    expect(n.session?.empresaId).toBe('e1')
    expect(n.session?.vinculos).toHaveLength(1)
  })
  it('sem vínculo ativo ⇒ bloqueado (falha fechada)', () => {
    const n = normalizeAdminSession(row('GERENTE', []), 'ssr')
    expect(n.authState).toBe('blocked')
    expect(n.blockedReason).toBe('sem_empresa')
  })
  it('vínculos em duas empresas ⇒ bloqueado (sem seletor de empresa)', () => {
    const n = normalizeAdminSession(row('DONO', [v('e1'), v('e2', 'GERENTE')]), 'ssr')
    expect(n.blockedReason).toBe('multi_empresa')
  })
  it('duas empresas + seleção válida ⇒ entra só na escolhida', () => {
    const r = row('DONO', [v('e1'), v('e2', 'GERENTE')])
    const n = normalizeAdminSession({ ...r, usuario: { ...r.usuario, empresaSelecionada: 'e2' } }, 'ssr')
    expect(n.authState).toBe('authenticated')
    expect(n.session?.empresaId).toBe('e2')
    expect(n.session?.vinculos).toEqual([v('e2', 'GERENTE')])
  })
  it('seleção de empresa sem vínculo não desbloqueia', () => {
    const r = row('DONO', [v('e1'), v('e2')])
    const n = normalizeAdminSession({ ...r, usuario: { ...r.usuario, empresaSelecionada: 'e9' } }, 'ssr')
    expect(n.blockedReason).toBe('multi_empresa')
  })
  it('vínculos não lidos (ambiente sem a migration) ⇒ compatibilidade', () => {
    const n = normalizeAdminSession(row('GERENTE', undefined), 'ssr')
    expect(n.authState).toBe('authenticated')
    expect(n.session?.empresaId).toBeNull()
  })
  it('ADMIN legado (descontinuado) não entra, mesmo com loja', () => {
    expect(normalizeAdminSession(row('ADMIN', []), 'ssr').authState).not.toBe('authenticated')
  })
  it('fetchRawSession lê usuario_vinculos e tolera falha da tabela', async () => {
    const mk = (vincResult: { data: unknown; error: unknown }) =>
      ({
        auth: { getUser: async () => ({ data: { user }, error: null }), getSession: async () => ({ data: { session: null } }) },
        from: (t: string) =>
          t === 'usuario_vinculos'
            ? { select: () => ({ eq: () => ({ eq: async () => vincResult }) }) }
            : { select: () => ({ eq: () => ({ single: async () => ({ data: { perfil: 'DONO', loja_id: 'l', idioma_preferido: 'pt' }, error: null }) }) }) },
      }) as unknown as SupabaseClient
    const ok = await fetchRawSession(mk({ data: [v('e1')], error: null }))
    expect(ok.status === 'authenticated' && ok.usuario?.vinculos).toEqual([v('e1')])
    const semTabela = await fetchRawSession(mk({ data: null, error: { code: '42P01' } }))
    expect(semTabela.status === 'authenticated' && semTabela.usuario?.vinculos).toBeUndefined()
  })
})
