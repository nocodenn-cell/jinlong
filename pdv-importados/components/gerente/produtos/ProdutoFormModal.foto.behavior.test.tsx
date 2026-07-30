/** @vitest-environment jsdom */
/**
 * Regressão: trocar a foto NÃO pode ser tratado como "produto salvo".
 *
 * `onImagemChange` era ligado direto em `onSaved`. No catálogo, `onSaved` faz
 * `setEditando(null)` — ou seja, subir uma foto no meio da edição fechava o
 * modal e jogava fora tudo o que o operador tinha digitado e ainda não gravado
 * (preço, categoria, dados fiscais…). A foto tem callback próprio.
 */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getMessages } from '@/i18n/getMessages'
import type { ProdutoGerenteRow } from '@/app/gerente/produtos/produtoGerenteTypes'

const uploadImagemProdutoMock = vi.fn()

vi.mock('@/app/gerente/produtos/actions', () => ({
  atualizarDadosProdutoGerente: vi.fn().mockResolvedValue({ success: true, data: null }),
  criarProduto: vi.fn().mockResolvedValue({ success: true, data: { id: 'p-1' } }),
  uploadImagemProduto: (...args: unknown[]) => uploadImagemProdutoMock(...args),
  removerImagemProduto: vi.fn().mockResolvedValue({ success: true, data: null }),
}))

vi.mock('@/app/gerente/produtos/precosAtacadoActions', () => ({
  criarFaixaAtacado: vi.fn().mockResolvedValue({ success: true, data: null }),
  listarFaixasAtacado: vi.fn().mockResolvedValue({ success: true, data: [] }),
  atualizarFaixaAtacado: vi.fn().mockResolvedValue({ success: true, data: null }),
  inativarFaixaAtacado: vi.fn().mockResolvedValue({ success: true, data: null }),
}))

vi.mock('@/lib/gerente/toast', () => ({ emitGerenteToast: vi.fn() }))

vi.mock('@/app/gerente/produtos/sugestaoCadastroActions', () => ({
  sugerirDadosCadastroPorGtin: vi.fn().mockResolvedValue({ ok: false, error: 'skip' }),
  registrarCadastroProdutoTelemetry: vi.fn().mockResolvedValue({ ok: true }),
}))

import { ProdutosEditarCatalogoModal } from '@/components/gerente/produtos/ProdutosEditarCatalogoModal'

const m = getMessages('pt')
const opcoes = { categorias: [], marcas: [], fornecedores: [] }

const produto = {
  id: 'prod-1',
  nome: 'Caneca Térmica',
  codigo_barras: '7891234567890',
  codigo_interno: null,
  referencia_fornecedor: null,
  nome_reduzido_pdv: null,
  localizacao_prateleira: null,
  preco_varejo: 25,
  preco_atacado: null,
  preco_custo: 10,
  preco_custo_medio: 10,
  estoque_minimo: 1,
  permitir_abaixo_custo: false,
  quantidade_gatilho_atacado: null,
  quantidade_atual: 5,
  origem: 'china_manual',
  tem_nf: false,
  ativo: true,
  status_publicacao: 'PUBLICADO',
  imagem_url: null,
  categoria_id: null,
  marca_id: null,
  fornecedor_id: null,
  unidade_medida: 'UN',
  observacao: null,
  tags: null,
  ncm: null,
  cfop_produto: null,
  csosn: null,
  cest: null,
  cst_pis: null,
  cst_cofins: null,
} as unknown as ProdutoGerenteRow

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  uploadImagemProdutoMock.mockReset()
  uploadImagemProdutoMock.mockResolvedValue({
    success: true,
    data: { imagem_url: 'https://cdn.exemplo/nova.png' },
  })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  Element.prototype.scrollIntoView = vi.fn()
})

afterEach(() => {
  flushSync(() => root.unmount())
  container.remove()
})

function inputFoto(): HTMLInputElement {
  return container.querySelector('input[type="file"]') as HTMLInputElement
}

function subirFoto() {
  const input = inputFoto()
  const file = new File(['x'], 'foto.png', { type: 'image/png' })
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  flushSync(() => input.dispatchEvent(new Event('change', { bubbles: true })))
}

describe('ProdutoFormModal — troca de foto durante a edição', () => {
  it('avisa quem lista sem disparar onSalvo (que fecharia o modal)', async () => {
    const onSalvo = vi.fn()
    const onImagemAtualizada = vi.fn()

    flushSync(() =>
      root.render(
        <ProdutosEditarCatalogoModal
          open
          onOpenChange={vi.fn()}
          produto={produto}
          m={m}
          opcoes={opcoes}
          onSalvo={onSalvo}
          onImagemAtualizada={onImagemAtualizada}
        />,
      ),
    )

    subirFoto()

    await vi.waitFor(() => expect(uploadImagemProdutoMock).toHaveBeenCalled())
    await vi.waitFor(() => expect(onImagemAtualizada).toHaveBeenCalledTimes(1))

    // O contrato que quebrava a edição: foto NÃO é "salvo".
    expect(onSalvo).not.toHaveBeenCalled()
  })

  it('mantém o formulário montado e mostra a foto nova sem reabrir', async () => {
    flushSync(() =>
      root.render(
        <ProdutosEditarCatalogoModal
          open
          onOpenChange={vi.fn()}
          produto={produto}
          m={m}
          opcoes={opcoes}
          onSalvo={vi.fn()}
          onImagemAtualizada={vi.fn()}
        />,
      ),
    )

    subirFoto()
    await vi.waitFor(() => expect(uploadImagemProdutoMock).toHaveBeenCalled())

    // Campos continuam lá (o modal não desmontou) e a miniatura já é a nova.
    await vi.waitFor(() => {
      const img = container.querySelector('img') as HTMLImageElement | null
      expect(img?.getAttribute('src') ?? '').toContain('nova.png')
    })
    expect(container.querySelector('input[data-field="nome"]')).not.toBeNull()
  })
})
