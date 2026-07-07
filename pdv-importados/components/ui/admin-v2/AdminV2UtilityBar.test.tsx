/** @vitest-environment jsdom */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

vi.mock('@/lib/auth/clientLogout', () => ({
  performClientLogout: vi.fn().mockResolvedValue({ ok: true }),
}))

vi.mock('@/lib/caixa/resetCarrinhoPersistido', () => ({
  resetCarrinhoPersistido: vi.fn(),
}))

import { AdminV2UtilityBar } from '@/components/ui/admin-v2/AdminV2UtilityBar'

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

describe('AdminV2UtilityBar', () => {
  it('não exibe botão de tema desabilitado (controle falso removido)', () => {
    flushSync(() => root.render(<AdminV2UtilityBar />))
    expect(container.querySelector('[title="Alternância de tema em breve"]')).toBeNull()
    expect(container.textContent).toContain('Sair')
  })
})
