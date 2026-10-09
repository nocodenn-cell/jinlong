/** @vitest-environment jsdom */
/**
 * Sprint LOGIN-02 — comportamento da tela de login (validação acessível,
 * mostrar/ocultar senha, envio duplicado, seletor de idioma).
 * Não usa Supabase real: `createClient` é mockado.
 */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getMessages } from '@/i18n/getMessages'

const signInWithPasswordMock = vi.fn(async () => ({ error: null as null | { message: string } }))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      signInWithPassword: signInWithPasswordMock,
      getUser: vi.fn(async () => ({ data: { user: null } })),
    },
  }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => ({ get: () => null }),
}))

vi.mock('@/app/login/actions', () => ({ setIdiomaPreLoginAction: vi.fn() }))

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
  const setter = Object.getOwnPropertyDescriptor(globalThis.HTMLInputElement.prototype, 'value')!.set!
  setter.call(input, valor)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function submit() {
  const form = container.querySelector('form[data-testid="login-form"]') as HTMLFormElement
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
}

function render(locale: 'pt-BR' | 'zh-CN' = 'pt-BR') {
  const m = getMessages(locale === 'zh-CN' ? 'zh' : 'pt')
  act(() => {
    root.render(<LoginForm messages={m} locale={locale} />)
  })
  return m
}

const emailInput = () => container.querySelector('#login-email') as HTMLInputElement
const senhaInput = () => container.querySelector('#login-senha') as HTMLInputElement
const alerts = () => [...container.querySelectorAll('[role="alert"]')].map((a) => a.textContent)

describe('LoginForm — validação acessível (LOGIN-01, LOGIN-02)', () => {
  it('envio vazio mostra erro junto aos dois campos, sem chamar a autenticação', async () => {
    const m = render()
    await act(async () => submit())

    expect(alerts()).toEqual([m.login.email_obrigatorio, m.login.senha_obrigatoria])
    expect(emailInput().getAttribute('aria-invalid')).toBe('true')
    expect(emailInput().getAttribute('aria-describedby')).toContain('login-email-error')
    expect(senhaInput().getAttribute('aria-invalid')).toBe('true')
    expect(signInWithPasswordMock).not.toHaveBeenCalled()
  })

  it('e-mail com formato inválido mostra mensagem específica e não autentica', async () => {
    const m = render()
    await act(async () => {
      setValue(emailInput(), 'sem-arroba')
      setValue(senhaInput(), 'algo')
    })
    await act(async () => submit())

    expect(alerts()).toEqual([m.login.email_invalido])
    expect(signInWithPasswordMock).not.toHaveBeenCalled()
  })

  it('ao corrigir o campo, o erro dele some', async () => {
    render()
    await act(async () => submit())
    await act(async () => setValue(emailInput(), 'a@b.com'))

    expect(emailInput().getAttribute('aria-invalid')).toBeNull()
    expect(alerts().length).toBe(1)
  })

  it('campos têm name e autocomplete semânticos', () => {
    render()
    expect(emailInput().getAttribute('name')).toBe('email')
    expect(emailInput().getAttribute('autocomplete')).toBe('username')
    expect(senhaInput().getAttribute('name')).toBe('password')
    expect(senhaInput().getAttribute('autocomplete')).toBe('current-password')
  })
})

describe('LoginForm — mostrar/ocultar senha (LOGIN-03)', () => {
  it('alterna o tipo do campo e atualiza rótulo e aria-pressed', async () => {
    const m = render()
    const toggle = container.querySelector('.login-senha-toggle') as HTMLButtonElement

    expect(senhaInput().type).toBe('password')
    expect(toggle.getAttribute('aria-label')).toBe(m.login.senha_mostrar)
    expect(toggle.getAttribute('aria-pressed')).toBe('false')

    await act(async () => toggle.click())
    expect(senhaInput().type).toBe('text')
    expect(toggle.getAttribute('aria-label')).toBe(m.login.senha_ocultar)
    expect(toggle.getAttribute('aria-pressed')).toBe('true')

    await act(async () => toggle.click())
    expect(senhaInput().type).toBe('password')
  })
})

describe('LoginForm — envio duplicado (LOGIN-06)', () => {
  it('enquanto a autenticação está pendente, um segundo envio é ignorado', async () => {
    render()
    signInWithPasswordMock.mockImplementation(() => new Promise(() => {}) as never)

    await act(async () => {
      setValue(emailInput(), 'operador@loja.com')
      setValue(senhaInput(), 'senha')
    })
    await act(async () => submit())
    await act(async () => submit())

    expect(signInWithPasswordMock).toHaveBeenCalledTimes(1)
  })
})

describe('LoginForm — skip link traduzido', () => {
  it('aponta para #main-content e usa o texto do idioma da sessão', () => {
    const m = render('zh-CN')
    const skip = container.querySelector('a.skip-link') as HTMLAnchorElement
    expect(skip.getAttribute('href')).toBe('#main-content')
    expect(skip.textContent).toBe(m.login.ir_conteudo)
    expect(container.querySelector('main#main-content')).not.toBeNull()
  })
})

describe('LoginForm — seletor de idioma (LOGIN-04, LOGIN-05)', () => {
  it('em PT, o botão Português está pressionado e o rótulo está em PT', () => {
    const m = render('pt-BR')
    const group = container.querySelector('[role="group"]') as HTMLElement
    const pt = container.querySelector('button[value="pt"]') as HTMLButtonElement
    const zh = container.querySelector('button[value="zh"]') as HTMLButtonElement

    expect(group.getAttribute('aria-label')).toBe(m.login.idioma_selecionar)
    expect(pt.getAttribute('aria-pressed')).toBe('true')
    expect(zh.getAttribute('aria-pressed')).toBe('false')
    expect(pt.name).toBe('idioma')
  })

  it('em 中文, o título e o rótulo do campo mudam e o botão 简体中文 fica pressionado', () => {
    const m = render('zh-CN')
    const zh = container.querySelector('button[value="zh"]') as HTMLButtonElement

    expect(zh.getAttribute('aria-pressed')).toBe('true')
    expect(container.textContent).toContain(m.login.senha_placeholder)
    expect(container.textContent).not.toContain(getMessages('pt').login.entrar)
  })
})
