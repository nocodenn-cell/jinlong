/** @vitest-environment jsdom */
/**
 * Roadmap UX, Tarefa 5 — contrato de diálogos empilhados (gaveta de detalhe + modal de ação).
 * O modal de cima é renderizado DENTRO da gaveta, e a gaveta fica `dismissable={false}`
 * enquanto ele está aberto: assim só o de cima responde a ESC e o Tab fica nele. Ao fechar o
 * de cima, a gaveta volta a fechar com ESC.
 */
import React, { useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DragonModal } from '@/components/ui/DragonModal'

let container: HTMLDivElement
let root: Root

const fecharGaveta = vi.fn()
const fecharModal = vi.fn()

beforeEach(() => {
  fecharGaveta.mockClear()
  fecharModal.mockClear()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  flushSync(() => root.unmount())
  container.remove()
  document.body.style.overflow = ''
})

function Pilha({ inicial = true }: { inicial?: boolean }) {
  const [modal, setModal] = useState(inicial)
  return (
    <DragonModal
      open
      placement="drawer"
      title="Gaveta"
      onClose={fecharGaveta}
      dismissable={!modal}
      footer={<button type="button">Ação da gaveta</button>}
    >
      <button type="button" onClick={() => setModal(true)}>
        abrir modal
      </button>
      <DragonModal
        open={modal}
        title="Confirmar"
        onClose={() => {
          fecharModal()
          setModal(false)
        }}
        footer={
          <>
            <button type="button">Não</button>
            <button type="button">Sim</button>
          </>
        }
      >
        tem certeza?
      </DragonModal>
    </DragonModal>
  )
}

const esc = () =>
  flushSync(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
  })

describe('DragonModal — diálogos empilhados', () => {
  it('ESC fecha só o diálogo de cima; o seguinte fecha a gaveta', () => {
    flushSync(() => root.render(<Pilha />))
    esc()
    expect(fecharModal).toHaveBeenCalledTimes(1)
    expect(fecharGaveta).not.toHaveBeenCalled()
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1)
    esc()
    expect(fecharGaveta).toHaveBeenCalledTimes(1)
  })

  it('o Tab fica preso no diálogo de cima (a gaveta não puxa o foco)', () => {
    flushSync(() => root.render(<Pilha />))
    const modal = Array.from(document.querySelectorAll('[role="dialog"]')).find(
      (d) => d.getAttribute('data-placement') === 'center',
    ) as HTMLElement
    const botoes = Array.from(modal.querySelectorAll('button'))
    botoes[botoes.length - 1].focus()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    expect(document.activeElement).toBe(botoes[0])
    expect(modal.contains(document.activeElement)).toBe(true)
  })

  it('abrir o modal depois da gaveta também o coloca no topo', () => {
    flushSync(() => root.render(<Pilha inicial={false} />))
    const abrir = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'abrir modal')!
    flushSync(() => abrir.click())
    esc()
    expect(fecharModal).toHaveBeenCalledTimes(1)
    expect(fecharGaveta).not.toHaveBeenCalled()
  })
})
