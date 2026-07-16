import { describe, expect, it } from 'vitest'
import {
  ativoFromStatusPublicacao,
  dualWriteFromStatus,
  defaultStatusNovoProduto,
  isIntencaoRascunho,
  isStatusRascunho,
  lifecycleAoEditarProduto,
  podePublicarProduto,
  podeSalvarComoRascunho,
  resolveStatusPublicacaoLeitura,
  statusFromAtivoLegacy,
  statusPublicacaoRascunho,
} from '@/core/catalog/statusPublicacao'

describe('statusPublicacao — fonte única da verdade do lifecycle', () => {
  it('ativoFromStatusPublicacao: só PUBLICADO é ativo', () => {
    expect(ativoFromStatusPublicacao('PUBLICADO')).toBe(true)
    expect(ativoFromStatusPublicacao('DRAFT')).toBe(false)
    expect(ativoFromStatusPublicacao('INATIVO')).toBe(false)
  })

  it('statusFromAtivoLegacy: mapeia legado ativo boolean → status', () => {
    expect(statusFromAtivoLegacy(true)).toBe('PUBLICADO')
    expect(statusFromAtivoLegacy(false)).toBe('INATIVO')
  })

  it('dualWriteFromStatus: escreve status + ativo em conjunto', () => {
    expect(dualWriteFromStatus('PUBLICADO')).toEqual({ status_publicacao: 'PUBLICADO', ativo: true })
    expect(dualWriteFromStatus('DRAFT')).toEqual({ status_publicacao: 'DRAFT', ativo: false })
    expect(dualWriteFromStatus('INATIVO')).toEqual({ status_publicacao: 'INATIVO', ativo: false })
  })

  it('resolveStatusPublicacaoLeitura: leitura pessimista — ausente/inválido → INATIVO', () => {
    expect(resolveStatusPublicacaoLeitura('PUBLICADO')).toBe('PUBLICADO')
    expect(resolveStatusPublicacaoLeitura(null)).toBe('INATIVO')
    expect(resolveStatusPublicacaoLeitura(undefined)).toBe('INATIVO')
  })

  it('isStatusRascunho / podePublicarProduto: só DRAFT é publicável', () => {
    expect(isStatusRascunho('DRAFT')).toBe(true)
    expect(isStatusRascunho('PUBLICADO')).toBe(false)
    expect(isStatusRascunho('INATIVO')).toBe(false)
    expect(isStatusRascunho(null)).toBe(false)
    expect(podePublicarProduto('DRAFT')).toBe(true)
    expect(podePublicarProduto('PUBLICADO')).toBe(false)
  })

  it('podeSalvarComoRascunho: criação sempre permite; edição só enquanto DRAFT', () => {
    expect(podeSalvarComoRascunho(false, 'PUBLICADO')).toBe(true) // criando
    expect(podeSalvarComoRascunho(true, 'DRAFT')).toBe(true)
    expect(podeSalvarComoRascunho(true, 'PUBLICADO')).toBe(false)
    expect(podeSalvarComoRascunho(true, 'INATIVO')).toBe(false)
  })

  it('isIntencaoRascunho: só o literal DRAFT em dados brutos conta como intenção', () => {
    expect(isIntencaoRascunho('DRAFT')).toBe(true)
    expect(isIntencaoRascunho('PUBLICADO')).toBe(false)
    expect(isIntencaoRascunho(undefined)).toBe(false)
    expect(isIntencaoRascunho('draft')).toBe(false)
  })

  it('statusPublicacaoRascunho: retorna o literal DRAFT', () => {
    expect(statusPublicacaoRascunho()).toBe('DRAFT')
  })

  it('defaultStatusNovoProduto: novo cadastro sem override → DRAFT', () => {
    expect(defaultStatusNovoProduto({})).toEqual({ status_publicacao: 'DRAFT', ativo: false })
    expect(defaultStatusNovoProduto({ ativo: true })).toEqual({ status_publicacao: 'PUBLICADO', ativo: true })
    expect(defaultStatusNovoProduto({ status_publicacao: 'INATIVO' })).toEqual({
      status_publicacao: 'INATIVO',
      ativo: false,
    })
  })

  describe('lifecycleAoEditarProduto — transição ao salvar edição', () => {
    it('salvar como rascunho (intenção explícita) → sempre DRAFT, independente do status atual', () => {
      expect(lifecycleAoEditarProduto(true, 'PUBLICADO')).toEqual({ status_publicacao: 'DRAFT', ativo: false })
      expect(lifecycleAoEditarProduto(true, 'INATIVO')).toEqual({ status_publicacao: 'DRAFT', ativo: false })
      expect(lifecycleAoEditarProduto(true, null)).toEqual({ status_publicacao: 'DRAFT', ativo: false })
    })

    it('editar um rascunho sem marcar como rascunho → publica implicitamente', () => {
      expect(lifecycleAoEditarProduto(false, 'DRAFT')).toEqual({ status_publicacao: 'PUBLICADO', ativo: true })
    })

    it('editar um produto INATIVO → preserva (não republica via edição)', () => {
      expect(lifecycleAoEditarProduto(false, 'INATIVO')).toBeNull()
    })

    it('editar um produto já PUBLICADO → mantém PUBLICADO', () => {
      expect(lifecycleAoEditarProduto(false, 'PUBLICADO')).toEqual({ status_publicacao: 'PUBLICADO', ativo: true })
    })

    it('status atual desconhecido (null) sem marcar rascunho → trata como publicável', () => {
      expect(lifecycleAoEditarProduto(false, null)).toEqual({ status_publicacao: 'PUBLICADO', ativo: true })
    })
  })
})
