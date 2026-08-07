/** @vitest-environment jsdom */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ConfirmDialogHost } from '@/components/ui/ConfirmDialogHost'
import { askConfirm } from '@/lib/ui/askConfirm'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  flushSync(() => root.render(<ConfirmDialogHost />))
})

afterEach(() => {
  flushSync(() => root.unmount())
  container.remove()
  document.body.style.overflow = ''
})

describe('askConfirm + ConfirmDialogHost', () => {
  it('resolve true ao confirmar', async () => {
    let promise!: Promise<boolean>
    await act(async () => {
      promise = askConfirm({
        title: 'Apagar?',
        description: 'Irreversível',
        confirmLabel: 'Sim',
      })
    })
    expect(document.body.textContent).toContain('Apagar?')
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Sim')
    expect(btn).toBeTruthy()
    await act(async () => {
      btn!.click()
    })
    await expect(promise).resolves.toBe(true)
  })

  it('resolve false ao cancelar', async () => {
    let promise!: Promise<boolean>
    await act(async () => {
      promise = askConfirm({ title: 'Sair?', cancelLabel: 'Não' })
    })
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Não')
    expect(btn).toBeTruthy()
    await act(async () => {
      btn!.click()
    })
    await expect(promise).resolves.toBe(false)
  })
})
