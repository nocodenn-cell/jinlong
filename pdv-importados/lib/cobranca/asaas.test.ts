import { describe, expect, it, vi } from 'vitest'
import { AsaasErro, criarAsaasHttp, criarAsaasMock, dataVencimento, getAsaas } from './asaas'

describe('getAsaas', () => {
  it('sem chave fora de produção ⇒ mock', () => {
    expect(getAsaas({ NODE_ENV: 'development' }).modo).toBe('mock')
  })
  it('sem chave em produção ⇒ erro explícito (nunca mock em produção)', () => {
    expect(() => getAsaas({ NODE_ENV: 'production' })).toThrow(/ASAAS_API_KEY/)
  })
  it('com chave ⇒ sandbox por padrão', () => {
    expect(getAsaas({ NODE_ENV: 'production', ASAAS_API_KEY: 'k' }).modo).toBe('sandbox')
  })
})

describe('getAsaas — URL explícita em produção (fail closed)', () => {
  it('VERCEL_ENV=production sem ASAAS_BASE_URL ⇒ erro', () => {
    expect(() => getAsaas({ NODE_ENV: 'production', VERCEL_ENV: 'production', ASAAS_API_KEY: 'k' })).toThrow(/ASAAS_BASE_URL/)
  })
  it('chave de produção sem URL ⇒ erro', () => {
    expect(() => getAsaas({ NODE_ENV: 'production', ASAAS_API_KEY: '$aact_prod_x' })).toThrow(/ASAAS_BASE_URL/)
  })
  it('chave de produção com URL sandbox ⇒ erro', () => {
    expect(() => getAsaas({ ASAAS_API_KEY: '$aact_prod_x', ASAAS_BASE_URL: 'https://api-sandbox.asaas.com/v3' })).toThrow(/não corresponde/)
  })
  it('produção com URL explícita ⇒ producao', () => {
    expect(getAsaas({ VERCEL_ENV: 'production', ASAAS_API_KEY: '$aact_prod_x', ASAAS_BASE_URL: 'https://api.asaas.com/v3' }).modo).toBe('producao')
  })
})

describe('cliente HTTP', () => {
  it('envia access_token e corpo da assinatura mensal', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: 'sub_1', nextDueDate: '2026-11-03', value: 99, billingType: 'PIX' }) })
    const api = criarAsaasHttp('chave-teste', 'https://api-sandbox.asaas.com/v3/', fetchImpl)
    await api.criarAssinatura({ customer: 'cus_1', valor: 99, billingType: 'PIX', nextDueDate: '2026-11-03', descricao: 'x', externalReference: 'emp' })
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://api-sandbox.asaas.com/v3/subscriptions')
    expect(init.headers.access_token).toBe('chave-teste')
    expect(JSON.parse(init.body)).toMatchObject({ cycle: 'MONTHLY', externalReference: 'emp', value: 99 })
  })
  it('erro do Asaas vira AsaasErro com a descrição', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ errors: [{ description: 'CPF inválido' }] }) })
    await expect(criarAsaasHttp('k', 'https://api-sandbox.asaas.com/v3', fetchImpl).criarCliente({ nome: 'a', email: 'a@b.c', externalReference: 'e' }))
      .rejects.toThrow(AsaasErro)
  })
})

describe('mock', () => {
  it('ciclo criar/atualizar/cancelar', async () => {
    const m = criarAsaasMock()
    const s = await m.criarAssinatura({ customer: 'c', valor: 10, billingType: 'BOLETO', nextDueDate: '2026-11-01', descricao: '', externalReference: 'e' })
    await m.atualizarAssinatura(s.id, { valor: 20, billingType: 'PIX', descricao: '', updatePendingPayments: true })
    expect((await m.cobrancasDaAssinatura(s.id))[0].value).toBe(20)
    await m.cancelarAssinatura(s.id)
    expect(m._estado.assinaturas.get(s.id)?.canceled).toBe(true)
  })
})

it('dataVencimento usa o fuso de São Paulo', () => {
  expect(dataVencimento(0, new Date('2026-10-20T01:00:00Z'))).toBe('2026-10-19')
})
