import { describe, expect, it } from 'vitest'
import { resolverContextoEmpresaAtiva } from '@/lib/admin/auth/tenantContext'
import { assertTenantContext } from '@/lib/admin/auth/assertTenantContext'

const E_A = 'ea'
const E_B = 'eb'
const L_A1 = 'la1'
const L_B1 = 'lb1'
const lojas = { [L_A1]: { empresaId: E_A }, [L_B1]: { empresaId: E_B } }

describe('resolverContextoEmpresaAtiva (M2-B F1)', () => {
  it('fail-closed dual sem empresa ativa', () => {
    const r = resolverContextoEmpresaAtiva({
      authUserId: 'u',
      ativo: true,
      lojas,
      vinculos: [
        { empresaId: E_A, lojaId: L_A1, papel: 'GERENTE', ativo: true },
        { empresaId: E_B, lojaId: L_B1, papel: 'GERENTE', ativo: true },
      ],
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('EMPRESA_ATIVA_OBRIGATORIA')
  })

  it('single empresa auto sem persistido', () => {
    const r = resolverContextoEmpresaAtiva({
      authUserId: 'u',
      ativo: true,
      lojas,
      vinculos: [{ empresaId: E_A, lojaId: L_A1, papel: 'OPERADOR', ativo: true }],
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.empresaId).toBe(E_A)
      expect(r.lojaId).toBe(L_A1)
      expect(r.mode).toBe('multiempresa')
    }
  })

  it('nunca aceita empresa do cliente fora do vínculo', () => {
    const r = resolverContextoEmpresaAtiva({
      authUserId: 'u',
      ativo: true,
      lojas,
      vinculos: [{ empresaId: E_A, lojaId: L_A1, papel: 'OPERADOR', ativo: true }],
      solicitado: { empresaId: E_B },
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('EMPRESA_NAO_AUTORIZADA')
  })

  it('request atrasada após troca → EMPRESA_DIVERGENTE', () => {
    const r = assertTenantContext({
      authUserId: 'u',
      ativo: true,
      lojas,
      vinculos: [
        { empresaId: E_A, lojaId: L_A1, papel: 'GERENTE', ativo: true },
        { empresaId: E_B, lojaId: L_B1, papel: 'GERENTE', ativo: true },
      ],
      persistido: { empresaId: E_B, lojaId: L_B1, version: 2 },
      empresaEsperadaOperacao: E_A,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('EMPRESA_DIVERGENTE')
  })

  it('legado sem vínculos usa loja_id', () => {
    const r = resolverContextoEmpresaAtiva({
      authUserId: 'u',
      ativo: true,
      lojas: {},
      vinculos: [],
      legacyLojaId: L_A1,
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.mode).toBe('legacy_single_loja')
      expect(r.lojaId).toBe(L_A1)
    }
  })
})
