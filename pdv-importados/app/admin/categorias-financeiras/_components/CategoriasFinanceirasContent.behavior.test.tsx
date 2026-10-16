/** @vitest-environment jsdom */
/**
 * A tela de categorias financeiras exibia todo o texto fixo em português e o
 * tipo cru do banco (`DESPESA`), mesmo com o operador em chinês.
 */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getMessages } from '@/i18n/getMessages'
import type { Idioma } from '@/idioma/normalizeIdioma'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const alternarAtivoMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))

vi.mock('@/app/gerente/categorias-financeiras/actions', () => ({
  criarCategoriaFinanceira: vi.fn(),
  atualizarCategoriaFinanceira: vi.fn(),
  alternarAtivoCategoriaFinanceira: (...args: unknown[]) => alternarAtivoMock(...args),
}))

const { CategoriasFinanceirasContent } = await import('./CategoriasFinanceirasContent')

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.clearAllMocks()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const ROW = {
  id: '22222222-2222-2222-2222-222222222222',
  nome: 'Aluguel',
  tipo: 'DESPESA' as const,
  ativo: true,
  created_at: '2026-01-01T00:00:00Z',
}

function renderContent(idioma: Idioma, rows: (typeof ROW)[] = [ROW]) {
  act(() => {
    root.render(<CategoriasFinanceirasContent idioma={idioma} dados={{ rows, total: rows.length }} />)
  })
}

describe('CategoriasFinanceirasContent — idioma do operador', () => {
  it.each<Idioma>(['pt', 'zh'])('em %s, tipo, situação e ações usam as mensagens do idioma', (idioma) => {
    const m = getMessages(idioma).categorias_financeiras
    renderContent(idioma)

    const texto = container.textContent ?? ''
    expect(texto).toContain(m.tipo_despesa)
    expect(texto).toContain(m.status_ativa)
    expect(texto).toContain(m.nova_categoria)
    expect(texto).not.toContain('DESPESA')
    expect(container.querySelector(`button[aria-label="${m.editar_categoria} ${ROW.nome}"]`)).not.toBeNull()
    expect(container.querySelector(`button[aria-label="${m.inativar} ${ROW.nome}"]`)).not.toBeNull()
  })

  it('em zh, nenhum rótulo português fixo sobra na tela', () => {
    renderContent('zh')
    const texto = container.textContent ?? ''
    for (const pt of ['Nova', 'Desativar', 'Ativo', 'Ações', 'Categorias (']) {
      expect(texto).not.toContain(pt)
    }
  })

  it('lista vazia mostra o EmptyState traduzido, sem emoji', () => {
    const m = getMessages('zh').categorias_financeiras
    renderContent('zh', [])
    const texto = container.textContent ?? ''
    expect(texto).toContain(m.sem_categorias)
    expect(texto).not.toContain('💰')
  })

  it('inativar continua chamando a action com o novo estado', async () => {
    alternarAtivoMock.mockResolvedValue({ success: true, data: null })
    renderContent('pt')
    const m = getMessages('pt').categorias_financeiras
    const toggle = container.querySelector(
      `button[aria-label="${m.inativar} ${ROW.nome}"]`,
    ) as HTMLButtonElement

    await act(async () => {
      toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })

    expect(alternarAtivoMock).toHaveBeenCalledWith(ROW.id, false)
  })
})
