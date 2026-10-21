import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { isAdmin, jwtExp, signIn } from './auth'
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
  it('contratado gera histórico e loja contratada', async () => {
    const calls: Array<[string, RequestInit]> = []
    const lead = { id: 'L', status: 'proposta', product: 'jinlong', store: 'S', contact: 'C' }
    const f = (async (u: string, i: RequestInit = {}) => { calls.push([u, i]); return i.method ? new Response(null, { status: 201 }) : Response.json([lead]) }) as unknown as typeof fetch
    await restRepo(cfg, 't', f).changeStatus('L', 'contratado')
    expect(calls.map(([u, i]) => `${i.method ?? 'GET'} ${u.split('/rest/v1/')[1]?.split('?')[0]}`)).toEqual([
      'GET commercial_leads', 'PATCH commercial_leads', 'POST commercial_lead_events', 'POST commercial_customers',
    ])
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
