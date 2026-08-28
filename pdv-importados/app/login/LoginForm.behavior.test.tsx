/** @vitest-environment jsdom */
/**
 * Hardening i18n go-live — LoginForm.
 *
 * Antes desta correção, todo erro de autenticação era um literal PT hardcoded
 * (ex.: "Email ou senha incorretos") mesmo com `m.login` (catálogo já resolvido
 * para o idioma da sessão) em escopo. Um operador com `idioma_preferido = zh`
 * via a tela de login inteira em português no erro mais comum do sistema.
 *
 * Este teste prova, para o caminho de credenciais inválidas (o mais frequente):
 * — PT continua PT;
 * — 中文 retorna 中文 no mesmo caminho;
 * — nenhuma chamada de auth/sessão/redirect muda de comportamento.
 */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getMessages } from '@/i18n/getMessages'

const signInWithPasswordMock = vi.fn(async () => ({
  error: { message: 'Invalid login credentials' },
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { signInWithPassword: signInWithPasswordMock },
  }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))

import { LoginForm } from '@/app/login/LoginForm'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  signInWithPasswordMock.mockClear()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function setValue(input: HTMLInputElement, valor: string) {
  const setter = Object.getOwnPropertyDescriptor(
    globalThis.HTMLInputElement.prototype,
    'value',
  )!.set!
  setter.call(input, valor)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

/** Preenche email/senha e submete, como o operador faria. */
async function tentarLogin() {
  const inputs = container.querySelectorAll('input')
  await act(async () => {
    setValue(inputs[0] as HTMLInputElement, 'operador@loja.com')
    setValue(inputs[1] as HTMLInputElement, 'senha-errada')
  })
  const form = container.querySelector('form') as HTMLFormElement
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    // deixa a promise de signInWithPassword resolver
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('LoginForm — erro de credenciais no idioma da sessão', () => {
  it('PT: mostra a mensagem em português', async () => {
    const m = getMessages('pt')
    act(() => {
      root.render(<LoginForm messages={m} locale="pt-BR" />)
    })

    await tentarLogin()

    expect(container.textContent).toContain(m.login.erro_credenciais)
    expect(container.textContent).not.toContain(getMessages('zh').login.erro_credenciais)
  })

  it('中文: mostra a mensagem em chinês, não em português', async () => {
    const m = getMessages('zh')
    act(() => {
      root.render(<LoginForm messages={m} locale="zh-CN" />)
    })

    await tentarLogin()

    expect(container.textContent).toContain(m.login.erro_credenciais)
    expect(container.textContent).not.toContain(getMessages('pt').login.erro_credenciais)
  })

  it('a chamada de autenticação continua recebendo email e senha inalterados', async () => {
    const m = getMessages('pt')
    act(() => {
      root.render(<LoginForm messages={m} locale="pt-BR" />)
    })

    await tentarLogin()

    expect(signInWithPasswordMock).toHaveBeenCalledWith({
      email: 'operador@loja.com',
      password: 'senha-errada',
    })
  })
})
