/** @vitest-environment jsdom */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}))

import { TransferenciaIndisponivel } from './TransferenciaIndisponivel'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const textos = {
  titulo: 'Ainda não dá para transferir',
  motivoUma: 'Agora só existe uma loja.',
  motivoNenhuma: 'Não há loja ativa.',
  acaoAdmin: 'Cadastrar outra loja',
  acaoDono: 'Peça a um administrador.',
  acaoGerente: 'Você pode receber mercadoria nesta loja.',
  irSaldos: 'Ver saldos',
  irEntradas: 'Receber mercadoria',
}

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

function render(perfil: 'ADMIN' | 'DONO' | 'GERENTE', quantidadeLojas = 1) {
  act(() => {
    root.render(<TransferenciaIndisponivel quantidadeLojas={quantidadeLojas} perfil={perfil} textos={textos} />)
  })
}

describe('transferência indisponível', () => {
  it('explica a loja única e manda o administrador cadastrar outra', () => {
    render('ADMIN')
    expect(container.textContent).toContain('Agora só existe uma loja.')
    expect(container.querySelector('a')?.getAttribute('href')).toBe('/admin/provisionamento')
  })

  it('para o gerente, oferece receber ou ver saldos', () => {
    render('GERENTE', 0)
    expect(container.textContent).toContain('Não há loja ativa.')
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'))
    expect(hrefs).toContain('/admin/estoque/recebimento')
    expect(hrefs).toContain('/admin/estoque')
    expect(hrefs).not.toContain('/admin/provisionamento')
  })

  it('para o dono, pede um administrador e leva aos saldos', () => {
    render('DONO')
    expect(container.textContent).toContain('Peça a um administrador.')
    expect(container.querySelector('a')?.getAttribute('href')).toBe('/admin/estoque')
  })
})
