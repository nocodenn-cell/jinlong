/** @vitest-environment jsdom */
/**
 * Regressão: o "Cadastro rápido" não pode ser um botão morto antes da hidratação.
 * No HTML do servidor ele sai desabilitado; depois da hidratação, habilitado e com o modal funcionando.
 */
import React from 'react'
import { renderToString } from 'react-dom/server'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mensagens } from '@/i18n/getMessages'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/components/gerente/produtos/NovoProdutoModal', () => ({
  NovoProdutoModal: ({ open }: { open: boolean }) => (open ? <div role="dialog">Novo produto</div> : null),
}))

import { CatalogoNovoButton } from './CatalogoNovoButton'

const props = {
  label: 'Cadastro rápido',
  m: {} as Mensagens,
  opcoes: {} as never,
  idioma: 'pt' as never,
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('CatalogoNovoButton — hidratação', () => {
  it('no HTML do servidor o botão nasce desabilitado, sem parecer funcional', () => {
    const html = renderToString(<CatalogoNovoButton {...props} />)
    expect(html).toMatch(/<button[^>]*disabled/)
    expect(html).toContain('aria-busy="true"')
  })

  it('depois da hidratação o botão fica habilitado e abre o modal ao clicar', async () => {
    container.innerHTML = renderToString(<CatalogoNovoButton {...props} />)
    await act(async () => {
      root.render(<CatalogoNovoButton {...props} />)
    })
    const btn = container.querySelector<HTMLButtonElement>('button')!
    expect(btn.disabled).toBe(false)
    expect(btn.getAttribute('aria-busy')).toBe('false')
    await act(async () => {
      btn.click()
    })
    expect(container.querySelector('[role=dialog]')).not.toBeNull()
  })
})
