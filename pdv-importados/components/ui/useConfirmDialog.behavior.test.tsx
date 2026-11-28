/** @vitest-environment jsdom */
import React, { useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { inferirIdiomaConfirmacao, useConfirmDialog } from './useConfirmDialog'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  flushSync(() => root.unmount())
  container.remove()
  document.body.style.overflow = ''
})

function render(ui: React.ReactElement) {
  flushSync(() => root.render(ui))
}

/** Espera microtasks (resolução da promessa) e o re-render. */
async function tick() {
  await new Promise((r) => setTimeout(r, 0))
}

function clicar(el: Element | null) {
  if (!el) throw new Error('elemento não encontrado')
  flushSync(() => (el as HTMLElement).click())
}

function botaoComTexto(texto: string): HTMLButtonElement | null {
  return Array.from(document.querySelectorAll('button')).find((b) => b.textContent === texto) ?? null
}

function Harness({ titulo, onAcao }: { titulo: string; onAcao: () => void }) {
  const { confirmar, avisar, dialogo } = useConfirmDialog()
  const [resultado, setResultado] = useState('')
  return (
    <div>
      <button
        type="button"
        onClick={async () => {
          const ok = await confirmar({ titulo })
          setResultado(ok ? 'sim' : 'nao')
          if (ok) onAcao()
        }}
      >
        excluir
      </button>
      <button type="button" onClick={() => void avisar({ titulo: 'Falhou' })}>
        avisar
      </button>
      <output data-testid="resultado">{resultado}</output>
      {dialogo}
    </div>
  )
}

const resultado = () => document.querySelector('[data-testid="resultado"]')?.textContent

describe('useConfirmDialog', () => {
  it('não usa window.confirm e só executa a ação após confirmar no diálogo', async () => {
    const nativo = vi.fn()
    vi.stubGlobal('confirm', nativo)
    const acao = vi.fn()
    render(<Harness titulo="Excluir esta regra?" onAcao={acao} />)

    clicar(botaoComTexto('excluir'))
    expect(document.querySelector('[data-testid="confirm-dialog"]')).not.toBeNull()
    expect(document.body.textContent).toContain('Excluir esta regra?')
    expect(acao).not.toHaveBeenCalled()

    clicar(document.querySelector('[data-testid="confirm-dialog-confirmar"]'))
    await tick()
    expect(resultado()).toBe('sim')
    expect(acao).toHaveBeenCalledTimes(1)
    expect(document.querySelector('[data-testid="confirm-dialog"]')).toBeNull()
    expect(nativo).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('Cancelar resolve false e não executa a ação', async () => {
    const acao = vi.fn()
    render(<Harness titulo="Excluir?" onAcao={acao} />)
    clicar(botaoComTexto('excluir'))
    clicar(botaoComTexto('Cancelar'))
    await tick()
    expect(resultado()).toBe('nao')
    expect(acao).not.toHaveBeenCalled()
  })

  it('Escape cancela (mesma regra do DragonModal)', async () => {
    const acao = vi.fn()
    render(<Harness titulo="Excluir?" onAcao={acao} />)
    clicar(botaoComTexto('excluir'))
    flushSync(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
    await tick()
    expect(resultado()).toBe('nao')
    expect(acao).not.toHaveBeenCalled()
  })

  it('ação perigosa usa o botão danger do Design System', () => {
    render(<Harness titulo="Excluir?" onAcao={() => {}} />)
    clicar(botaoComTexto('excluir'))
    const confirmar = document.querySelector('[data-testid="confirm-dialog-confirmar"]')
    expect(confirmar?.className).toContain('fp-btn--danger')
  })

  it('botões em chinês quando o texto do chamador está em chinês', () => {
    render(<Harness titulo="确定删除该规则吗？" onAcao={() => {}} />)
    clicar(botaoComTexto('excluir'))
    expect(botaoComTexto('取消')).not.toBeNull()
    expect(botaoComTexto('确认')).not.toBeNull()
  })

  it('aviso substitui window.alert', () => {
    const nativo = vi.fn()
    vi.stubGlobal('alert', nativo)
    render(<Harness titulo="x" onAcao={() => {}} />)
    clicar(botaoComTexto('avisar'))
    expect(document.querySelector('[data-testid="aviso-dialog"]')).not.toBeNull()
    clicar(botaoComTexto('Entendi'))
    expect(document.querySelector('[data-testid="aviso-dialog"]')).toBeNull()
    expect(nativo).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('inferirIdiomaConfirmacao', () => {
    expect(inferirIdiomaConfirmacao('Excluir?')).toBe('pt')
    expect(inferirIdiomaConfirmacao('删除？')).toBe('zh')
    expect(inferirIdiomaConfirmacao(undefined, 'Remover')).toBe('pt')
  })
})
