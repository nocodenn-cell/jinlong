/** @vitest-environment jsdom */
/**
 * Entrada única — administrador da plataforma (commercial_admins) sem loja no ERP
 * vai para o painel gerencial (hub); usuários do ERP seguem o fluxo de sempre.
 */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getMessages } from '@/i18n/getMessages'

const usuarioRow = vi.fn<() => { data: unknown; error: null }>()
const rpcMock = vi.fn(async (_fn: string) => ({ data: true as unknown, error: null }))
const signOutMock = vi.fn(async () => ({ error: null }))
const pushMock = vi.fn()
const assignMock = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      signInWithPassword: async () => ({ error: null }),
      getUser: async () => ({ data: { user: { id: 'u1' } } }),
      signOut: signOutMock,
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => usuarioRow() }) }),
    }),
    rpc: rpcMock,
  }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: vi.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))

import { LoginForm } from '@/app/login/LoginForm'

let container: HTMLDivElement
let root: Root
const m = getMessages('pt')

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_HUB_URL', 'https://hub.exemplo.com')
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, assign: assignMock, origin: 'http://localhost:3000' },
  })
  for (const f of [usuarioRow, rpcMock, signOutMock, pushMock, assignMock]) f.mockClear()
  rpcMock.mockImplementation(async () => ({ data: true, error: null }))
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  vi.unstubAllEnvs()
  act(() => root.unmount())
  container.remove()
})

function setValue(input: HTMLInputElement, valor: string) {
  Object.getOwnPropertyDescriptor(globalThis.HTMLInputElement.prototype, 'value')!.set!.call(input, valor)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

async function entrar() {
  act(() => root.render(<LoginForm messages={m} locale="pt-BR" />))
  const inputs = container.querySelectorAll('input')
  await act(async () => {
    setValue(inputs[0] as HTMLInputElement, 'pessoa@exemplo.com')
    setValue(inputs[1] as HTMLInputElement, 'senha-valida')
  })
  const form = container.querySelector('form[data-testid="login-form"]') as HTMLFormElement
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    for (let i = 0; i < 10; i++) await Promise.resolve()
  })
}

describe('LoginForm — entrada única', () => {
  it('admin da plataforma sem loja: encerra a sessão do ERP e vai ao hub', async () => {
    usuarioRow.mockReturnValue({ data: null, error: null })
    await entrar()
    expect(rpcMock).toHaveBeenCalledWith('is_commercial_admin')
    expect(signOutMock).toHaveBeenCalled()
    expect(assignMock).toHaveBeenCalledWith('https://hub.exemplo.com/login?origem=jinlong')
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('sem vínculo e sem papel de plataforma: erro de sempre, nada de redirect', async () => {
    usuarioRow.mockReturnValue({ data: null, error: null })
    rpcMock.mockImplementation(async () => ({ data: false, error: null }))
    await entrar()
    expect(assignMock).not.toHaveBeenCalled()
    expect(container.textContent).toContain(m.login.erro_conta_nao_vinculada)
  })

  it('hub não configurado: nem consulta o papel (inerte)', async () => {
    vi.stubEnv('NEXT_PUBLIC_HUB_URL', '')
    usuarioRow.mockReturnValue({ data: null, error: null })
    await entrar()
    expect(rpcMock).not.toHaveBeenCalled()
    expect(assignMock).not.toHaveBeenCalled()
  })

  it('cliente do ERP (gerente) continua indo ao painel do ERP', async () => {
    usuarioRow.mockReturnValue({ data: { perfil: 'GERENTE', ativo: true, loja_id: 'l1' }, error: null })
    await entrar()
    expect(rpcMock).not.toHaveBeenCalled()
    expect(pushMock).toHaveBeenCalledWith('/admin/dashboard')
  })

  it('operador de caixa continua indo ao PDV', async () => {
    usuarioRow.mockReturnValue({ data: { perfil: 'CAIXA', ativo: true, loja_id: 'l1' }, error: null })
    await entrar()
    expect(pushMock).toHaveBeenCalledWith('/caixa')
  })
})
