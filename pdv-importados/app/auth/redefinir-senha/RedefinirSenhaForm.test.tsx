/** @vitest-environment jsdom */
/**
 * Recuperação de senha — tela de redefinição.
 * Garante: validação local aparece na tela (não some num balão nativo), erros do
 * Supabase viram mensagem em português e o sucesso só aparece após updateUser OK.
 */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getMessages } from '@/i18n/getMessages'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const updateUserMock = vi.fn<(arg: { password: string }) => Promise<{ error: { code?: string; name?: string; message: string } | null }>>()
const pushMock = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { updateUser: updateUserMock } }),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: vi.fn() }),
}))
vi.mock('@/components/auth/AuthShell', () => ({
  AuthShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/components/branding/DragonOuroLoader', () => ({
  DragonOuroLoader: () => null,
}))

import { RedefinirSenhaForm, mapUpdatePasswordError, type RedefinirSenhaLabels } from './RedefinirSenhaForm'

const m = getMessages('pt').login
const L: RedefinirSenhaLabels = {
  brandSubtitle: 'x',
  titulo: m.redefinir_titulo,
  instrucao: m.redefinir_instrucao,
  novaSenha: m.redefinir_nova,
  confirmar: m.redefinir_confirmar,
  salvar: m.redefinir_salvar,
  salvando: m.redefinir_salvando,
  sucesso: m.redefinir_sucesso,
  voltar: m.esqueci_voltar,
  erroSessao: m.redefinir_erro_sessao,
  erroCurta: m.senha_erro_curta,
  erroMismatch: m.senha_erro_mismatch,
  erroGenerico: m.redefinir_erro,
  erroMesmaSenha: m.redefinir_erro_mesma_senha,
  erroFraca: m.redefinir_erro_fraca,
}

describe('mapUpdatePasswordError', () => {
  it('same_password vira mensagem em português', () => {
    expect(mapUpdatePasswordError({ code: 'same_password' }, L)).toBe(L.erroMesmaSenha)
  })
  it('weak_password vira mensagem em português', () => {
    expect(mapUpdatePasswordError({ code: 'weak_password' }, L)).toBe(L.erroFraca)
  })
  it('sessão ausente pede novo link', () => {
    expect(mapUpdatePasswordError({ name: 'AuthSessionMissingError' }, L)).toBe(L.erroSessao)
    expect(mapUpdatePasswordError({ code: 'session_not_found' }, L)).toBe(L.erroSessao)
  })
  it('qualquer outro erro cai na mensagem genérica, nunca no texto em inglês', () => {
    expect(mapUpdatePasswordError({ code: 'unexpected_failure' }, L)).toBe(L.erroGenerico)
    expect(mapUpdatePasswordError(null, L)).toBe(L.erroGenerico)
  })
})

let container: HTMLDivElement
let root: Root

function setInput(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  setter.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

async function preencherEEnviar(senha: string, confirm: string) {
  const s = container.querySelector<HTMLInputElement>('#reset-senha')!
  const c = container.querySelector<HTMLInputElement>('#reset-confirm')!
  await act(async () => {
    setInput(s, senha)
    setInput(c, confirm)
  })
  const form = container.querySelector<HTMLFormElement>('[data-testid=reset-password-form]')!
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20))
  })
}

const alerta = () => container.querySelector('[role=alert]')?.textContent ?? ''

beforeEach(() => {
  updateUserMock.mockReset()
  pushMock.mockReset()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('RedefinirSenhaForm', () => {
  it('formulário não deixa o navegador bloquear o envio com balão nativo (noValidate)', async () => {
    await act(async () => root.render(<RedefinirSenhaForm labels={L} hasSession />))
    const form = container.querySelector<HTMLFormElement>('[data-testid=reset-password-form]')!
    expect(form.noValidate).toBe(true)
  })

  it('senha curta: mostra a regra na tela e não chama updateUser', async () => {
    await act(async () => root.render(<RedefinirSenhaForm labels={L} hasSession />))
    await preencherEEnviar('abc', 'abc')
    expect(alerta()).toBe(L.erroCurta.replace('{n}', '8'))
    expect(updateUserMock).not.toHaveBeenCalled()
  })

  it('senha igual à anterior: mostra mensagem em português, não o texto do Supabase', async () => {
    updateUserMock.mockResolvedValueOnce({
      error: { code: 'same_password', message: 'New password should be different from the old password.' },
    })
    await act(async () => root.render(<RedefinirSenhaForm labels={L} hasSession />))
    await preencherEEnviar('SenhaAntiga123', 'SenhaAntiga123')
    expect(updateUserMock).toHaveBeenCalledWith({ password: 'SenhaAntiga123' })
    expect(alerta()).toBe(L.erroMesmaSenha)
    expect(alerta()).not.toMatch(/New password/)
  })

  it('sucesso: só mostra confirmação depois do updateUser sem erro', async () => {
    updateUserMock.mockResolvedValueOnce({ error: null })
    await act(async () => root.render(<RedefinirSenhaForm labels={L} hasSession />))
    await preencherEEnviar('SenhaNova456', 'SenhaNova456')
    expect(updateUserMock).toHaveBeenCalledTimes(1)
    expect(container.querySelector('[role=status]')?.textContent).toBe(L.sucesso)
    expect(container.querySelector('[data-testid=reset-password-form]')).toBeNull()
  })

  it('sem sessão: formulário desabilitado e mensagem para pedir novo link', async () => {
    await act(async () => root.render(<RedefinirSenhaForm labels={L} hasSession={false} />))
    expect(alerta()).toBe(L.erroSessao)
    const btn = container.querySelector<HTMLButtonElement>('[data-testid=reset-password-form] button[type=submit]')!
    expect(btn.disabled).toBe(true)
  })
})
