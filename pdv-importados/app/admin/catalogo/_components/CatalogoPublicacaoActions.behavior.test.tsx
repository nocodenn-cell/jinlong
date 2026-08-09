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
const emitGerenteToastMock = vi.fn()

vi.mock('@/app/gerente/produtos/actions', () => ({
  publicarProduto: (...args: unknown[]) => publicarProdutoMock(...args),
  inativarProduto: (...args: unknown[]) => inativarProdutoMock(...args),
  reativarProduto: (...args: unknown[]) => reativarProdutoMock(...args),
}))

vi.mock('@/lib/gerente/toast', () => ({
  emitGerenteToast: (...args: unknown[]) => emitGerenteToastMock(...args),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: routerRefreshMock }),
}))

import { CatalogoPublicacaoActions } from '@/app/admin/catalogo/_components/CatalogoPublicacaoActions'

const LABELS = {
  publicar: 'Publicar',
  inativar: 'Inativar',
  reativar: 'Reativar',
  confirmarTitulo: 'Inativar produto',
  confirmarTexto: 'O produto "{{nome}}" será inativado.',
  confirmar: 'Confirmar',
  cancelar: 'Cancelar',
  fechar: 'Fechar',
}
const ERRO_GENERICO = 'Ocorreu um erro'

let container: HTMLDivElement
let root: Root

function render(ui: React.ReactElement) {
  act(() => {
    root.render(ui)
  })
}

function props(status: 'DRAFT' | 'PUBLICADO' | 'INATIVO') {
  return {
    produtoId: 'p1',
    produtoNome: 'Cabo USB',
    status,
    labels: LABELS,
    erroGenerico: ERRO_GENERICO,
  } as const
}

beforeEach(() => {
  publicarProdutoMock.mockReset()
  inativarProdutoMock.mockReset()
  reativarProdutoMock.mockReset()
  routerRefreshMock.mockReset()
  emitGerenteToastMock.mockReset()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('CatalogoPublicacaoActions', () => {
  it('rascunho mostra botão Publicar; publicado mostra controle Inativar (ícone)', () => {
    render(<CatalogoPublicacaoActions {...props('DRAFT')} />)
    expect(container.textContent).toContain('Publicar')

    render(<CatalogoPublicacaoActions {...props('PUBLICADO')} />)
    const inativar = container.querySelector('button[aria-label="Inativar"]')
    expect(inativar).toBeTruthy()
    expect(container.textContent).not.toContain('Publicar')
  })

  it('INATIVO oferece Reativar, nunca Publicar (podePublicarProduto só libera rascunho)', async () => {
    reativarProdutoMock.mockResolvedValue({ success: true, data: null })
    render(<CatalogoPublicacaoActions {...props('INATIVO')} />)
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
    render(<CatalogoPublicacaoActions {...props('DRAFT')} />)
    const btn = container.querySelector('button') as HTMLButtonElement
    await act(async () => {
      btn.click()
    })
    expect(routerRefreshMock).toHaveBeenCalledTimes(1)
    expect(emitGerenteToastMock).not.toHaveBeenCalled()
  })

  it('falha do servidor: mostra toast de erro em vez de falhar silenciosamente (regressão)', async () => {
    publicarProdutoMock.mockResolvedValue({ success: false, error: 'RLS negou a operação.' })
    render(<CatalogoPublicacaoActions {...props('DRAFT')} />)
    const btn = container.querySelector('button') as HTMLButtonElement
    await act(async () => {
      btn.click()
    })
    expect(routerRefreshMock).not.toHaveBeenCalled()
    expect(emitGerenteToastMock).toHaveBeenCalledWith({
      kind: 'error',
      message: 'RLS negou a operação.',
    })
  })

  it('Inativar exige confirmação antes de chamar a action', async () => {
    inativarProdutoMock.mockResolvedValue({ success: true, data: null })
    render(<CatalogoPublicacaoActions {...props('PUBLICADO')} />)

    const trigger = container.querySelector('button[aria-label="Inativar"]') as HTMLButtonElement
    await act(async () => {
      trigger.click()
    })
    expect(inativarProdutoMock).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Inativar produto')
    expect(container.textContent).toContain('Cabo USB')

    const confirmar = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Confirmar'),
    ) as HTMLButtonElement
    await act(async () => {
      confirmar.click()
    })
    expect(inativarProdutoMock).toHaveBeenCalledWith('p1')
  })

  it('falha sem mensagem do servidor: recorre ao erro genérico', async () => {
    inativarProdutoMock.mockResolvedValue({ success: false, error: '' })
    render(<CatalogoPublicacaoActions {...props('PUBLICADO')} />)

    const trigger = container.querySelector('button[aria-label="Inativar"]') as HTMLButtonElement
    await act(async () => {
      trigger.click()
    })
    const confirmar = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Confirmar'),
    ) as HTMLButtonElement
    await act(async () => {
      confirmar.click()
    })
    expect(emitGerenteToastMock).toHaveBeenCalledWith({
      kind: 'error',
      message: ERRO_GENERICO,
    })
  })
})
