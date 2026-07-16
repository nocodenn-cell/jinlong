import { describe, expect, it, vi } from 'vitest'
import {
  alternarAtivoProduto,
  criarProdutoComEstoque,
  inativarProdutoCatalogo,
  publicarProdutoCatalogo,
} from '@/core/services/produtoService'
import type { NovoProdutoInput, ProdutoRepositoryPort } from '@/core/ports/produto'

const INPUT: NovoProdutoInput = {
  nome: 'Arroz',
  codigo_barras: null,
  preco_varejo: 10,
  origem: 'china_manual',
  tem_nf: false,
}

function fakeRepo(overrides?: Partial<ProdutoRepositoryPort>): ProdutoRepositoryPort {
  return {
    createWithDefaultEstoque: vi.fn().mockResolvedValue({ ok: true, id: 'produto-1' }),
    updateAtivo: vi.fn().mockResolvedValue({ ok: true }),
    updateStatusPublicacao: vi.fn().mockResolvedValue({ ok: true }),
    ...overrides,
  }
}

describe('produtoService — camada de domínio (repo em memória)', () => {
  describe('criarProdutoComEstoque', () => {
    it('propaga o id ao criar com sucesso', async () => {
      const repo = fakeRepo()
      const r = await criarProdutoComEstoque(INPUT, repo)
      expect(r).toEqual({ success: true, data: { id: 'produto-1' } })
      expect(repo.createWithDefaultEstoque).toHaveBeenCalledWith(INPUT)
    })

    it('propaga a mensagem de erro do repositório sem mascarar', async () => {
      const repo = fakeRepo({
        createWithDefaultEstoque: vi.fn().mockResolvedValue({ ok: false, message: 'Falha no insert' }),
      })
      const r = await criarProdutoComEstoque(INPUT, repo)
      expect(r).toEqual({ success: false, error: 'Falha no insert' })
    })
  })

  describe('alternarAtivoProduto', () => {
    it('sucesso não vaza detalhes do repositório', async () => {
      const repo = fakeRepo()
      const r = await alternarAtivoProduto('produto-1', true, repo)
      expect(r).toEqual({ success: true })
      expect(repo.updateAtivo).toHaveBeenCalledWith('produto-1', true)
    })

    it('propaga falha do repositório', async () => {
      const repo = fakeRepo({
        updateAtivo: vi.fn().mockResolvedValue({ ok: false, message: 'Produto não encontrado' }),
      })
      const r = await alternarAtivoProduto('produto-x', false, repo)
      expect(r).toEqual({ success: false, error: 'Produto não encontrado' })
    })
  })

  describe('publicarProdutoCatalogo / inativarProdutoCatalogo', () => {
    it('publicar delega PUBLICADO ao repositório', async () => {
      const repo = fakeRepo()
      const r = await publicarProdutoCatalogo('produto-1', repo)
      expect(r).toEqual({ success: true })
      expect(repo.updateStatusPublicacao).toHaveBeenCalledWith('produto-1', 'PUBLICADO')
    })

    it('inativar delega INATIVO ao repositório', async () => {
      const repo = fakeRepo()
      const r = await inativarProdutoCatalogo('produto-1', repo)
      expect(r).toEqual({ success: true })
      expect(repo.updateStatusPublicacao).toHaveBeenCalledWith('produto-1', 'INATIVO')
    })

    it('propaga falha do repositório ao publicar', async () => {
      const repo = fakeRepo({
        updateStatusPublicacao: vi.fn().mockResolvedValue({ ok: false, message: 'RLS negou a atualização' }),
      })
      const r = await publicarProdutoCatalogo('produto-1', repo)
      expect(r).toEqual({ success: false, error: 'RLS negou a atualização' })
    })

    it('propaga falha do repositório ao inativar', async () => {
      const repo = fakeRepo({
        updateStatusPublicacao: vi.fn().mockResolvedValue({ ok: false, message: 'RLS negou a atualização' }),
      })
      const r = await inativarProdutoCatalogo('produto-1', repo)
      expect(r).toEqual({ success: false, error: 'RLS negou a atualização' })
    })
  })
})
