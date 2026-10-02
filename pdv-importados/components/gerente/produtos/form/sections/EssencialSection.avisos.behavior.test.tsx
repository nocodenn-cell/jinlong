/** @vitest-environment jsdom */
/** UX-020 — avisos não bloqueantes no cadastro de produto: EAN com DV errado e nome já cadastrado. */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getMessages } from '@/i18n/getMessages'

const buscarMock = vi.fn()

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const { EssencialSection } = await import('./EssencialSection')
const { ProdutoFormProvider } = await import('../ProdutoFormContext')
const m = getMessages('pt')

let container: HTMLDivElement
let root: Root
beforeEach(() => {
  buscarMock.mockReset()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function ctx(over: Record<string, unknown>) {
  return {
    m,
    produto: null,
    disabled: false,
    erro: null,
    inputClassName: '',
    inputMonoClassName: '',
    selectClassName: '',
    codigoBarras: '',
    nome: '',
    unidadeMedida: 'UN',
    setCodigoBarras: () => {},
    setNome: () => {},
    setUnidadeMedida: () => {},
    buscarNomesSimilares: (...a: unknown[]) => buscarMock(...a),
    ...over,
  } as never
}

function render(over: Record<string, unknown>) {
  act(() =>
    root.render(
      <ProdutoFormProvider value={ctx(over)}>
        <EssencialSection />
      </ProdutoFormProvider>,
    ),
  )
}

describe('EssencialSection — avisos (UX-020)', () => {
  it('EAN-13 com DV errado mostra aviso; EAN válido e código interno não', () => {
    render({ codigoBarras: '7891000100104' })
    expect(document.querySelector('[data-testid="aviso-ean"]')).toBeTruthy()
    render({ codigoBarras: '7891000100103' })
    expect(document.querySelector('[data-testid="aviso-ean"]')).toBeNull()
    render({ codigoBarras: 'camisa branca' })
    expect(document.querySelector('[data-testid="aviso-ean"]')).toBeNull()
  })

  it('ao sair do campo nome, avisa se já existe produto com o mesmo nome (e ignora o próprio produto)', async () => {
    buscarMock.mockResolvedValue([{ id: 'outro', nome: 'Caneta Azul' }])
    render({ nome: 'caneta azul' })
    const nome = document.querySelector('input[data-field="nome"]') as HTMLInputElement
    await act(async () => {
      nome.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(document.querySelector('[data-testid="aviso-nome-duplicado"]')).toBeTruthy()

    // editando o próprio produto: não é duplicidade
    buscarMock.mockResolvedValue([{ id: 'eu', nome: 'Caneta Azul' }])
    render({ nome: 'caneta azul', produto: { id: 'eu' } })
    const nome2 = document.querySelector('input[data-field="nome"]') as HTMLInputElement
    await act(async () => {
      nome2.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(document.querySelector('[data-testid="aviso-nome-duplicado"]')).toBeNull()
  })
})
