/** @vitest-environment jsdom */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useProdutoForm } from '@/components/gerente/produtos/form/useProdutoForm'

let container: HTMLDivElement
let root: Root
let api: ReturnType<typeof useProdutoForm> | null = null

function Harness() {
  api = useProdutoForm(true, null)
  return null
}

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  flushSync(() => root.render(<Harness />))
})

afterEach(() => {
  flushSync(() => root.unmount())
  container.remove()
  api = null
})

describe('useProdutoForm — limparParaNovoCadastro (Salvar e continuar)', () => {
  it('preserva o contexto repetido (categoria/marca/fornecedor/origem) e limpa o específico', () => {
    flushSync(() => {
      api!.setCategoriaId('cat-1')
      api!.setMarcaId('marca-1')
      api!.setFornecedorId('forn-1')
      api!.setOrigem('brasil_nf')
      api!.setNome('Camiseta Preta P')
      api!.setCodigoBarras('7890000000001')
    })
    expect(api!.categoriaId).toBe('cat-1')
    expect(api!.nome).toBe('Camiseta Preta P')

    flushSync(() => {
      api!.limparParaNovoCadastro()
    })

    // Contexto preservado para o próximo item do mesmo lote:
    expect(api!.categoriaId).toBe('cat-1')
    expect(api!.marcaId).toBe('marca-1')
    expect(api!.fornecedorId).toBe('forn-1')
    expect(api!.origem).toBe('brasil_nf')
    // Específico do item, limpo:
    expect(api!.nome).toBe('')
    expect(api!.codigoBarras).toBe('')
  })
})
