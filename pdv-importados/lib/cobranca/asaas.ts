/**
 * Cliente Asaas (API v3) — SOMENTE SERVIDOR.
 * Env:
 *   ASAAS_API_KEY   chave da conta (sandbox: começa com `$aact_hmlg_`, produção: `$aact_prod_`).
 *   ASAAS_BASE_URL  obrigatório em produção (VERCEL_ENV=production) ou com chave `$aact_prod_`; fora disso,
 *                   padrão sandbox https://api-sandbox.asaas.com/v3 (produção: https://api.asaas.com/v3).
 *   ASAAS_MOCK=1    força o mock (dev/teste). Sem ASAAS_API_KEY o mock é usado fora de produção.
 * Em produção sem chave ⇒ erro explícito (nunca cobrar "de mentira" em produção).
 */
export type BillingType = 'PIX' | 'BOLETO' | 'CREDIT_CARD' | 'UNDEFINED'

export type AsaasCliente = { id: string }
export type AsaasAssinatura = { id: string; nextDueDate: string; value: number; billingType: BillingType }
export type AsaasCobranca = { id: string; status: string; value: number; dueDate: string; invoiceUrl: string | null; bankSlipUrl: string | null }
export type AsaasPix = { encodedImage: string; payload: string; expirationDate: string | null }

export interface AsaasApi {
  readonly modo: 'sandbox' | 'producao' | 'mock'
  criarCliente(p: { nome: string; email: string; cpfCnpj?: string | null; externalReference: string }): Promise<AsaasCliente>
  criarAssinatura(p: { customer: string; valor: number; billingType: BillingType; nextDueDate: string; descricao: string; externalReference: string }): Promise<AsaasAssinatura>
  atualizarAssinatura(id: string, p: { valor: number; billingType: BillingType; descricao: string; updatePendingPayments: boolean }): Promise<AsaasAssinatura>
  cancelarAssinatura(id: string): Promise<void>
  cobrancasDaAssinatura(id: string): Promise<AsaasCobranca[]>
  pixQrCode(paymentId: string): Promise<AsaasPix>
}

export class AsaasErro extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<{
  ok: boolean; status: number; json: () => Promise<unknown>
}>

export function criarAsaasHttp(apiKey: string, baseUrl: string, fetchImpl: FetchLike = fetch as unknown as FetchLike): AsaasApi {
  const base = baseUrl.replace(/\/+$/, '')
  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetchImpl(`${base}${path}`, {
      method,
      headers: { access_token: apiKey, 'content-type': 'application/json', 'user-agent': 'fastproduct-jinlong' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const data = (await res.json().catch(() => ({}))) as { errors?: { description?: string }[] }
    if (!res.ok) throw new AsaasErro(data.errors?.[0]?.description ?? `Asaas HTTP ${res.status}`, res.status)
    return data as T
  }
  return {
    modo: /api\.asaas\.com/.test(base) ? 'producao' : 'sandbox',
    criarCliente: (p) => call('POST', '/customers', { name: p.nome, email: p.email, cpfCnpj: p.cpfCnpj ?? undefined, externalReference: p.externalReference, notificationDisabled: false }),
    criarAssinatura: (p) => call('POST', '/subscriptions', { customer: p.customer, billingType: p.billingType, value: p.valor, nextDueDate: p.nextDueDate, cycle: 'MONTHLY', description: p.descricao, externalReference: p.externalReference }),
    atualizarAssinatura: (id, p) => call('PUT', `/subscriptions/${encodeURIComponent(id)}`, { value: p.valor, billingType: p.billingType, description: p.descricao, updatePendingPayments: p.updatePendingPayments }),
    cancelarAssinatura: async (id) => { await call('DELETE', `/subscriptions/${encodeURIComponent(id)}`) },
    cobrancasDaAssinatura: async (id) => (await call<{ data: AsaasCobranca[] }>('GET', `/subscriptions/${encodeURIComponent(id)}/payments`)).data ?? [],
    pixQrCode: (paymentId) => call('GET', `/payments/${encodeURIComponent(paymentId)}/pixQrCode`),
  }
}

/** Mock em memória: mesmo contrato, IDs determinísticos — para dev, testes e demo sem conta Asaas. */
export function criarAsaasMock(): AsaasApi & { _estado: { assinaturas: Map<string, AsaasAssinatura & { canceled?: boolean }> } } {
  let seq = 0
  const id = (p: string) => `${p}_mock_${++seq}`
  const assinaturas = new Map<string, AsaasAssinatura & { canceled?: boolean }>()
  return {
    modo: 'mock',
    _estado: { assinaturas },
    criarCliente: async () => ({ id: id('cus') }),
    criarAssinatura: async (p) => {
      const a = { id: id('sub'), nextDueDate: p.nextDueDate, value: p.valor, billingType: p.billingType }
      assinaturas.set(a.id, a)
      return a
    },
    atualizarAssinatura: async (sid, p) => {
      const a = assinaturas.get(sid)
      if (!a) throw new AsaasErro('assinatura inexistente', 404)
      Object.assign(a, { value: p.valor, billingType: p.billingType })
      return a
    },
    cancelarAssinatura: async (sid) => {
      const a = assinaturas.get(sid)
      if (a) a.canceled = true
    },
    cobrancasDaAssinatura: async (sid) => {
      const a = assinaturas.get(sid)
      return a ? [{ id: `pay_${sid}`, status: 'PENDING', value: a.value, dueDate: a.nextDueDate, invoiceUrl: `https://sandbox.asaas.com/i/mock-${sid}`, bankSlipUrl: null }] : []
    },
    pixQrCode: async () => ({ encodedImage: '', payload: '00020126MOCK-PIX-SANDBOX', expirationDate: null }),
  }
}

let mockSingleton: AsaasApi | null = null

export function getAsaas(env: Record<string, string | undefined> = process.env): AsaasApi {
  const key = env.ASAAS_API_KEY?.trim()
  if (env.ASAAS_MOCK === '1' || (!key && env.NODE_ENV !== 'production' && env.VERCEL_ENV !== 'production')) {
    mockSingleton ??= criarAsaasMock()
    return mockSingleton
  }
  if (!key) throw new Error('ASAAS_API_KEY não configurada (ver docs/cobranca/SETUP_ASAAS.md).')
  const base = env.ASAAS_BASE_URL?.trim()
  const chaveProducao = key.startsWith('$aact_prod_')
  if (!base && (env.VERCEL_ENV === 'production' || chaveProducao)) {
    throw new Error('ASAAS_BASE_URL obrigatória em produção (ver docs/cobranca/SETUP_ASAAS.md).')
  }
  if (base && chaveProducao !== /\/\/api\.asaas\.com/.test(base)) {
    throw new Error('ASAAS_BASE_URL não corresponde ao tipo da ASAAS_API_KEY (produção × sandbox).')
  }
  return criarAsaasHttp(key, base || 'https://api-sandbox.asaas.com/v3')
}

export function formaParaAsaas(f: 'PIX' | 'BOLETO' | 'CARTAO'): BillingType {
  return f === 'CARTAO' ? 'CREDIT_CARD' : f
}

/** Próximo vencimento: hoje + N dias (YYYY-MM-DD, fuso de São Paulo). */
export function dataVencimento(diasAFrente: number, agora: Date = new Date()): string {
  const d = new Date(agora.getTime() + diasAFrente * 86_400_000)
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}
