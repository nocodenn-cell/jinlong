import { describe, expect, it, vi } from 'vitest'
import { handleDemoRequest, isValidContact, makeProtocol, RateLimiter, supabaseDemoStore, validateDemoRequest, type DemoStore } from './demoRequest'

const good = { name: 'Li Wei', store: 'Loja Dragão', contact: '11 91234-5678', channel: 'whatsapp', locale: 'zh-CN' }
const memStore = () => {
  const rows: unknown[] = []
  const store: DemoStore = { insert: async (r) => void rows.push(r) }
  return { rows, store }
}

describe('validateDemoRequest', () => {
  it('aceita pedido válido e normaliza espaços', () => {
    const r = validateDemoRequest({ ...good, name: '  Li   Wei ' })
    expect(r).toMatchObject({ ok: true, honeypot: false, data: { name: 'Li Wei', channel: 'whatsapp', locale: 'zh-CN' } })
  })
  it('rejeita campos ausentes, curtos, longos e com HTML', () => {
    expect(validateDemoRequest({})).toEqual({ ok: false, errors: ['name', 'store', 'channel'] })
    expect(validateDemoRequest({ ...good, name: 'A' })).toMatchObject({ ok: false, errors: ['name'] })
    expect(validateDemoRequest({ ...good, store: 'x'.repeat(121) })).toMatchObject({ ok: false, errors: ['store'] })
    expect(validateDemoRequest({ ...good, name: '<script>' })).toMatchObject({ ok: false, errors: ['name'] })
    expect(validateDemoRequest({ ...good, channel: 'email' })).toMatchObject({ ok: false, errors: ['channel'] })
    expect(validateDemoRequest(null)).toMatchObject({ ok: false })
  })
  it('valida contato conforme o canal', () => {
    expect(isValidContact('+55 (11) 91234-5678', 'whatsapp')).toBe(true)
    expect(isValidContact('12345', 'whatsapp')).toBe(false)
    expect(isValidContact('abc', 'whatsapp')).toBe(false)
    expect(isValidContact('li_wei88', 'wechat')).toBe(true)
    expect(isValidContact('a b', 'wechat')).toBe(false)
  })
  it('locale desconhecido cai em pt-BR', () => {
    expect(validateDemoRequest({ ...good, locale: 'en' })).toMatchObject({ ok: true, data: { locale: 'pt-BR' } })
  })
})

describe('makeProtocol', () => {
  it('formato JL-AAMMDD-XXXXXX sem ambíguos', () => {
    const p = makeProtocol(new Date('2026-10-20T12:00:00Z'))
    expect(p).toMatch(/^JL-261020-[A-HJ-NP-Z2-9]{6}$/)
  })
})

describe('RateLimiter', () => {
  it('limita por chave dentro da janela e libera depois', () => {
    const rl = new RateLimiter(2, 1000)
    expect(rl.allow('a', 0)).toBe(true)
    expect(rl.allow('a', 10)).toBe(true)
    expect(rl.allow('a', 20)).toBe(false)
    expect(rl.allow('b', 20)).toBe(true)
    expect(rl.allow('a', 1500)).toBe(true)
  })
})

describe('handleDemoRequest', () => {
  it('grava e devolve protocolo', async () => {
    const { rows, store } = memStore()
    const r = await handleDemoRequest(good, '1.1.1.1', { store, limiter: new RateLimiter(), protocol: () => 'JL-261020-ABCDEF' })
    expect(r).toEqual({ status: 201, body: { ok: true, protocol: 'JL-261020-ABCDEF' } })
    expect(rows).toEqual([{ name: 'Li Wei', store: 'Loja Dragão', contact: '11 91234-5678', channel: 'whatsapp', locale: 'zh-CN', protocol: 'JL-261020-ABCDEF', product: 'jinlong' }])
  })
  it('honeypot: responde sucesso e não grava', async () => {
    const { rows, store } = memStore()
    const r = await handleDemoRequest({ ...good, website: 'http://spam' }, 'x', { store, limiter: new RateLimiter() })
    expect(r.status).toBe(201)
    expect(rows).toHaveLength(0)
  })
  it('400 com campos inválidos', async () => {
    const r = await handleDemoRequest({ ...good, contact: '1' }, 'x', { store: memStore().store, limiter: new RateLimiter() })
    expect(r).toEqual({ status: 400, body: { ok: false, error: 'invalid', fields: ['contact'] } })
  })
  it('429 quando excede o limite', async () => {
    const limiter = new RateLimiter(1, 60_000)
    const deps = { store: memStore().store, limiter }
    expect((await handleDemoRequest(good, 'ip', deps)).status).toBe(201)
    expect(await handleDemoRequest(good, 'ip', deps)).toEqual({ status: 429, body: { ok: false, error: 'rate_limited' } })
  })
  it('503 not_configured sem persistência; 503 unavailable se o insert falha', async () => {
    expect(await handleDemoRequest(good, 'x', { store: null, limiter: new RateLimiter() })).toEqual({ status: 503, body: { ok: false, error: 'not_configured' } })
    const failing: DemoStore = { insert: async () => { throw new Error('down') } }
    expect(await handleDemoRequest(good, 'x', { store: failing, limiter: new RateLimiter() })).toEqual({ status: 503, body: { ok: false, error: 'unavailable' } })
  })
})

describe('supabaseDemoStore', () => {
  it('null sem env ou com URL fora do supabase.co', () => {
    expect(supabaseDemoStore({})).toBeNull()
    expect(supabaseDemoStore({ SITE_DEMO_SUPABASE_URL: 'https://evil.example', SITE_DEMO_SUPABASE_ANON_KEY: 'k' })).toBeNull()
  })
  it('faz POST insert-only (return=minimal) na tabela do site', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 201 }))
    const s = supabaseDemoStore({ SITE_DEMO_SUPABASE_URL: 'https://abc.supabase.co/', SITE_DEMO_SUPABASE_ANON_KEY: 'k' }, fetchImpl as unknown as typeof fetch)
    await s!.insert({ name: 'a', store: 'b', contact: 'c', channel: 'wechat', locale: 'pt-BR', protocol: 'p', product: 'jinlong' })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://abc.supabase.co/rest/v1/commercial_leads')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).Prefer).toBe('return=minimal')
  })
  it('erro HTTP vira exceção', async () => {
    const s = supabaseDemoStore({ SITE_DEMO_SUPABASE_URL: 'https://abc.supabase.co', SITE_DEMO_SUPABASE_ANON_KEY: 'k' }, (async () => new Response(null, { status: 401 })) as unknown as typeof fetch)
    await expect(s!.insert({ name: 'a', store: 'b', contact: 'c', channel: 'wechat', locale: 'pt-BR', protocol: 'p', product: 'jinlong' })).rejects.toThrow('401')
  })
})

describe('confirmação só após gravação', () => {
  it('não devolve protocolo antes do insert terminar com sucesso', async () => {
    let release!: () => void
    const store: DemoStore = { insert: () => new Promise<void>((r) => { release = r }) }
    let settled = false
    const pending = handleDemoRequest(good, 'z', { store, limiter: new RateLimiter() }).then((r) => { settled = true; return r })
    await new Promise((r) => setTimeout(r, 10))
    expect(settled).toBe(false)
    release()
    expect((await pending).status).toBe(201)
  })
})
