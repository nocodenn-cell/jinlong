/** @vitest-environment jsdom */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MoneyText } from '@/components/ui/MoneyText'

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

describe('MoneyText', () => {
  it('formata BRL com números tabulares', () => {
    flushSync(() => root.render(<MoneyText value={12.5} />))
    expect(container.textContent).toMatch(/R\$\s*12,50/)
    expect(container.firstElementChild?.className).toContain('tabular-nums')
  })
})
