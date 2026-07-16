/** @vitest-environment jsdom */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useProdutoForm } from '@/components/gerente/produtos/form/useProdutoForm'
import type { ProdutoGerenteRow } from '@/app/gerente/produtos/produtoGerenteTypes'

const base = {
  id: 'p-1',
  nome: 'Tênis Runner Azul 42',
  codigo_interno: 'SKU-001',
  codigo_barras: '7890000000001',
  origem: 'china_manual',
  unidade_medida: 'UN',
  categoria_id: 'cat-1',
  marca_id: 'marca-1',
  fornecedor_id: 'forn-1',
  preco_varejo: 199.9,
  preco_atacado: 149.9,
  preco_custo: 90,
  permitir_abaixo_custo: false,
  quantidade_gatilho_atacado: 6,
  status_publicacao: 'PUBLICADO',
} as unknown as ProdutoGerenteRow

let container: HTMLDivElement
let root: Root
let api: ReturnType<typeof useProdutoForm> | null = null

function Harness() {
  // produto=null (criação) + duplicarDe=base → semeia como novo cadastro
  api = useProdutoForm(true, null, base)
  return null
}

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  // act flushes the mount effect AND the state updates it schedules (hydração)
  act(() => {
    root.render(<Harness />)
  })
})

afterEach(() => {
  flushSync(() => root.unmount())
  container.remove()
  api = null
})

describe('useProdutoForm — Duplicar para criar', () => {
  it('carrega os campos do produto base mas limpa código de barras e SKU', () => {
    // Campos que se repetem entre variantes → carregados:
    expect(api!.nome).toBe('Tênis Runner Azul 42')
    expect(api!.categoriaId).toBe('cat-1')
    expect(api!.marcaId).toBe('marca-1')
    expect(api!.fornecedorId).toBe('forn-1')
    expect(api!.precoVarejoInput.parse()).toBe(199.9)

    // Únicos por item → limpos, para não duplicar código de barras/SKU:
    expect(api!.codigoBarras).toBe('')
    expect(api!.codigoInterno).toBe('')

    // readOnly.produtoId null → tratado como CRIAÇÃO (não edição):
    expect(api!.readOnly.produtoId).toBeNull()
  })
})
