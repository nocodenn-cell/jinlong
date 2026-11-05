/**
 * Pedido de demonstração (POST /pedido-demo): validação, honeypot, idempotência e persistência.
 * Persistência: função public.registrar_lead_comercial no Supabase (RPC via REST, chave anon). A função valida os
 * campos, aplica o limite de taxa compartilhado (por IP, no banco) e grava com unicidade por chave de idempotência.
 * Sem configuração, responde 503 "not_configured" e a UI mostra WhatsApp/e-mail: o pedido nunca se perde em silêncio.
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
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

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

/** Protocolo legível: JL-AAMMDD-XXXXXX (sem caracteres ambíguos). O banco pode devolver o protocolo original. */
export function makeProtocol(now: Date = new Date(), random: (n: number) => Uint8Array = randomBytes): string {
  const ymd = now.toISOString().slice(2, 10).replace(/-/g, '')
  const suffix = Array.from(random(6), (b) => ALPHABET[b % ALPHABET.length]).join('')
  return `JL-${ymd}-${suffix}`
}

function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n))
}

/** Chave de idempotência por tentativa (UUID v4). Não contém dado pessoal. */
export function isIdempotencyKey(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}

/** Erro devolvido pela persistência, com o código da função do banco (ex.: LEAD_RATE_LIMIT) ou de rede. */
export class DemoStoreError extends Error {
  constructor(readonly code: string) {
    super(code)
  }
}

export interface DemoStoreRow extends DemoRequest {
  protocol: string
  product: 'jinlong'
  idempotencyKey: string
}

export interface DemoStore {
  /** Devolve o protocolo gravado (o original, em caso de reenvio com a mesma chave). */
  insert(row: DemoStoreRow): Promise<string>
}

type Env = Readonly<Record<string, string | undefined>>

/** Confirmação/protocolo só voltam ao visitante DEPOIS que a função respondeu 2xx.
 * Gravação só pela função public.registrar_lead_comercial (RPC via REST, chave anon). Sem INSERT direto na tabela. */
export function supabaseDemoStore(env: Env = process.env, fetchImpl: typeof fetch = fetch): DemoStore | null {
  const url = env.SITE_DEMO_SUPABASE_URL?.trim()
  const key = env.SITE_DEMO_SUPABASE_ANON_KEY?.trim()
  if (!url || !key || !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url)) return null
  return {
    async insert(row) {
      let res: Response
      try {
        res = await fetchImpl(`${url.replace(/\/$/, '')}/rest/v1/rpc/registrar_lead_comercial`, {
          method: 'POST',
          headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            p_idempotency_key: row.idempotencyKey,
            p_protocol: row.protocol,
            p_name: row.name,
            p_store: row.store,
            p_contact: row.contact,
            p_channel: row.channel,
            p_locale: row.locale,
            p_city: row.city ?? null,
            p_segment: row.segment ?? null,
            p_wechat: row.wechat ?? null,
            p_utm_source: row.utm_source ?? null,
            p_utm_medium: row.utm_medium ?? null,
            p_utm_campaign: row.utm_campaign ?? null,
          }),
          signal: AbortSignal.timeout(8000),
        })
      } catch {
        throw new DemoStoreError('NETWORK')
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: unknown } | null
        throw new DemoStoreError(typeof body?.message === 'string' ? body.message : `HTTP_${res.status}`)
      }
      const protocolo = (await res.json().catch(() => null)) as unknown
      if (typeof protocolo !== 'string' || !/^JL-[0-9]{6}-[A-Z2-9]{6}$/.test(protocolo)) throw new DemoStoreError('RESPOSTA_INVALIDA')
      return protocolo
    },
  }
}

export type DemoResponse =
  | { status: 201; body: { ok: true; protocol: string } }
  | { status: 400; body: { ok: false; error: 'invalid'; fields: DemoFieldError[] } }
  | { status: 409; body: { ok: false; error: 'key_reused' } }
  | { status: 429; body: { ok: false; error: 'rate_limited' } }
  | { status: 503; body: { ok: false; error: 'not_configured' | 'unavailable' } }

/** Traduz o erro da persistência para a resposta HTTP. Erros de validação do banco viram 400 sem campos,
 * porque a validação local já passou e o banco é a última barreira. Qualquer outra falha vira 503 (fail-closed). */
function respostaDeErroDaPersistencia(err: unknown): DemoResponse {
  const code = err instanceof DemoStoreError ? err.code : 'UNKNOWN'
  if (code === 'LEAD_RATE_LIMIT') return { status: 429, body: { ok: false, error: 'rate_limited' } }
  if (code === 'LEAD_CHAVE_REUTILIZADA') return { status: 409, body: { ok: false, error: 'key_reused' } }
  if (code.startsWith('LEAD_') && code !== 'LEAD_RATE_INDISPONIVEL') return { status: 400, body: { ok: false, error: 'invalid', fields: [] } }
  console.error('[pedido-demo] persistência falhou:', code)
  return { status: 503, body: { ok: false, error: 'unavailable' } }
}

export async function handleDemoRequest(
  input: unknown,
  deps: { store: DemoStore | null; protocol?: () => string; newKey?: () => string },
): Promise<DemoResponse> {
  const result = validateDemoRequest(input)
  if (!result.ok) return { status: 400, body: { ok: false, error: 'invalid', fields: result.errors } }
  const protocol = (deps.protocol ?? makeProtocol)()
  // Honeypot preenchido: responde como sucesso (o robô não aprende nada) e não grava.
  if (result.honeypot) return { status: 201, body: { ok: true, protocol } }
  if (!deps.store) return { status: 503, body: { ok: false, error: 'not_configured' } }
  // Clientes antigos, sem chave: a chave é gerada aqui. Sem chave do cliente não há deduplicação de reenvios.
  const raw = (input as Record<string, unknown> | null)?.idempotency_key
  const idempotencyKey = isIdempotencyKey(raw) ? raw : (deps.newKey ?? (() => crypto.randomUUID()))()
  try {
    const gravado = await deps.store.insert({ ...result.data, protocol, product: 'jinlong', idempotencyKey })
    return { status: 201, body: { ok: true, protocol: gravado } }
  } catch (err) {
    return respostaDeErroDaPersistencia(err)
  }
}
