import { describe, expect, it, vi } from 'vitest'
import {
  DemoStoreError,
  handleDemoRequest,
  isIdempotencyKey,
  isValidContact,
  makeProtocol,
  supabaseDemoStore,
  validateDemoRequest,
  type DemoStore,
  type DemoStoreRow,
} from './demoRequest'

const good = { name: 'Li Wei', store: 'Loja Dragão', contact: '11 91234-5678', channel: 'whatsapp', locale: 'zh-CN', segment: 'importados', idioma: 'zh-CN' }
const K1 = '11111111-1111-4111-8111-111111111111'
const K2 = '22222222-2222-4222-8222-222222222222'

/** Banco fake que reproduz as regras de registrar_lead_comercial: unicidade por chave, reenvio idêntico devolve o
 * protocolo original, conteúdo diferente com a mesma chave é recusado e o limite por IP é compartilhado. */
function bancoFake(limite = 10) {
  const linhas = new Map<string, { hash: string; protocolo: string }>()
  const contadores = new Map<string, number>()
  const protocolos = new Set<string>()
  const hashDe = (r: DemoStoreRow) => JSON.stringify([r.name, r.store, r.contact, r.channel, r.locale, r.city, r.segment, r.wechat, r.utm_source, r.utm_medium, r.utm_campaign])
  const storePara = (ip: string): DemoStore => ({
    async insert(r) {
      const n = (contadores.get(ip) ?? 0) + 1
      contadores.set(ip, n)
      if (n > limite) throw new DemoStoreError('LEAD_RATE_LIMIT')
      const existente = linhas.get(r.idempotencyKey)
      if (existente) {
        if (existente.hash !== hashDe(r)) throw new DemoStoreError('LEAD_CHAVE_REUTILIZADA')
        return existente.protocolo
      }
      if (protocolos.has(r.protocol)) throw new DemoStoreError('UNIQUE_PROTOCOLO')
      protocolos.add(r.protocol)
      linhas.set(r.idempotencyKey, { hash: hashDe(r), protocolo: r.protocol })
      return r.protocol
    },
  })
  return { linhas, contadores, storePara }
}

describe('validateDemoRequest', () => {
  it('aceita pedido válido e normaliza espaços', () => {
    const r = validateDemoRequest({ ...good, name: '  Li   Wei ' })
    expect(r).toMatchObject({ ok: true, honeypot: false, data: { name: 'Li Wei', channel: 'whatsapp', locale: 'zh-CN' } })
  })
  it('rejeita campos ausentes, curtos, longos e com HTML', () => {
    expect(validateDemoRequest({})).toEqual({ ok: false, errors: ['name', 'store', 'channel', 'segment'] })
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

describe('isIdempotencyKey', () => {
  it('aceita UUID v4 e recusa o resto', () => {
    expect(isIdempotencyKey(K1)).toBe(true)
    expect(isIdempotencyKey('nao-e-uuid')).toBe(false)
    expect(isIdempotencyKey('11111111-1111-1111-1111-111111111111')).toBe(false)
    expect(isIdempotencyKey(undefined)).toBe(false)
  })
})

describe('idempotência e concorrência (banco fake)', () => {
  it('primeiro envio válido grava e devolve o protocolo gravado', async () => {
    const db = bancoFake()
    const r = await handleDemoRequest({ ...good, idempotency_key: K1 }, { store: db.storePara('198.51.100.1'), protocol: () => 'JL-261104-AAAAAA' })
    expect(r).toEqual({ status: 201, body: { ok: true, protocol: 'JL-261104-AAAAAA' } })
    expect(db.linhas.size).toBe(1)
  })
  it('reenvio idêntico (mesma chave, mesmo conteúdo) devolve o protocolo original sem nova linha', async () => {
    const db = bancoFake()
    const store = db.storePara('198.51.100.2')
    const primeiro = await handleDemoRequest({ ...good, idempotency_key: K1 }, { store, protocol: () => 'JL-261104-AAAAAA' })
    const reenvio = await handleDemoRequest({ ...good, idempotency_key: K1 }, { store, protocol: () => 'JL-261104-BBBBBB' })
    expect(reenvio).toEqual(primeiro)
    expect(db.linhas.size).toBe(1)
  })
  it('reenvios concorrentes com a mesma chave geram uma linha e um protocolo', async () => {
    const db = bancoFake(100)
    const store = db.storePara('198.51.100.3')
    const respostas = await Promise.all(
      Array.from({ length: 10 }, (_, i) => handleDemoRequest({ ...good, idempotency_key: K1 }, { store, protocol: () => `JL-261104-CCCCC${i}` })),
    )
    const protocolos = new Set(respostas.map((r) => (r.status === 201 ? r.body.protocol : 'erro')))
    expect(protocolos.size).toBe(1)
    expect(db.linhas.size).toBe(1)
  })
  it('chave reutilizada com conteúdo diferente é recusada (409) e não grava nada', async () => {
    const db = bancoFake()
    const store = db.storePara('198.51.100.4')
    await handleDemoRequest({ ...good, idempotency_key: K1 }, { store })
    const r = await handleDemoRequest({ ...good, name: 'Outro Nome', idempotency_key: K1 }, { store })
    expect(r).toEqual({ status: 409, body: { ok: false, error: 'key_reused' } })
    expect(db.linhas.size).toBe(1)
  })
  it('nova tentativa legítima (chave nova, mesmo conteúdo) grava outra linha', async () => {
    const db = bancoFake()
    const store = db.storePara('198.51.100.5')
    await handleDemoRequest({ ...good, idempotency_key: K1 }, { store })
    const r = await handleDemoRequest({ ...good, idempotency_key: K2 }, { store })
    expect(r.status).toBe(201)
    expect(db.linhas.size).toBe(2)
  })
  it('cliente antigo sem chave: o servidor gera a chave (sem deduplicação de reenvios)', async () => {
    const db = bancoFake()
    const store = db.storePara('198.51.100.6')
    const gerada = vi.fn(() => K2)
    const r = await handleDemoRequest(good, { store, newKey: gerada })
    expect(r.status).toBe(201)
    expect(gerada).toHaveBeenCalledOnce()
    expect(db.linhas.has(K2)).toBe(true)
  })
})

describe('limite de taxa compartilhado (banco fake, múltiplas instâncias)', () => {
  it('o limite vale entre instâncias: o 11º envio do mesmo IP é recusado em qualquer instância', async () => {
    const db = bancoFake(10)
    const instanciaA = db.storePara('203.0.113.9')
    const instanciaB = db.storePara('203.0.113.9')
    const respostas: number[] = []
    for (let i = 0; i < 10; i++) {
      const store = i % 2 === 0 ? instanciaA : instanciaB
      respostas.push((await handleDemoRequest({ ...good, name: `Lead ${i}`, idempotency_key: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}` }, { store })).status)
    }
    expect(respostas.every((s) => s === 201)).toBe(true)
    const r = await handleDemoRequest({ ...good, name: 'Lead 11', idempotency_key: '00000000-0000-4000-8000-000000000099' }, { store: instanciaB })
    expect(r).toEqual({ status: 429, body: { ok: false, error: 'rate_limited' } })
    expect(db.linhas.size).toBe(10)
  })
  it('IPs diferentes têm limites independentes', async () => {
    const db = bancoFake(1)
    expect((await handleDemoRequest({ ...good, idempotency_key: K1 }, { store: db.storePara('198.51.100.20') })).status).toBe(201)
    expect((await handleDemoRequest({ ...good, name: 'Outra Pessoa', idempotency_key: K2 }, { store: db.storePara('198.51.100.21') })).status).toBe(201)
  })
})

describe('erros e falhas', () => {
  it('payload inválido: 400 com campos e sem chamar a persistência', async () => {
    const insert = vi.fn()
    const r = await handleDemoRequest({ ...good, contact: '1', idempotency_key: K1 }, { store: { insert } })
    expect(r).toEqual({ status: 400, body: { ok: false, error: 'invalid', fields: ['contact'] } })
    expect(insert).not.toHaveBeenCalled()
  })
  it('honeypot: responde sucesso e não grava', async () => {
    const insert = vi.fn()
    const r = await handleDemoRequest({ ...good, website: 'http://spam', idempotency_key: K1 }, { store: { insert } })
    expect(r.status).toBe(201)
    expect(insert).not.toHaveBeenCalled()
  })
  it('falha de conexão com o banco: 503 unavailable (fail-closed)', async () => {
    const failing: DemoStore = { insert: async () => { throw new DemoStoreError('NETWORK') } }
    expect(await handleDemoRequest({ ...good, idempotency_key: K1 }, { store: failing })).toEqual({ status: 503, body: { ok: false, error: 'unavailable' } })
  })
  it('erro interno da função vira 503 genérico (sem detalhe ao visitante)', async () => {
    const failing: DemoStore = { insert: async () => { throw new DemoStoreError('LEAD_RATE_INDISPONIVEL') } }
    const r = await handleDemoRequest({ ...good, idempotency_key: K1 }, { store: failing })
    expect(r).toEqual({ status: 503, body: { ok: false, error: 'unavailable' } })
    expect(JSON.stringify(r)).not.toMatch(/LEAD_|RATE/)
  })
  it('503 not_configured sem persistência configurada', async () => {
    expect(await handleDemoRequest({ ...good, idempotency_key: K1 }, { store: null })).toEqual({ status: 503, body: { ok: false, error: 'not_configured' } })
  })
  it('a 429 da função não expõe o detalhe ao visitante', async () => {
    const limitado: DemoStore = { insert: async () => { throw new DemoStoreError('LEAD_RATE_LIMIT') } }
    expect(await handleDemoRequest({ ...good, idempotency_key: K1 }, { store: limitado })).toEqual({ status: 429, body: { ok: false, error: 'rate_limited' } })
  })
})

describe('supabaseDemoStore (cliente REST)', () => {
  const base = { SITE_DEMO_SUPABASE_URL: 'https://abc.supabase.co/', SITE_DEMO_SUPABASE_SERVICE_ROLE_KEY: 'k' }
  const env = { ...base, SITE_DEMO_FORM_ATIVO: 'true' }
  const row: DemoStoreRow = { name: 'a', store: 'b', contact: 'c', channel: 'wechat', locale: 'pt-BR', segment: 'outro', idioma: 'pt-BR' as const, protocol: 'JL-261104-AAAAAA', product: 'jinlong', idempotencyKey: K1, utm_source: 'g' }

  it('null sem env ou com URL fora do supabase.co', () => {
    expect(supabaseDemoStore({})).toBeNull()
    expect(supabaseDemoStore({ SITE_DEMO_FORM_ATIVO: 'true', SITE_DEMO_SUPABASE_URL: 'https://evil.example', SITE_DEMO_SUPABASE_SERVICE_ROLE_KEY: 'k' })).toBeNull()
    // Chave anon não serve mais: sem service_role o cliente não é criado.
    expect(supabaseDemoStore({ SITE_DEMO_FORM_ATIVO: 'true', SITE_DEMO_SUPABASE_URL: 'https://abc.supabase.co', SITE_DEMO_SUPABASE_ANON_KEY: 'k' })).toBeNull()
  })
  it('flag desligada (ausente, "1" ou "false") devolve null e não chama o banco', async () => {
    for (const valor of [undefined, '1', 'false', '', 'TRUE ', 'yes']) {
      const fetchImpl = vi.fn(async () => new Response(JSON.stringify('JL-261104-AAAAAA'), { status: 200 }))
      const e = valor === undefined ? { ...base } : { ...base, SITE_DEMO_FORM_ATIVO: valor }
      expect(supabaseDemoStore(e, fetchImpl as unknown as typeof fetch)).toBeNull()
      expect(fetchImpl).not.toHaveBeenCalled()
    }
  })
  it('flag com espaços ao redor de "true" é aceita', () => {
    expect(supabaseDemoStore({ ...base, SITE_DEMO_FORM_ATIVO: '  true  ' }, vi.fn() as unknown as typeof fetch)).not.toBeNull()
  })
  it('chama a função (nunca a tabela) com a chave de idempotência e devolve o protocolo gravado', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify('JL-261104-AAAAAA'), { status: 200 }))
    const s = supabaseDemoStore(env, fetchImpl as unknown as typeof fetch)
    const protocolo = await s!.insert(row)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://abc.supabase.co/rest/v1/rpc/registrar_lead_comercial')
    expect(url).not.toMatch(/commercial_leads/)
    expect(JSON.parse(init.body as string)).toMatchObject({ p_idempotency_key: K1, p_protocol: 'JL-261104-AAAAAA', p_utm_source: 'g', p_utm_medium: null })
    expect(JSON.parse(init.body as string)).not.toHaveProperty('product')
    expect(protocolo).toBe('JL-261104-AAAAAA')
  })
  it('usa a chave service_role nos cabeçalhos e envia o IP do visitante como p_client_ip', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify('JL-261104-AAAAAA'), { status: 200 }))
    const s = supabaseDemoStore(env, fetchImpl as unknown as typeof fetch)
    await s!.insert({ ...row, clientIp: '198.51.100.7' })
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    const headers = init.headers as Record<string, string>
    expect(headers.apikey).toBe('k')
    expect(headers.Authorization).toBe('Bearer k')
    expect(JSON.parse(init.body as string)).toMatchObject({ p_client_ip: '198.51.100.7' })
  })
  it('sem IP do visitante, envia p_client_ip nulo (o banco usa sem-ip)', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify('JL-261104-AAAAAA'), { status: 200 }))
    await supabaseDemoStore(env, fetchImpl as unknown as typeof fetch)!.insert(row)
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toMatchObject({ p_client_ip: null })
  })
  it('mensagem de erro da função vira código do DemoStoreError', async () => {
    const s = supabaseDemoStore(env, (async () => new Response(JSON.stringify({ message: 'LEAD_CHAVE_REUTILIZADA' }), { status: 400 })) as unknown as typeof fetch)
    await expect(s!.insert(row)).rejects.toMatchObject({ code: 'LEAD_CHAVE_REUTILIZADA' })
  })
  it('falha de rede vira NETWORK', async () => {
    const s = supabaseDemoStore(env, (async () => { throw new TypeError('fetch failed') }) as unknown as typeof fetch)
    await expect(s!.insert(row)).rejects.toMatchObject({ code: 'NETWORK' })
  })
  it('resposta fora do formato vira RESPOSTA_INVALIDA', async () => {
    const s = supabaseDemoStore(env, (async () => new Response('{"x":1}', { status: 200 })) as unknown as typeof fetch)
    await expect(s!.insert(row)).rejects.toMatchObject({ code: 'RESPOSTA_INVALIDA' })
  })
})

describe('confirmação só após gravação', () => {
  it('não devolve protocolo antes do insert terminar com sucesso', async () => {
    let release!: () => void
    const store: DemoStore = { insert: (r) => new Promise<string>((resolve) => { release = () => resolve(r.protocol) }) }
    let settled = false
    const pending = handleDemoRequest({ ...good, idempotency_key: K1 }, { store }).then((r) => { settled = true; return r })
    await new Promise((r) => setTimeout(r, 10))
    expect(settled).toBe(false)
    release()
    expect((await pending).status).toBe(201)
  })
})

describe('campos extras do lead (zod)', () => {
  it('exige segmento da lista, cidade opcional, aceita WeChat vazio e guarda UTMs', () => {
    expect(validateDemoRequest({ ...good, segment: '' })).toMatchObject({ ok: false, errors: ['segment'] })
    expect(validateDemoRequest({ ...good, segment: 'Importados' })).toMatchObject({ ok: false, errors: ['segment'] })
    expect(validateDemoRequest({ ...good, city: '' })).toMatchObject({ ok: true })
    expect(validateDemoRequest({ ...good, city: 'x' })).toMatchObject({ ok: false, errors: ['city'] })
    expect(validateDemoRequest({ ...good, city: 'Recife' })).toMatchObject({ ok: true, data: { city: 'Recife' } })
    const r = validateDemoRequest({ ...good, wechat: '', utm_source: 'ig' })
    expect(r).toMatchObject({ ok: true, data: { utm_source: 'ig', idioma: 'zh-CN' } })
    expect(validateDemoRequest({ ...good, wechat: 'a b' })).toMatchObject({ ok: false, errors: ['wechat'] })
  })
})
