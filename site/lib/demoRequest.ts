/**
 * Pedido de demonstração (POST /pedido-demo): validação, honeypot, limite de taxa e persistência.
 * Persistência: tabela public.commercial_leads (product='jinlong') no Supabase existente, via REST com a chave anon
 * (RLS permite só INSERT; ninguém lê com anon). Sem configuração, responde 503 "not_configured" e a UI
 * mostra WhatsApp/e-mail — o pedido nunca se perde em silêncio.
 */

export type DemoChannel = 'whatsapp' | 'wechat'
export type DemoLocale = 'pt-BR' | 'zh-CN'

import { leadExtrasSchema, type LeadExtraField, type LeadExtras } from './leadSchema'

export interface DemoRequest extends LeadExtras {
  name: string
  store: string
  contact: string
  channel: DemoChannel
  locale: DemoLocale
}

export type DemoFieldError = 'name' | 'store' | 'contact' | 'channel' | LeadExtraField

export type ValidationResult =
  | { ok: true; data: DemoRequest; honeypot: boolean }
  | { ok: false; errors: DemoFieldError[] }

const clean = (v: unknown): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '')
const CONTROL = /[\u0000-\u001f\u007f<>]/

export function isValidContact(contact: string, channel: DemoChannel): boolean {
  if (channel === 'whatsapp') {
    if (!/^\+?[\d\s().-]+$/.test(contact)) return false
    const digits = contact.replace(/\D/g, '')
    return digits.length >= 10 && digits.length <= 15
  }
  return /^[\w.+@-]{3,40}$/.test(contact.replace(/\s/g, '')) || /^\+?[\d\s().-]{10,20}$/.test(contact)
}

export function validateDemoRequest(input: unknown): ValidationResult {
  const body = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const name = clean(body.name)
  const store = clean(body.store)
  const contact = clean(body.contact)
  const channel = body.channel
  const locale: DemoLocale = body.locale === 'zh-CN' ? 'zh-CN' : 'pt-BR'
  const errors: DemoFieldError[] = []
  if (name.length < 2 || name.length > 80 || CONTROL.test(name)) errors.push('name')
  if (store.length < 2 || store.length > 120 || CONTROL.test(store)) errors.push('store')
  if (channel !== 'whatsapp' && channel !== 'wechat') errors.push('channel')
  else if (contact.length > 60 || !isValidContact(contact, channel)) errors.push('contact')
  const extras = leadExtrasSchema.safeParse({
    city: clean(body.city),
    segment: clean(body.segment),
    wechat: clean(body.wechat),
    idioma: body.idioma ?? locale,
    utm_source: body.utm_source,
    utm_medium: body.utm_medium,
    utm_campaign: body.utm_campaign,
  })
  if (!extras.success) {
    for (const issue of extras.error.issues) {
      const f = issue.path[0]
      if ((f === 'city' || f === 'segment' || f === 'wechat' || f === 'idioma') && !errors.includes(f)) errors.push(f)
    }
  }
  if (errors.length || !extras.success) return { ok: false, errors }
  return {
    ok: true,
    honeypot: clean(body.website) !== '',
    data: { name, store, contact, channel: channel as DemoChannel, locale, ...extras.data },
  }
}

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

/** Protocolo legível: JL-AAMMDD-XXXXXX (sem caracteres ambíguos). */
export function makeProtocol(now: Date = new Date(), random: (n: number) => Uint8Array = randomBytes): string {
  const ymd = now.toISOString().slice(2, 10).replace(/-/g, '')
  const suffix = Array.from(random(6), (b) => ALPHABET[b % ALPHABET.length]).join('')
  return `JL-${ymd}-${suffix}`
}

function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n))
}

/** Limite de taxa simples em memória (por instância): N pedidos por janela, por IP. */
export class RateLimiter {
  private hits = new Map<string, number[]>()
  constructor(private readonly max = 5, private readonly windowMs = 10 * 60_000) {}
  allow(key: string, now = Date.now()): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs)
    if (recent.length >= this.max) {
      this.hits.set(key, recent)
      return false
    }
    recent.push(now)
    this.hits.set(key, recent)
    if (this.hits.size > 5000) this.hits.clear()
    return true
  }
}

export interface DemoStore {
  insert(row: DemoRequest & { protocol: string; product: 'jinlong' }): Promise<void>
}

type Env = Readonly<Record<string, string | undefined>>

/** Confirmação/protocolo só voltam ao visitante DEPOIS que o insert respondeu 2xx.
 * Persistência no Supabase via REST (anon + RLS insert-only). null = não configurado. */
export function supabaseDemoStore(env: Env = process.env, fetchImpl: typeof fetch = fetch): DemoStore | null {
  const url = env.SITE_DEMO_SUPABASE_URL?.trim()
  const key = env.SITE_DEMO_SUPABASE_ANON_KEY?.trim()
  if (!url || !key || !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url)) return null
  return {
    async insert(row) {
      const res = await fetchImpl(`${url.replace(/\/$/, '')}/rest/v1/commercial_leads`, {
        method: 'POST',
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify(row),
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) throw new Error(`insert failed: ${res.status}`)
    },
  }
}

export type DemoResponse =
  | { status: 201; body: { ok: true; protocol: string } }
  | { status: 400; body: { ok: false; error: 'invalid'; fields: DemoFieldError[] } }
  | { status: 429; body: { ok: false; error: 'rate_limited' } }
  | { status: 503; body: { ok: false; error: 'not_configured' | 'unavailable' } }

export async function handleDemoRequest(
  input: unknown,
  ip: string,
  deps: { store: DemoStore | null; limiter: RateLimiter; protocol?: () => string },
): Promise<DemoResponse> {
  if (!deps.limiter.allow(ip)) return { status: 429, body: { ok: false, error: 'rate_limited' } }
  const result = validateDemoRequest(input)
  if (!result.ok) return { status: 400, body: { ok: false, error: 'invalid', fields: result.errors } }
  const protocol = (deps.protocol ?? makeProtocol)()
  // Honeypot preenchido: responde como sucesso (o robô não aprende nada) e não grava.
  if (result.honeypot) return { status: 201, body: { ok: true, protocol } }
  if (!deps.store) return { status: 503, body: { ok: false, error: 'not_configured' } }
  try {
    await deps.store.insert({ ...result.data, protocol, product: 'jinlong' })
  } catch (err) {
    console.error('[pedido-demo] insert falhou:', err instanceof Error ? err.message : String(err))
    return { status: 503, body: { ok: false, error: 'unavailable' } }
  }
  return { status: 201, body: { ok: true, protocol } }
}
