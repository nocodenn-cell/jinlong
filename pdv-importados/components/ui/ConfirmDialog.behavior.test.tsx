/** @vitest-environment jsdom */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

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

describe('ConfirmDialog', () => {
  it('não renderiza quando open=false', () => {
    render(
      <ConfirmDialog open={false} onClose={() => {}} onConfirm={() => {}} title="Excluir" />,
    )
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })

  it('mostra título, descrição e dispara onConfirm', () => {
    const onConfirm = vi.fn()
    const onClose = vi.fn()
    render(
      <ConfirmDialog
        open
        onClose={onClose}
        onConfirm={onConfirm}
        title="Excluir cliente"
        description="Esta ação não pode ser desfeita."
        variant="danger"
        confirmLabel="Excluir"
      />,
    )
    expect(document.body.textContent).toContain('Excluir cliente')
    expect(document.body.textContent).toContain('Esta ação não pode ser desfeita.')
    const confirmBtn = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Excluir')
    expect(confirmBtn).toBeTruthy()
    confirmBtn!.click()
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('Cancelar chama onClose', () => {
    const onClose = vi.fn()
    render(
      <ConfirmDialog open onClose={onClose} onConfirm={() => {}} title="T" cancelLabel="Cancelar" />,
    )
    const cancel = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Cancelar')
    cancel!.click()
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
