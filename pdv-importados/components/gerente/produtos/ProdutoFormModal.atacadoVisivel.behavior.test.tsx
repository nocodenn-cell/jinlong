/** @vitest-environment jsdom */
/**
 * P0 de descoberta: "a partir de quantas unidades este produto entra no preço
 * de atacado?" é função comercial central do Jinlong e precisa estar dentro de
 * PREÇOS, não atrás de "Mais detalhes" → "Expandir classificação".
 *
 * Antes deste teste o bloco de atacado só montava com `modoCompleto`, que no
 * cadastro novo nasce falso: eram dois cliques + scroll até achar o campo.
 */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getMessages } from '@/i18n/getMessages'

vi.mock('@/app/gerente/produtos/actions', () => ({
  criarProduto: vi.fn().mockResolvedValue({ success: true, data: { id: 'p-1' } }),
}))

vi.mock('@/lib/gerente/toast', () => ({
  emitGerenteToast: vi.fn(),
}))

vi.mock('@/app/gerente/produtos/sugestaoCadastroActions', () => ({
  sugerirDadosCadastroPorGtin: vi.fn().mockResolvedValue({ ok: false, error: 'skip' }),
  registrarCadastroProdutoTelemetry: vi.fn().mockResolvedValue({ ok: true }),
}))

import { NovoProdutoModal } from '@/components/gerente/produtos/NovoProdutoModal'

const m = getMessages('pt')
const p = m.produtos
const opcoes = { categorias: [], marcas: [], fornecedores: [] }

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

function renderNovo() {
  flushSync(() =>
    root.render(
      <NovoProdutoModal
        open
        onOpenChange={vi.fn()}
        m={m}
        opcoes={opcoes}
        onCriado={vi.fn()}
      />,
    ),
  )
}

function ativarAtacado(): HTMLInputElement {
  const el = container.querySelector<HTMLInputElement>('input[data-field="atacado_ativar"]')
  expect(el, 'checkbox "Vender também no atacado"').toBeTruthy()
  return el!
}

function clicar(el: HTMLInputElement) {
  flushSync(() => {
    el.click()
  })
}

describe('atacado no cadastro novo', () => {
  it('oferece o atacado sem abrir "Mais detalhes"', () => {
    renderNovo()
    // modo simples é o padrão
    expect(container.textContent).toContain(p.modo_completo)
    expect(container.textContent).toContain(p.titulo_faixas_atacado)
  })

  it('nasce recolhido e expande os campos ao marcar', () => {
    renderNovo()
    const check = ativarAtacado()
    expect(check.checked, 'recolhido por padrão no cadastro novo').toBe(false)
    expect(container.querySelector('input[data-field="preco_atacado"]')).toBeNull()

    clicar(check)
    expect(container.querySelector('input[data-field="preco_atacado"]')).toBeTruthy()
    expect(container.textContent).toContain(p.faixa_col_quantidade)
    expect(container.textContent).toContain(p.faixa_col_preco)
  })

  it('mantém o atacado dentro da seção Preços', () => {
    renderNovo()
    const secaoPrecos = container.querySelector('#produto-secao-precos')
    expect(secaoPrecos, 'seção Preços').toBeTruthy()
    expect(secaoPrecos!.textContent).toContain(p.titulo_faixas_atacado)
  })

  it('não usa mais o parágrafo de precedência como texto permanente', () => {
    renderNovo()
    clicar(ativarAtacado())
    expect(container.textContent).not.toContain('A maior quantidade mínima atingida')
  })
})
