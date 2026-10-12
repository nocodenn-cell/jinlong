/** @vitest-environment jsdom */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { getMessages } from '@/i18n/getMessages'
import type { ProdutoPalm } from '@/app/palm/domain/tiposPalm'
import { PalmEstoqueView } from './PalmEstoqueView'
import { PalmVendasView } from './PalmVendasView'

const produto: ProdutoPalm = {
  id: 'p1',
  nome: 'Caneca',
  codigo: 'C1',
  descricao: 'Branca',
  imagem: null,
  localizacao: 'A1',
  estoque: 3,
  estoqueMinimo: 5,
  baixo: true,
  precoVarejo: 10,
  precoAtacado: 7,
  atacadoMinimo: 10,
}

let root: Root
let container: HTMLDivElement

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function renderEstoque(idioma: 'pt' | 'zh') {
  const m = getMessages(idioma)
  act(() => {
    root.render(
      <PalmEstoqueView
        m={m}
        busca=""
        onBusca={() => undefined}
        onBuscar={() => undefined}
        onAbrirCamera={() => undefined}
        produtos={[produto]}
        erro={null}
      />,
    )
  })
  return m
}

it('estoque em português mostra saldo como texto e não como campo', () => {
  const m = renderEstoque('pt')
  expect(container.textContent).toContain(m.palm.estoque_titulo)
  expect(container.textContent).toContain(m.palm.somente_consulta)
  const saldo = container.querySelector('[data-testid="estoque-saldo"]')
  expect(saldo?.querySelector('input, textarea, select')).toBeNull()
})

it('estoque em chinês usa o título traduzido', () => {
  const m = renderEstoque('zh')
  expect(container.textContent).toContain(m.palm.estoque_titulo)
  expect(m.palm.estoque_titulo).not.toBe(getMessages('pt').palm.estoque_titulo)
})

it('vendas em português e chinês mostram varejo, atacado e total', () => {
  for (const idioma of ['pt', 'zh'] as const) {
    const m = getMessages(idioma)
    act(() => {
      root.render(
        <PalmVendasView
          m={m}
          busca=""
          onBusca={() => undefined}
          onBuscar={() => undefined}
          onAbrirCamera={() => undefined}
          produtos={[produto]}
          produtoId={produto.id}
          onEscolherProduto={() => undefined}
          quantidade={1}
          onQuantidade={() => undefined}
          onAdicionar={() => undefined}
          linhas={[]}
          onAlterarQtd={() => undefined}
          onRemover={() => undefined}
          total={0}
          clienteBusca=""
          onClienteBusca={() => undefined}
          onBuscarCliente={() => undefined}
          clientes={[]}
          clienteNome={null}
          onEscolherCliente={() => undefined}
          onEnviar={() => undefined}
          enviando={false}
          confirmacao={null}
          erro={null}
          historico={[]}
          onCancelar={() => undefined}
          motivo=""
          onMotivo={() => undefined}
        />,
      )
    })
    expect(container.textContent).toContain(m.palm.vendas_titulo)
    expect(container.textContent).toContain(m.palm.varejo)
    expect(container.textContent).toContain(m.palm.atacado)
    expect(container.querySelector('[data-testid="palm-vendas"]')).not.toBeNull()
  }
})
