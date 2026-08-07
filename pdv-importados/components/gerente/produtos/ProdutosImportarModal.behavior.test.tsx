/** @vitest-environment jsdom */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getMessages } from '@/i18n/getMessages'

// Habilita o modo act() do React para flush determinístico de efeitos/estado.
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const importarLoteMock = vi.fn()

vi.mock('@/app/gerente/produtos/actions', () => ({
  importarProdutosLote: (...args: unknown[]) => importarLoteMock(...args),
}))

vi.mock('@/lib/gerente/toast', () => ({
  emitToast: vi.fn(),
}))

import { ProdutosImportarModal } from '@/components/gerente/produtos/ProdutosImportarModal'

const m = getMessages('pt')

let container: HTMLDivElement
let root: Root

function setInput(el: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  act(() => {
    setter?.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

function textInputs(): HTMLInputElement[] {
  return Array.from(container.querySelectorAll<HTMLInputElement>('tbody tr input[type=text]'))
}

function commitButton(): HTMLButtonElement {
  const prefixes = [
    m.produtos.bulk_commit_zero.split(' ')[0] ?? 'Salvar',
    m.produtos.bulk_commit_bloqueado.split(' ')[0] ?? 'Corrija',
    (m.produtos.bulk_commit.split(' ')[0] ?? 'Salvar'),
  ]
  const btn = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find((b) => {
    const text = b.textContent ?? ''
    return prefixes.some((prefix) => text.includes(prefix))
  })
  if (!btn) {
    throw new Error('Commit button not found')
  }
  return btn
}

// Colunas visíveis (sem atualização por id): nome, codigo, preco_varejo, atacado, gatilho, unidade, obs, origem, tem_nf, ativo
const COL = { nome: 0, preco_varejo: 2, origem: 7, ativo: 9 }

function preencherLinhaValida(): void {
  const inputs = textInputs()
  setInput(inputs[COL.nome], 'Arroz')
  setInput(inputs[COL.preco_varejo], '12,50')
  setInput(inputs[COL.origem], 'china_manual')
  setInput(inputs[COL.ativo], '1')
}

function render(ui: React.ReactElement) {
  act(() => {
    root.render(ui)
  })
}

beforeEach(() => {
  importarLoteMock.mockReset()
  importarLoteMock.mockResolvedValue({ success: true, criados: 1, atualizados: 0, falhas: [] })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('ProdutosImportarModal — grade de importação em lote', () => {
  it('começa com commit bloqueado (sem linhas válidas)', () => {
    render(<ProdutosImportarModal open onOpenChange={vi.fn()} m={m} />)
    expect(container.textContent).toContain(m.produtos.bulk_titulo)
    expect(commitButton().disabled).toBe(true)
  })

  it('valida em tempo real: linha válida habilita o commit', () => {
    render(<ProdutosImportarModal open onOpenChange={vi.fn()} m={m} />)
    preencherLinhaValida()
    expect(commitButton().disabled).toBe(false)
    expect(commitButton().textContent).toContain('1')
  })

  it('bloqueia o commit e mostra erro inline quando o preço está vazio', () => {
    render(<ProdutosImportarModal open onOpenChange={vi.fn()} m={m} />)
    const inputs = textInputs()
    setInput(inputs[COL.nome], 'Arroz')
    setInput(inputs[COL.origem], 'china_manual')
    setInput(inputs[COL.ativo], '1')
    expect(commitButton().disabled).toBe(true)
    expect(container.textContent).toContain(m.produtos.import_row_preco_empty)
  })

  it('commit chama a server action e fecha ao ter sucesso', async () => {
    const onOpenChange = vi.fn()
    const onImportComplete = vi.fn()
    render(
      <ProdutosImportarModal
        open
        onOpenChange={onOpenChange}
        m={m}
        onImportComplete={onImportComplete}
      />,
    )
    preencherLinhaValida()

    await act(async () => {
      commitButton().click()
    })

    expect(importarLoteMock).toHaveBeenCalledTimes(1)
    const [linhas, atualizarPorId] = importarLoteMock.mock.calls[0]
    expect(Array.isArray(linhas)).toBe(true)
    expect(linhas).toHaveLength(1)
    expect(linhas[0].nome).toBe('Arroz')
    expect(atualizarPorId).toBe(false)
    expect(onImportComplete).toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('mapeia falhas do servidor de volta para a linha e mostra o erro', async () => {
    importarLoteMock.mockResolvedValue({
      success: true,
      criados: 0,
      atualizados: 0,
      falhas: [{ linha: 1, motivo: m.produtos.import_row_barcode_exists }],
    })
    render(<ProdutosImportarModal open onOpenChange={vi.fn()} m={m} />)
    preencherLinhaValida()

    await act(async () => {
      commitButton().click()
    })

    expect(container.textContent).toContain(m.produtos.import_row_barcode_exists)
  })
})
