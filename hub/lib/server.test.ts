import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { isAdmin, jwtExp, jwtSub, memberRole, signIn } from './auth'
import { getConfig, isDemoMode } from './config'
import { restRepo } from './repo'

const cfg = { url: 'https://abc.supabase.co', anonKey: 'anon' }
const ROOT = path.resolve(__dirname, '..')

describe('configuração', () => {
  it('só aceita supabase.co e só variáveis de servidor', () => {
    expect(getConfig({})).toBeNull()
    expect(getConfig({ HUB_SUPABASE_URL: 'https://evil.example', HUB_SUPABASE_ANON_KEY: 'k' })).toBeNull()
    expect(getConfig({ HUB_SUPABASE_URL: 'https://abc.supabase.co/', HUB_SUPABASE_ANON_KEY: 'k' })).toEqual({ url: 'https://abc.supabase.co', anonKey: 'k' })
  })
  it('modo fictício nunca em produção nem com banco configurado', () => {
    expect(isDemoMode({ HUB_DEMO_DATA: 'ficticio' })).toBe(true)
    expect(isDemoMode({ HUB_DEMO_DATA: 'ficticio', VERCEL_ENV: 'production' })).toBe(false)
    expect(isDemoMode({ HUB_DEMO_DATA: 'ficticio', HUB_SUPABASE_URL: 'https://abc.supabase.co', HUB_SUPABASE_ANON_KEY: 'k' })).toBe(false)
  })
})

describe('auth', () => {
  it('login devolve tokens; falha devolve null', async () => {
    const ok = vi.fn(async () => Response.json({ access_token: 'a', refresh_token: 'r', expires_in: 3600 }))
    expect(await signIn(cfg, 'e', 'p', ok as unknown as typeof fetch)).toMatchObject({ access_token: 'a', refresh_token: 'r' })
    expect(await signIn(cfg, 'e', 'p', (async () => new Response('', { status: 400 })) as unknown as typeof fetch)).toBeNull()
  })
  it('admin só quando a RPC do banco responde true', async () => {
    const f = (body: unknown, status = 200) => (async () => Response.json(body, { status })) as unknown as typeof fetch
    expect(await isAdmin(cfg, 't', f(true))).toBe(true)
    expect(await isAdmin(cfg, 't', f(false))).toBe(false)
    expect(await isAdmin(cfg, 't', f({ message: 'x' }, 401))).toBe(false)
  })
  it('papel vem da RPC do banco; antes da migration cai no is_commercial_admin', async () => {
    const f = (map: Record<string, [unknown, number]>) => (async (u: string) => { const k = Object.keys(map).find((x) => u.endsWith(x)) ?? ''; const [b, st] = map[k] ?? [null, 500]; return Response.json(b, { status: st }) }) as unknown as typeof fetch
    expect(await memberRole(cfg, 't', f({ commercial_meu_papel: ['vendedor', 200] }))).toBe('vendedor')
    expect(await memberRole(cfg, 't', f({ commercial_meu_papel: ['hacker', 200] }))).toBeNull()
    expect(await memberRole(cfg, 't', f({ commercial_meu_papel: [null, 200] }))).toBeNull()
    expect(await memberRole(cfg, 't', f({ commercial_meu_papel: [{}, 404], is_commercial_admin: [true, 200] }))).toBe('gestor')
    await expect(memberRole(cfg, 't', f({ commercial_meu_papel: [{}, 503] }))).rejects.toThrow()
  })
  it('jwtSub só aceita uuid', () => {
    const tok = (sub: unknown) => `x.${Buffer.from(JSON.stringify({ sub })).toString('base64url')}.y`
    expect(jwtSub(tok('00000000-0000-4000-8000-000000000001'))).toBe('00000000-0000-4000-8000-000000000001')
    expect(jwtSub(tok('x'))).toBeNull()
  })
  it('jwtExp lê exp e tolera lixo', () => {
    const tok = `x.${Buffer.from(JSON.stringify({ exp: 123 })).toString('base64url')}.y`
    expect(jwtExp(tok)).toBe(123)
    expect(jwtExp('lixo')).toBeNull()
  })
})

describe('repositório REST', () => {
  it('usa o JWT do usuário (não service role) e só tabelas commercial_*', async () => {
    const calls: Array<[string, RequestInit]> = []
    const f = (async (u: string, i: RequestInit) => { calls.push([u, i]); return Response.json([]) }) as unknown as typeof fetch
    const repo = restRepo(cfg, 'user-jwt', f)
    await repo.listLeads({ q: '', status: null, product: null, period: 'all' })
    await repo.listCustomers()
    for (const [u, i] of calls) {
      expect(u).toMatch(/^https:\/\/abc\.supabase\.co\/rest\/v1\/commercial_/)
      expect((i.headers as Record<string, string>).Authorization).toBe('Bearer user-jwt')
    }
  })
  it('mudança de etapa vai pela RPC do banco (regras de transição lá), com motivo', async () => {
    const calls: Array<[string, RequestInit]> = []
    const f = (async (u: string, i: RequestInit = {}) => { calls.push([u, i]); return new Response(null, { status: 204 }) }) as unknown as typeof fetch
    await restRepo(cfg, 't', f).changeStatus('L', 'perdido', 'Caro')
    expect(calls.map(([u, i]) => `${i.method} ${u.split('/rest/v1/')[1]}`)).toEqual(['POST rpc/commercial_lead_mover'])
    expect(JSON.parse(String(calls[0]?.[1].body))).toEqual({ p_lead: 'L', p_para: 'perdido', p_motivo: 'Caro' })
  })
  it('escritas do CRM só por RPC commercial_* (nada de PATCH em etapa/responsável)', async () => {
    const calls: string[] = []
    const f = (async (u: string) => { calls.push(u.split('/rest/v1/')[1] ?? ''); return Response.json('00000000-0000-4000-8000-000000000001') }) as unknown as typeof fetch
    const r = restRepo(cfg, 't', f)
    await r.assignLead('L', null)
    await r.updateLead('L', { uf: 'SP' })
    await r.scheduleActivity({ leadId: 'L', tipo: 'ligacao', titulo: 'x', quando: '2026-11-21T12:00:00Z', responsavel: null })
    await r.concludeActivity('A', 'ok', false)
    await r.createProposal({ leadId: 'L', plano: 'BASICO', addons: [], qtdLojas: 1, qtdCaixas: 1, valorCentavos: null, condicoes: null, validade: '2026-12-01' })
    await r.setProposalStatus('P', 'enviada', null)
    await r.convertLead('L', 'P', 'aceite ok')
    await r.saveMember({ email: 'a@b.co', nome: null, papel: 'vendedor', ativo: true })
    await r.saveStage({ codigo: 'x_y', rotulo: 'X', ordem: 40, ativo: true })
    expect(calls.every((c) => c.startsWith('rpc/commercial_'))).toBe(true)
  })
  it('lista paginada lê o total do Content-Range', async () => {
    const f = (async () => new Response(JSON.stringify([{ id: 'a' }]), { status: 206, headers: { 'content-range': '25-25/51' } })) as unknown as typeof fetch
    expect(await restRepo(cfg, 't', f).listLeadsPage({ q: '', status: null, product: null, period: 'all', page: 2 }, 'me')).toEqual({ rows: [{ id: 'a' }], total: 51 })
  })
})

describe('Central de Conversão (repositório)', () => {
  it('lê e converte só por RPCs commercial_* com o JWT do admin', async () => {
    const calls: Array<[string, RequestInit]> = []
    const f = (async (u: string, i: RequestInit) => { calls.push([u, i]); return Response.json(u.includes('converter') ? { valor_mensal_centavos: 1 } : []) }) as unknown as typeof fetch
    const repo = restRepo(cfg, 'user-jwt', f)
    await repo.listTrials()
    await repo.listPlanos()
    await repo.convertTrial({ empresaId: 'E', plano: 'REDE', addons: [], qtdLojas: 1, qtdCaixas: 1, forma: 'PIX', valorCentavos: null, observacao: 'ok ok' })
    expect(calls.map(([u]) => u.split('/rest/v1/')[1])).toEqual(['rpc/commercial_trials_listar', 'rpc/commercial_planos', 'rpc/commercial_converter_trial'])
    for (const [, i] of calls) expect((i.headers as Record<string, string>).Authorization).toBe('Bearer user-jwt')
    expect(JSON.parse(String(calls[2]?.[1].body))).toMatchObject({ p_empresa: 'E', p_plano: 'REDE', p_valor_centavos: null, p_observacao: 'ok ok' })
  })
  it('erro de regra do banco chega com código (para mensagem amigável)', async () => {
    const f = (async () => Response.json({ message: 'COMMERCIAL_JA_CLIENTE' }, { status: 400 })) as unknown as typeof fetch
    await expect(restRepo(cfg, 't', f).convertTrial({ empresaId: 'E', plano: 'REDE', addons: [], qtdLojas: 1, qtdCaixas: 1, forma: 'PIX', valorCentavos: null, observacao: 'ok ok' }))
      .rejects.toMatchObject({ code: 'COMMERCIAL_JA_CLIENTE' })
    const g = (async () => Response.json({ message: 'relation "x" does not exist' }, { status: 400 })) as unknown as typeof fetch
    await expect(restRepo(cfg, 't', g).listTrials()).rejects.toMatchObject({ code: undefined })
  })
})

describe('isolamento', () => {
  const files = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name)
    if (d.isDirectory()) return ['node_modules', '.next', 'supabase'].includes(d.name) ? [] : files(p)
    return /\.(ts|tsx)$/.test(d.name) && !d.name.endsWith('.test.ts') ? [p] : []
  })
  const src = files(ROOT).map((f) => [path.relative(ROOT, f), fs.readFileSync(f, 'utf8')] as const)
  it('nunca usa service role nem variáveis NEXT_PUBLIC_', () => {
    expect(src.filter(([, s]) => /service_role|SERVICE_ROLE|NEXT_PUBLIC_/.test(s)).map(([f]) => f)).toEqual([])
  })
  it('não importa nada do ERP/PDV nem toca tabelas operacionais', () => {
    expect(src.filter(([, s]) => /pdv-importados|shared-core|from ['"]\.\.\/\.\.\/site/.test(s)).map(([f]) => f)).toEqual([])
    const tables = new Set(src.flatMap(([, s]) => [...s.matchAll(/rest\/v1\/(\w+)/g)].map((m) => m[1])))
    expect([...tables].filter((t) => !/^commercial_|^rpc$/.test(t))).toEqual([])
  })
  it('código com acesso a dados é só de servidor (server-only)', () => {
    for (const f of ['lib/config.ts', 'lib/auth.ts', 'lib/repo.ts', 'lib/session.ts']) expect(fs.readFileSync(path.join(ROOT, f), 'utf8')).toMatch(/^import 'server-only'/)
  })
})
