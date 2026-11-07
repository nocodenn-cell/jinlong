import { describe, expect, it } from 'vitest'
import { clientIpFrom, linhaDeLog, origemPermitida, origensPermitidas } from './pedidoDemoGuards'

const headers = (h: Record<string, string>) => {
  const m = new Map(Object.entries(h).map(([k, v]) => [k.toLowerCase(), v]))
  return { get: (name: string) => m.get(name.toLowerCase()) ?? null }
}

describe('clientIpFrom', () => {
  it('prefere x-vercel-forwarded-for (definido pela plataforma)', () => {
    expect(clientIpFrom(headers({ 'x-vercel-forwarded-for': '198.51.100.7', 'x-forwarded-for': '1.2.3.4, 10.0.0.1' }))).toBe('198.51.100.7')
  })
  it('usa x-real-ip quando não há x-vercel-forwarded-for', () => {
    expect(clientIpFrom(headers({ 'x-real-ip': '2001:db8::1' }))).toBe('2001:db8::1')
  })
  it('em x-forwarded-for usa o ÚLTIMO item (o que o proxy acrescenta), ignorando o que o cliente informou', () => {
    expect(clientIpFrom(headers({ 'x-forwarded-for': 'FALSO-DO-CLIENTE, 198.51.100.9' }))).toBe('198.51.100.9')
    expect(clientIpFrom(headers({ 'x-forwarded-for': '203.0.113.1, 198.51.100.9' }))).toBe('198.51.100.9')
  })
  it('valor fora do formato de IP cai em sem-ip (nunca repassa texto arbitrário ao banco)', () => {
    expect(clientIpFrom(headers({ 'x-vercel-forwarded-for': "'; drop table x; --" }))).toBe('sem-ip')
    expect(clientIpFrom(headers({ 'x-forwarded-for': '<script>' }))).toBe('sem-ip')
  })
  it('sem cabeçalho nenhum: sem-ip', () => {
    expect(clientIpFrom(headers({}))).toBe('sem-ip')
  })
})

describe('origensPermitidas e origemPermitida', () => {
  const permitidas = origensPermitidas('https://jinlong.app/', 'https://jinlong-preview.vercel.app, lixo-invalido')

  it('inclui a origem do site e extras válidos, ignorando o inválido', () => {
    expect(permitidas).toEqual(['https://jinlong.app', 'https://jinlong-preview.vercel.app'])
  })
  it('aceita apenas origem exata', () => {
    expect(origemPermitida('https://jinlong.app', permitidas)).toBe(true)
    expect(origemPermitida('https://jinlong.app.evil.example', permitidas)).toBe(false)
    expect(origemPermitida('http://jinlong.app', permitidas)).toBe(false)
    expect(origemPermitida('https://evil.example', permitidas)).toBe(false)
  })
  it('sem cabeçalho Origin, recusa', () => {
    expect(origemPermitida(null, permitidas)).toBe(false)
  })
  it('Origin malformado, recusa', () => {
    expect(origemPermitida('não é url', permitidas)).toBe(false)
  })
})

describe('linhaDeLog (sem dado pessoal)', () => {
  const agora = new Date('2026-11-07T15:42:10Z')

  it('contém só evento, status, motivo técnico e hora truncada', () => {
    const linha = JSON.parse(linhaDeLog('rejeitado', 429, 'LEAD_RATE_LIMIT', agora))
    expect(Object.keys(linha).sort()).toEqual(['etapa', 'evt', 'hora', 'motivo', 'status'])
    expect(linha).toMatchObject({ evt: 'pedido-demo', etapa: 'rejeitado', status: 429, motivo: 'LEAD_RATE_LIMIT', hora: '2026-11-07T15:00Z' })
  })
  it('motivo com texto livre é descartado (não pode carregar dado digitado)', () => {
    const linha = JSON.parse(linhaDeLog('rejeitado', 400, 'Li Wei +55 11 91234-5678'))
    expect(linha).not.toHaveProperty('motivo')
    expect(JSON.stringify(linha)).not.toMatch(/Li Wei|91234/)
  })
  it('não aceita campos extras (nome, contato, IP) por construção', () => {
    const texto = linhaDeLog('gravado', 201, undefined, agora)
    expect(texto).not.toMatch(/ip|contact|name|store|protocol|JL-/i)
  })
})
