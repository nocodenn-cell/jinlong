/** @vitest-environment jsdom */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const buscar = vi.fn()
const excluir = vi.fn()

vi.mock('@/app/admin/clientes/actions', () => ({
  buscarClientesPaginadosAction: (...args: unknown[]) => buscar(...args),
  excluirClienteAction: (...args: unknown[]) => excluir(...args),
}))

vi.mock('@/lib/gerente/toast', () => ({
  emitGerenteToast: vi.fn(),
}))

vi.mock('@/lib/hooks/useDebounce', () => ({
  useDebounce: <T,>(v: T) => v,
}))

const { ClientesListClient } = await import('./ClientesListClient')
const { getMessages } = await import('@/i18n/getMessages')

const m = getMessages('pt')

const row = {
  id: 'c1',
  nome: 'andre oliveira',
  tipo: 'PF' as const,
  documento: '99999988852',
  email: null,
  telefone: '819886459993',
  endereco: null,
  limite_crediario: 500,
  saldo_crediario: 120,
}

let container: HTMLDivElement
let root: Root

function render(ui: React.ReactElement) {
  flushSync(() => root.render(ui))
}

beforeEach(() => {
  class IOStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('IntersectionObserver', IOStub)

  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  buscar.mockReset()
  excluir.mockReset()
})

afterEach(() => {
  flushSync(() => root.unmount())
  container.remove()
})

describe('ClientesListClient Fase A', () => {
  it('mostra ErrorState quando a carga inicial falha', () => {
    render(
      <ClientesListClient
        idioma="pt"
        locale="pt-BR"
        messages={m}
        clientesIniciais={[]}
        hasMoreInicial={false}
        erroCargaInicial="falha de rede"
      />,
    )
    expect(container.textContent).toContain(m.clientes.erro_carga_titulo)
    expect(container.textContent).toContain('falha de rede')
    expect(container.textContent).not.toContain(m.clientes.vazio_base_titulo)
  })

  it('mostra empty de base vazia quando não há termo', () => {
    render(
      <ClientesListClient
        idioma="pt"
        locale="pt-BR"
        messages={m}
        clientesIniciais={[]}
        hasMoreInicial={false}
      />,
    )
    expect(container.textContent).toContain(m.clientes.vazio_base_titulo)
    expect(container.textContent).not.toContain(m.clientes.erro_carga_titulo)
  })

  it('exibe rótulos de saldo/limite e telefone legível', () => {
    render(
      <ClientesListClient
        idioma="pt"
        locale="pt-BR"
        messages={m}
        clientesIniciais={[row]}
        hasMoreInicial={false}
      />,
    )
    expect(container.textContent).toContain(m.clientes.saldo_em_aberto_label)
    expect(container.textContent).toContain(m.clientes.limite_label)
    expect(container.textContent).not.toContain('819886459993')
    expect(container.textContent).toMatch(/81/)
    expect(container.textContent).toContain('Mostrando 1 cliente')
  })

  it('mostra Sem aberto quando saldo é zero, com limite se houver', () => {
    render(
      <ClientesListClient
        idioma="pt"
        locale="pt-BR"
        messages={m}
        clientesIniciais={[{ ...row, saldo_crediario: 0, limite_crediario: 200 }]}
        hasMoreInicial={false}
      />,
    )
    expect(container.textContent).toContain(m.clientes.saldo_sem_aberto)
    expect(container.textContent).toContain(m.clientes.limite_label)
    expect(container.textContent).not.toContain(`${m.clientes.saldo_em_aberto_label} R$`)
  })

  it('oferece Carregar mais quando hasMore', () => {
    render(
      <ClientesListClient
        idioma="pt"
        locale="pt-BR"
        messages={m}
        clientesIniciais={[row]}
        hasMoreInicial
      />,
    )
    expect(container.textContent).toContain(m.clientes.carregar_mais)
    expect(container.textContent).toContain('Mostrando 1+ cliente')
  })
})
