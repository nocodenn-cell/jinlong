import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
// @ts-expect-error — módulo JS sem tipos, deliberado (ver cabeçalho de redact.js)
import { redigir, redigirTexto, REDIGIDO } from './redact'

describe('redigirTexto — padrões de PII e credencial', () => {
  it.each([
    ['CPF formatado', 'cliente 123.456.789-01 pagou'],
    ['CPF corrido', 'doc 12345678901 ok'],
    ['CNPJ formatado', 'emitente 12.345.678/0001-99'],
    ['CNPJ corrido', 'emitente 12345678000199'],
    ['e-mail', 'falha ao cobrar joao.silva+tag@exemplo.com.br'],
    ['telefone com DDD', 'contato (11) 98765-4321'],
    ['telefone +55', 'contato +55 11 98765 4321'],
    ['JWT', 'key eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.abc-123'],
    ['Bearer', 'header Bearer sk.live.9f8e7d6c'],
  ])('redige %s', (_rotulo, entrada) => {
    const saida = redigirTexto(entrada)
    expect(saida).toContain(REDIGIDO)
    // Nenhum fragmento sensível sobrevive.
    expect(saida).not.toMatch(/\d{5}|@exemplo|eyJ|sk\.live/)
  })

  it('preserva texto sem PII', () => {
    expect(redigirTexto('venda 3 itens concluida')).toBe('venda 3 itens concluida')
  })

  it('não destrói UUID/trace_id (corrida de dígitos não é telefone)', () => {
    const uuid = 'a0000001-0000-4000-8000-000000000001'
    expect(redigirTexto(uuid)).toBe(uuid)
  })
})

describe('redigir — estruturas', () => {
  it('redige por CHAVE sensível sem olhar o valor', () => {
    const r = redigir({ password: 'x', authorization: 'y', cookie: 'z', api_key: 'w', cpf: 'v' })
    expect(Object.values(r)).toEqual([REDIGIDO, REDIGIDO, REDIGIDO, REDIGIDO, REDIGIDO])
  })

  it('preserva chaves não sensíveis, inclusive homônimas parciais', () => {
    // `autoria`/`author` casariam um padrão `auth` ingênuo — não podem ser redigidas.
    const r = redigir({ venda_id: 'v1', autoria: 'joao', author: 'maria', itens_count: 3 })
    expect(r).toEqual({ venda_id: 'v1', autoria: 'joao', author: 'maria', itens_count: 3 })
  })

  it('desce em objetos aninhados e arrays', () => {
    const r = redigir({ a: { b: [{ senha: 's' }, { ok: 'texto joao@x.com' }] } })
    expect(r.a.b[0].senha).toBe(REDIGIDO)
    expect(r.a.b[1].ok).toBe(`texto ${REDIGIDO}`)
  })

  it('serializa Error redigindo message e stack', () => {
    const e = new Error('falha para joao@x.com')
    const r = redigir({ err: e })
    expect(r.err.name).toBe('Error')
    expect(r.err.message).toBe(`falha para ${REDIGIDO}`)
    expect(r.err.stack).not.toContain('joao@x.com')
  })

  it('corta referência circular sem estourar a pilha', () => {
    const a: Record<string, unknown> = { nome: 'x' }
    a.self = a
    expect(() => redigir(a)).not.toThrow()
    expect(redigir(a).self).toBe('[CIRCULAR]')
  })

  it('NÃO modifica o objeto original', () => {
    const original = { senha: 'segredo', nested: { email: 'a@b.com' } }
    const copia = structuredClone(original)
    redigir(original)
    expect(original).toEqual(copia)
  })

  it('passa primitivos e null adiante', () => {
    expect(redigir(null)).toBeNull()
    expect(redigir(undefined)).toBeUndefined()
    expect(redigir(42)).toBe(42)
    expect(redigir(true)).toBe(true)
  })
})

describe('integração — bordas que chegam ao Sentry', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => vi.clearAllMocks())

  it('addVendaBreadcrumb redige data e message', async () => {
    const addBreadcrumb = vi.fn()
    vi.doMock('@sentry/nextjs', () => ({ addBreadcrumb, withScope: vi.fn(), captureException: vi.fn() }))
    const { addVendaBreadcrumb } = await import('./vendaSentryRouter')

    addVendaBreadcrumb('venda', 'cliente joao@x.com', { cpf: '123.456.789-01', venda_id: 'v1' })

    const arg = addBreadcrumb.mock.calls[0]![0]!
    expect(arg.message).toBe(`cliente ${REDIGIDO}`)
    expect(arg.data.cpf).toBe(REDIGIDO)
    expect(arg.data.venda_id).toBe('v1')
  })

  it('setSentryVendaScope não envia identidade do operador', async () => {
    const setUser = vi.fn()
    const setTags = vi.fn()
    vi.doMock('@sentry/nextjs', () => ({
      setUser,
      setTags,
      addBreadcrumb: vi.fn(),
      withScope: vi.fn(),
      captureException: vi.fn(),
      captureMessage: vi.fn(),
    }))
    const { setSentryVendaScope } = await import('@/lib/sentry/vendaSentry')

    setSentryVendaScope({ trace_id: 't1', plataforma: 'web', operador_id: 'op-123' })

    expect(setUser).not.toHaveBeenCalled()
    const tags = setTags.mock.calls.flat().reduce((a, o) => ({ ...a, ...o }), {})
    expect(JSON.stringify(tags)).not.toContain('op-123')
  })
})
