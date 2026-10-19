import { describe, expect, it, vi } from 'vitest'
import { destinoSeguro, empresaDoDocumentCookie, headersEmpresa, normalizarEmpresaId } from './empresaSelecionada'
import { lojaAtivaParaEmpresa } from './selecionarEmpresa'
import { middlewareAdminDecision } from '@/lib/admin/policy/adminPolicy'

const A = 'e0000001-0000-4000-8000-000000000001'
const B = 'e0000002-0000-4000-8000-000000000002'

describe('seleção de empresa', () => {
  it('só aceita uuid; header vazio sem seleção', () => {
    expect(normalizarEmpresaId('x; drop')).toBeNull()
    expect(headersEmpresa(undefined)).toEqual({})
    expect(headersEmpresa(A.toUpperCase())).toEqual({ 'x-fp-empresa': A })
    expect(empresaDoDocumentCookie(`a=1; fp_empresa=${B}`)).toBe(B)
  })
  it('next só interno', () => {
    expect(destinoSeguro('//evil.com')).toBe('/gerente')
    expect(destinoSeguro('https://evil.com')).toBe('/gerente')
    expect(destinoSeguro('/admin/x')).toBe('/admin/x')
  })
  it('recusa empresa sem vínculo; usa loja do vínculo', async () => {
    const admin = { from: vi.fn() } as never
    const vinc = [{ empresa_id: A, loja_id: 'l1', nome: 'A' }]
    expect(await lojaAtivaParaEmpresa(admin, vinc, B)).toEqual({ ok: false, motivo: 'sem_vinculo' })
    expect(await lojaAtivaParaEmpresa(admin, vinc, A)).toEqual({ ok: true, lojaId: 'l1' })
  })
  it('multi_empresa sem escolha ⇒ seletor com next', () => {
    const d = middlewareAdminDecision(
      { contract: null, session: null, authState: 'blocked', perfil: 'DONO', source: 'edge', blockedReason: 'multi_empresa' } as never,
      '/gerente/configuracoes',
    )
    expect(d.type).toBe('redirect')
    expect(d.target).toBe('/selecionar-empresa?next=%2Fgerente%2Fconfiguracoes')
  })
})
