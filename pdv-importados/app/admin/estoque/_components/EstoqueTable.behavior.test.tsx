/** @vitest-environment jsdom */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string
    children: React.ReactNode
  } & Record<string, unknown>) =>
    React.createElement('a', { href, ...rest }, children),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

vi.mock('./AjusteSaldoModal', () => ({
  AjusteSaldoModal: () => null,
}))

vi.mock('./KardexSheet', () => ({
  KardexSheet: () => null,
}))

const { EstoqueTable } = await import('./EstoqueTable')

const labels = {
  produto: 'Produto',
  saldo: 'Saldo',
  minimo: 'Mínimo',
  deficit: 'Déficit',
  unidade: 'Un.',
  origem: 'Origem',
  origemChina: 'China',
  origemBrasilNf: 'Brasil · NF',
  origemBrasil: 'Brasil',
  vazioTitulo: 'Vazio',
  vazioSub: 'Sub',
  ajusteTitulo: 'Ajustar saldo',
  ajusteAcao: 'Ajustar',
  saldoAtual: 'Saldo atual',
  estoqueMinimo: 'Estoque mínimo',
  motivo: 'Motivo',
  observacao: 'Observação',
  cancelar: 'Cancelar',
  salvarAjuste: 'Salvar',
  salvando: 'Salvando',
  motivoAcertoInventario: 'Acerto',
  motivoEntradaCompra: 'Compra',
  motivoPerda: 'Perda',
  motivoQuebra: 'Quebra',
  motivoOutro: 'Outro',
  kardexTitulo: 'Kardex',
  semMovimentos: 'Sem',
  semMovimentosSub: 'Sub',
  tipoVenda: 'Venda',
  tipoCompra: 'Compra',
  tipoEntradaNf: 'NF',
  tipoEntrada: 'Entrada',
  tipoSaida: 'Saída',
  tipoAjuste: 'Ajuste',
  tipoDevolucao: 'Dev',
  tipoTransferencia: 'Transf',
  tipoAcertoInventario: 'Acerto',
  tipoPerda: 'Perda',
  tipoQuebra: 'Quebra',
  tipoOutro: 'Outro',
}

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

describe('EstoqueTable', () => {
  it('expõe ação Ajustar com nome do produto e oculta Déficit sem valores', () => {
    flushSync(() => {
      root.render(
        <EstoqueTable
          labels={labels}
          linhas={[
            {
              id: 'p1',
              nome: 'Caneta azul',
              codigo_barras: '789',
              unidade_medida: 'UN',
              origem: 'china_manual',
              quantidade_atual: 0,
              estoque_minimo: 0,
              deficit: 0,
            },
          ]}
        />,
      )
    })
    expect(container.textContent).toContain('Caneta azul')
    expect(container.textContent).toContain('789')
    expect(container.querySelector('[aria-label="Ajustar saldo Caneta azul"]')).toBeTruthy()
    expect(container.querySelector('[aria-label="Kardex Caneta azul"]')).toBeTruthy()
    expect(container.textContent).not.toContain('Déficit')
  })

  it('mostra Déficit quando há valor positivo', () => {
    flushSync(() => {
      root.render(
        <EstoqueTable
          labels={labels}
          linhas={[
            {
              id: 'p2',
              nome: 'Balde',
              codigo_barras: null,
              unidade_medida: 'UN',
              origem: 'brasil_nf',
              quantidade_atual: 1,
              estoque_minimo: 5,
              deficit: 4,
            },
          ]}
        />,
      )
    })
    expect(container.textContent).toContain('Déficit')
    expect(container.textContent).toContain('-4')
  })
})
