/** @vitest-environment jsdom */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EntityLookup } from '@/components/ui/forms/EntityLookup'

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

describe('EntityLookup', () => {
  it('expõe combobox e limpa seleção', () => {
    const onSearch = vi.fn(async () => [{ value: '1', label: 'Produto A' }])
    const onSelect = vi.fn()

    flushSync(() =>
      root.render(
        <EntityLookup
          value="1"
          selectedLabel="Produto A"
          onSelect={onSelect}
          onSearch={onSearch}
          clearLabel="Limpar"
        />,
      ),
    )

    const input = container.querySelector('input[role="combobox"]') as HTMLInputElement
    expect(input).toBeTruthy()
    expect(input.value).toBe('Produto A')
    expect(input.getAttribute('aria-autocomplete')).toBe('list')

    const clear = container.querySelector('[aria-label="Limpar"]') as HTMLButtonElement
    expect(clear).toBeTruthy()
    flushSync(() => clear.click())
    expect(onSelect).toHaveBeenCalledWith(null)
  })

  it('onSearch é async (contrato UX-S0-24)', async () => {
    const onSearch = vi.fn(async (q: string) => [{ value: q, label: q }])
    const rows = await onSearch('abc')
    expect(rows).toEqual([{ value: 'abc', label: 'abc' }])
    expect(onSearch).toHaveBeenCalledWith('abc')
  })
})
