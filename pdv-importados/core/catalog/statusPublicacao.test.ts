import { describe, expect, it } from 'vitest'
import {
  ativoFromStatusPublicacao,
  defaultStatusNovoProduto,
  dualWriteFromStatus,
  isVendavelPdv,
  resolveStatusPublicacaoLeitura,
  statusFromAtivoLegacy,
} from './statusPublicacao'

describe('ativoFromStatusPublicacao', () => {
  it('returns true for PUBLICADO', () => {
    expect(ativoFromStatusPublicacao('PUBLICADO')).toBe(true)
  })

  it('returns false for DRAFT', () => {
    expect(ativoFromStatusPublicacao('DRAFT')).toBe(false)
  })

  it('returns false for INATIVO', () => {
    expect(ativoFromStatusPublicacao('INATIVO')).toBe(false)
  })
})

describe('statusFromAtivoLegacy', () => {
  it('maps true to PUBLICADO', () => {
    expect(statusFromAtivoLegacy(true)).toBe('PUBLICADO')
  })

  it('maps false to INATIVO', () => {
    expect(statusFromAtivoLegacy(false)).toBe('INATIVO')
  })
})

describe('defaultStatusNovoProduto', () => {
  it('uses explicit status_publicacao when provided', () => {
    expect(defaultStatusNovoProduto({ status_publicacao: 'PUBLICADO' })).toEqual({
      status_publicacao: 'PUBLICADO',
      ativo: true,
    })
  })

  it('infers PUBLICADO from ativo=true when no status given', () => {
    expect(defaultStatusNovoProduto({ ativo: true })).toEqual({
      status_publicacao: 'PUBLICADO',
      ativo: true,
    })
  })

  it('infers DRAFT from ativo=false', () => {
    expect(defaultStatusNovoProduto({ ativo: false })).toEqual({
      status_publicacao: 'DRAFT',
      ativo: false,
    })
  })

  it('defaults to DRAFT when nothing provided', () => {
    expect(defaultStatusNovoProduto({})).toEqual({
      status_publicacao: 'DRAFT',
      ativo: false,
    })
  })
})

describe('dualWriteFromStatus', () => {
  it('returns matching ativo for PUBLICADO', () => {
    expect(dualWriteFromStatus('PUBLICADO')).toEqual({
      status_publicacao: 'PUBLICADO',
      ativo: true,
    })
  })

  it('returns ativo=false for INATIVO', () => {
    expect(dualWriteFromStatus('INATIVO')).toEqual({
      status_publicacao: 'INATIVO',
      ativo: false,
    })
  })
})

describe('resolveStatusPublicacaoLeitura', () => {
  it('returns known status as-is', () => {
    expect(resolveStatusPublicacaoLeitura('DRAFT')).toBe('DRAFT')
    expect(resolveStatusPublicacaoLeitura('PUBLICADO')).toBe('PUBLICADO')
    expect(resolveStatusPublicacaoLeitura('INATIVO')).toBe('INATIVO')
  })

  it('falls back to INATIVO for null', () => {
    expect(resolveStatusPublicacaoLeitura(null)).toBe('INATIVO')
  })

  it('falls back to INATIVO for undefined', () => {
    expect(resolveStatusPublicacaoLeitura(undefined)).toBe('INATIVO')
  })
})

describe('isVendavelPdv', () => {
  it('returns true for PUBLICADO + ativo', () => {
    expect(isVendavelPdv('PUBLICADO', true)).toBe(true)
  })

  it('returns false for DRAFT + ativo', () => {
    expect(isVendavelPdv('DRAFT', true)).toBe(false)
  })

  it('returns false for PUBLICADO + not ativo', () => {
    expect(isVendavelPdv('PUBLICADO', false)).toBe(false)
  })

  it('returns false for null status', () => {
    expect(isVendavelPdv(null, true)).toBe(false)
  })
})
