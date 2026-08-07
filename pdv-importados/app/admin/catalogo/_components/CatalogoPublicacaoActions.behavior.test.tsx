/** @vitest-environment jsdom */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Habilita o modo act() do React para flush determinístico de efeitos/estado.
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const publicarProdutoMock = vi.fn()
const inativarProdutoMock = vi.fn()
const reativarProdutoMock = vi.fn()
const routerRefreshMock = vi.fn()
const emitToastMock = vi.fn()

vi.mock('@/app/gerente/produtos/actions', () => ({
  publicarProduto: (...args: unknown[]) => publicarProdutoMock(...args),
  inativarProduto: (...args: unknown[]) => inativarProdutoMock(...args),
  reativarProduto: (...args: unknown[]) => reativarProdutoMock(...args),
}))

vi.mock('@/lib/gerente/toast', () => ({
  emitToast: (...args: unknown[]) => emitToastMock(...args),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: routerRefreshMock }),
}))

import { CatalogoPublicacaoActions } from '@/app/admin/catalogo/_components/CatalogoPublicacaoActions'

const LABELS = { publicar: 'Publicar', inativar: 'Inativar', reativar: 'Reativar' }
const ERRO_GENERICO = 'Ocorreu um erro'

let container: HTMLDivElement
let root: Root

function render(ui: React.ReactElement) {
  act(() => {
    root.render(ui)
  })
}

beforeEach(() => {
  publicarProdutoMock.mockReset()
  inativarProdutoMock.mockReset()
  reativarProdutoMock.mockReset()
  routerRefreshMock.mockReset()
  emitToastMock.mockReset()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('CatalogoPublicacaoActions', () => {
  it('rascunho mostra botão Publicar; publicado mostra Inativar (via predicado do core, não literal)', () => {
    render(
      <CatalogoPublicacaoActions
        produtoId="p1"
        status="DRAFT"
        labels={LABELS}
        erroGenerico={ERRO_GENERICO}
      />,
    )
    expect(container.textContent).toContain('Publicar')

    render(
      <CatalogoPublicacaoActions
        produtoId="p1"
        status="PUBLICADO"
        labels={LABELS}
        erroGenerico={ERRO_GENERICO}
      />,
    )
    expect(container.textContent).toContain('Inativar')
  })

  it('INATIVO oferece Reativar, nunca Publicar (podePublicarProduto só libera rascunho)', async () => {
    // Regressão da decisão registrada em
    // Jinlong/decisoes/CATALOGO_CATEGORIA_INATIVA_E_PUBLICAR.md: a UI decidia por
    // `ativoFromStatusPublicacao`, então oferecia "Publicar" para produto inativo
    // — contra a regra declarada no core.
    reativarProdutoMock.mockResolvedValue({ success: true, data: null })
    render(
      <CatalogoPublicacaoActions
        produtoId="p1"
        status="INATIVO"
        labels={LABELS}
        erroGenerico={ERRO_GENERICO}
      />,
    )
    expect(container.textContent).toContain('Reativar')
    expect(container.textContent).not.toContain('Publicar')

    const btn = container.querySelector('button') as HTMLButtonElement
    await act(async () => {
      btn.click()
    })
    expect(reativarProdutoMock).toHaveBeenCalledWith('p1')
    expect(publicarProdutoMock).not.toHaveBeenCalled()
  })

  it('sucesso: chama router.refresh() e não emite toast de erro', async () => {
    publicarProdutoMock.mockResolvedValue({ success: true, data: null })
    render(
      <CatalogoPublicacaoActions
        produtoId="p1"
        status="DRAFT"
        labels={LABELS}
        erroGenerico={ERRO_GENERICO}
      />,
    )
    const btn = container.querySelector('button') as HTMLButtonElement
    await act(async () => {
      btn.click()
    })
    expect(routerRefreshMock).toHaveBeenCalledTimes(1)
    expect(emitToastMock).not.toHaveBeenCalled()
  })

  it('falha do servidor: mostra toast de erro em vez de falhar silenciosamente (regressão)', async () => {
    publicarProdutoMock.mockResolvedValue({ success: false, error: 'RLS negou a operação.' })
    render(
      <CatalogoPublicacaoActions
        produtoId="p1"
        status="DRAFT"
        labels={LABELS}
        erroGenerico={ERRO_GENERICO}
      />,
    )
    const btn = container.querySelector('button') as HTMLButtonElement
    await act(async () => {
      btn.click()
    })
    expect(routerRefreshMock).not.toHaveBeenCalled()
    expect(emitToastMock).toHaveBeenCalledWith({
      kind: 'error',
      message: 'RLS negou a operação.',
    })
  })

  it('falha sem mensagem do servidor: recorre ao erro genérico', async () => {
    inativarProdutoMock.mockResolvedValue({ success: false, error: '' })
    render(
      <CatalogoPublicacaoActions
        produtoId="p1"
        status="PUBLICADO"
        labels={LABELS}
        erroGenerico={ERRO_GENERICO}
      />,
    )
    const btn = container.querySelector('button') as HTMLButtonElement
    await act(async () => {
      btn.click()
    })
    expect(emitToastMock).toHaveBeenCalledWith({
      kind: 'error',
      message: ERRO_GENERICO,
    })
  })
})
