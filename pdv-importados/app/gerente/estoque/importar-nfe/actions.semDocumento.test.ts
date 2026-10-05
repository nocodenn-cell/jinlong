import { beforeEach, describe, expect, it, vi } from 'vitest'
const auth = vi.hoisted(() => vi.fn())
const client = vi.hoisted(() => vi.fn())
const loja = vi.hoisted(() => vi.fn())
vi.mock('@/lib/gerente/auth/assertGerenteSession', () => ({ assertGerenteSession: auth }))
vi.mock('@/lib/supabase/server', () => ({ createClient: client }))
vi.mock('@/lib/gerente/auth/sessionContext', () => ({ getGerenteLojaId: loja, getGerenteUserId: vi.fn() }))
import { previewNotaManualNfe } from './actions'
const produto = { id: '11111111-1111-4111-8111-111111111111', nome: 'Tapete', codigo_barras: null }
const entrada = {
  sem_documento: true, emitente_nome: 'Fornecedor', emitente_cnpj: '12345678000199',
  itens: [{ nome_produto: 'Tapete', produto_id: produto.id, q_com: 900, v_un_com: 10 }],
  duplicatas: [{ data_vencimento: '2026-10-05', valor: 9000 }],
}
const filtros: unknown[][] = []
function banco(produtos: object[]) {
  return { from: (table: string) => {
    const rows = table === 'produtos' ? produtos : []
    const query = {
      select: () => query, eq: (...args: unknown[]) => { filtros.push([table, ...args]); return query },
      in: () => query, or: () => query,
      maybeSingle: async () => ({ data: null, error: null }),
      then: (resolve: (value: unknown) => void) => resolve({ data: rows, error: null }),
    }
    return query
  } }
}
beforeEach(() => {
  vi.clearAllMocks(); filtros.length = 0
  auth.mockResolvedValue({ ok: true }); loja.mockResolvedValue('loja-a'); client.mockResolvedValue(banco([produto]))
})
describe('entrada sem documento: servidor', () => {
  it('aceita nome digitado sem produto selecionado para cadastrar ou vincular na conferência', async () => {
    const result = await previewNotaManualNfe({ ...entrada, emitente_cnpj: '',
      itens: [{ nome_produto: 'Produto novo', q_com: 900, v_un_com: 10 }],
    })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.linhas[0]).toMatchObject({ nome_produto: 'Produto novo', produto_id: null, status_produto: 'DESCONHECIDO' })
  })
  it('gera referência interna sem número de nota e vincula o produto da loja, sem escrever', async () => {
    const result = await previewNotaManualNfe(entrada)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.parsed.numero_nf).toMatch(/^ENT-/)
    expect(result.data.parsed.chave_acesso).toMatch(/^MANUAL/)
    expect(result.data.parsed.origem_manual).toBe(true)
    expect(result.data.linhas[0]).toMatchObject({ produto_id: produto.id, status_produto: 'RECONHECIDO_CATALOGO', q_com: 900, v_un_com: 10 })
    expect(filtros).toContainEqual(['produtos', 'loja_id', 'loja-a'])
  })
  it('recusa produto de outra loja em vez de cadastrar uma cópia', async () => {
    client.mockResolvedValue(banco([]))
    const result = await previewNotaManualNfe(entrada)
    expect(result).toEqual({ success: false, error: expect.stringContaining('não está disponível nesta loja') })
  })
  it('recusa dívida divergente antes de consultar o banco', async () => {
    const result = await previewNotaManualNfe({ ...entrada, duplicatas: [{ data_vencimento: '2026-10-05', valor: 9400 }] })
    expect(result.success).toBe(false); expect(client).not.toHaveBeenCalled()
  })
})
