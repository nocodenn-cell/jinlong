/** @vitest-environment jsdom */
/**
 * Hardening i18n go-live — CaixaGerenteModal, passo "motivo do desconto".
 *
 * Antes desta correção, o rótulo, as 7 opções e as mensagens de validação do
 * motivo de desconto eram literais PT hardcoded, apesar de `m: Mensagens` já
 * estar em escopo (o resto do modal usa `m.caixa.*` normalmente). Um gerente
 * em 中文 autorizando um desconto via este modal via em português — no meio
 * do fluxo de checkout (D0).
 *
 * O valor persistido em `onApply` é sempre o código do enum
 * (`MotivoDescontoEnum`), nunca o texto do label — confirmado abaixo, e é
 * exatamente por isso que esta correção é presentação pura, sem risco para
 * a trilha de auditoria de desconto.
 */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getMessages } from '@/i18n/getMessages'
import { CaixaGerenteModal, type ValidarSenhaGerenteResult } from '@/app/caixa/CaixaGerenteModal'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
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

function setSelectValue(select: HTMLSelectElement, valor: string) {
  const setter = Object.getOwnPropertyDescriptor(
    globalThis.HTMLSelectElement.prototype,
    'value',
  )!.set!
  setter.call(select, valor)
  select.dispatchEvent(new Event('change', { bubbles: true }))
}

function clickByText(texto: string) {
  const btn = Array.from(container.querySelectorAll('button')).find((b) =>
    b.textContent?.includes(texto),
  ) as HTMLButtonElement
  btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

/** Preenche a senha e avança para o passo "motivo" — como o gerente faria. */
async function avancarParaMotivo(m: ReturnType<typeof getMessages>, onValidateSenha: (s: string) => Promise<ValidarSenhaGerenteResult>) {
  const onApply = vi.fn()
  act(() => {
    root.render(
      <CaixaGerenteModal
        open
        onOpenChange={() => {}}
        m={m}
        validando={false}
        onValidateSenha={onValidateSenha}
        onApply={onApply}
      />,
    )
  })

  const senhaInput = container.querySelector('input[type="password"]') as HTMLInputElement
  await act(async () => {
    setValue(senhaInput, '1234')
  })
  await act(async () => {
    clickByText(m.caixa.modal_gerente_seguinte)
    await Promise.resolve()
    await Promise.resolve()
  })

  return onApply
}

describe('CaixaGerenteModal — passo motivo do desconto no idioma da sessão', () => {
  it('PT: rótulo e opções aparecem em português', async () => {
    const m = getMessages('pt')
    const onValidateSenha = vi.fn(async () => ({
      ok: true as const,
      token: 'tok',
      expiraEm: new Date().toISOString(),
      maxDescontoPercentual: 20,
    }))

    await avancarParaMotivo(m, onValidateSenha)

    expect(container.textContent).toContain(m.caixa.modal_gerente_motivo_label)
    const select = container.querySelector('select') as HTMLSelectElement
    const opcoes = Array.from(select.options).map((o) => o.textContent)
    expect(opcoes).toContain(m.caixa.modal_gerente_motivo_negociacao)
    expect(opcoes).toContain(m.caixa.modal_gerente_motivo_cliente_preferencial)
  })

  it('中文: rótulo e opções aparecem em chinês, não em português', async () => {
    const m = getMessages('zh')
    const mPt = getMessages('pt')
    const onValidateSenha = vi.fn(async () => ({
      ok: true as const,
      token: 'tok',
      expiraEm: new Date().toISOString(),
      maxDescontoPercentual: 20,
    }))

    await avancarParaMotivo(m, onValidateSenha)

    expect(container.textContent).toContain(m.caixa.modal_gerente_motivo_label)
    expect(container.textContent).not.toContain(mPt.caixa.modal_gerente_motivo_label)

    const select = container.querySelector('select') as HTMLSelectElement
    const opcoes = Array.from(select.options).map((o) => o.textContent)
    expect(opcoes).toContain(m.caixa.modal_gerente_motivo_negociacao)
    expect(opcoes).not.toContain(mPt.caixa.modal_gerente_motivo_negociacao)
  })

  it('o valor persistido é sempre o código do enum, nunca o texto do label', async () => {
    const m = getMessages('zh')
    const onValidateSenha = vi.fn(async () => ({
      ok: true as const,
      token: 'tok',
      expiraEm: new Date().toISOString(),
      maxDescontoPercentual: 20,
    }))
    const onApply = await avancarParaMotivo(m, onValidateSenha)

    const select = container.querySelector('select') as HTMLSelectElement
    await act(async () => {
      setSelectValue(select, 'NEGOCIACAO')
    })
    const motivoNext = container.querySelector('[data-testid="motivo-next"]') as HTMLButtonElement
    await act(async () => {
      motivoNext.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const pctInput = container.querySelector('input') as HTMLInputElement
    await act(async () => {
      setValue(pctInput, '10')
    })
    await act(async () => {
      clickByText(m.caixa.modal_gerente_aplicar)
    })

    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ motivo: 'NEGOCIACAO', motivoDescricao: null }),
    )
  })
})
