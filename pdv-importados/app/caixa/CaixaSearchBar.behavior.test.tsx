/** @vitest-environment jsdom */
/**
 * Onda 2 · Bloco 1 (P1 teclado): "digitar → ↓ → Enter" precisa ser um caminho
 * possível quando há candidatos, sem quebrar o Enter normal (submeter busca)
 * quando não há ambiguidade nenhuma.
 */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CaixaSearchBar } from './CaixaSearchBar'
import type { Mensagens } from '@/i18n/getMessages'

const mockMensagens = {
  caixa: {
    busca_placeholder: 'Código de barras, nome ou categoria…',
    busca_dica: 'dica',
    buscando: 'Buscando…',
    adicionar_enter: 'Adicionar (Enter)',
    novo_cupom: 'Novo cupom',
    som_feedback_ligado: 'Som: ligado',
    som_feedback_desligado: 'Som: desligado',
  },
} as unknown as Mensagens

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
})

function pressKey(input: HTMLInputElement, key: string) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  input.dispatchEvent(event)
  return event
}

describe('CaixaSearchBar — navegação por teclado dos candidatos (Onda 2 · Bloco 1)', () => {
  it('sem candidatos: ArrowDown/Enter seguem o comportamento normal do campo (não navega, não seleciona)', () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault())
    const onNavegarCandidato = vi.fn()
    const onSelecionarCandidatoAtivo = vi.fn()

    flushSync(() => {
      root.render(
        <CaixaSearchBar
          m={mockMensagens}
          codigo="cadeira"
          onCodigoChange={() => {}}
          onSubmit={onSubmit}
          onNovoCupom={() => {}}
          buscando={false}
          carregandoRegras={false}
          somAtivo
          onToggleSom={() => {}}
          temCandidatos={false}
          onNavegarCandidato={onNavegarCandidato}
          onSelecionarCandidatoAtivo={onSelecionarCandidatoAtivo}
        />,
      )
    })

    const input = container.querySelector('input') as HTMLInputElement
    flushSync(() => {
      pressKey(input, 'ArrowDown')
    })
    expect(onNavegarCandidato).not.toHaveBeenCalled()
  })

  it('com candidatos: ArrowDown navega, Enter seleciona o ativo (não submete a busca)', () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault())
    const onNavegarCandidato = vi.fn()
    const onSelecionarCandidatoAtivo = vi.fn()
    const onFecharCandidatos = vi.fn()

    flushSync(() => {
      root.render(
        <CaixaSearchBar
          m={mockMensagens}
          codigo="cadeira v"
          onCodigoChange={() => {}}
          onSubmit={onSubmit}
          onNovoCupom={() => {}}
          buscando={false}
          carregandoRegras={false}
          somAtivo
          onToggleSom={() => {}}
          temCandidatos
          onNavegarCandidato={onNavegarCandidato}
          onSelecionarCandidatoAtivo={onSelecionarCandidatoAtivo}
          onFecharCandidatos={onFecharCandidatos}
        />,
      )
    })

    const input = container.querySelector('input') as HTMLInputElement

    flushSync(() => {
      pressKey(input, 'ArrowDown')
    })
    expect(onNavegarCandidato).toHaveBeenCalledWith(1)

    flushSync(() => {
      pressKey(input, 'ArrowUp')
    })
    expect(onNavegarCandidato).toHaveBeenCalledWith(-1)

    let enterEvent!: KeyboardEvent
    flushSync(() => {
      enterEvent = pressKey(input, 'Enter')
    })
    expect(onSelecionarCandidatoAtivo).toHaveBeenCalledTimes(1)
    expect(onSubmit).not.toHaveBeenCalled()
    expect(enterEvent.defaultPrevented).toBe(true)
  })

  it('com candidatos: Escape fecha a lista de candidatos e limpa o campo', () => {
    const onCodigoChange = vi.fn()
    const onFecharCandidatos = vi.fn()

    flushSync(() => {
      root.render(
        <CaixaSearchBar
          m={mockMensagens}
          codigo="cadeira v"
          onCodigoChange={onCodigoChange}
          onSubmit={(e) => e.preventDefault()}
          onNovoCupom={() => {}}
          buscando={false}
          carregandoRegras={false}
          somAtivo
          onToggleSom={() => {}}
          temCandidatos
          onFecharCandidatos={onFecharCandidatos}
        />,
      )
    })

    const input = container.querySelector('input') as HTMLInputElement
    flushSync(() => {
      pressKey(input, 'Escape')
    })
    expect(onFecharCandidatos).toHaveBeenCalledTimes(1)
    expect(onCodigoChange).toHaveBeenCalledWith('')
  })

  it('barcode exato (sem ambiguidade): Enter ainda submete a busca normalmente', () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault())

    flushSync(() => {
      root.render(
        <CaixaSearchBar
          m={mockMensagens}
          codigo="7891000000001"
          onCodigoChange={() => {}}
          onSubmit={onSubmit}
          onNovoCupom={() => {}}
          buscando={false}
          carregandoRegras={false}
          somAtivo
          onToggleSom={() => {}}
          temCandidatos={false}
        />,
      )
    })

    const form = container.querySelector('form') as HTMLFormElement
    flushSync(() => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })
})
