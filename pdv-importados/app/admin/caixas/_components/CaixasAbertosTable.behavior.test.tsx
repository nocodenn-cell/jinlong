/** @vitest-environment jsdom */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { CaixaAbertoLinha } from '@/app/gerente/caixas/caixasHistorico'
import { CaixasAbertosTable } from './CaixasAbertosTable'

const labels = {
  colOperador: 'Operador',
  colAbertura: 'Abertura',
  colValorInicial: 'Valor inicial',
  colSangrias: 'Sangrias',
  colSuprimentos: 'Suprimentos',
  colStatus: 'Status',
  statusAberto: 'Aberto',
  statusRetomado: 'Retomado',
  vazioTitulo: 'Nenhum caixa aberto no momento',
  vazioSub: 'Turnos abertos no PDV aparecem aqui.',
}

const aberto: CaixaAbertoLinha = {
  id: 'c1',
  operadorNome: 'João',
  dataAbertura: '2026-09-29T08:00:00Z',
  valorInicial: 200,
  sangrias: 300,
  suprimentos: 100,
  retomado: false,
}

describe('CaixasAbertosTable', () => {
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

  it('sem caixas abertos mostra o estado vazio', () => {
    act(() => {
      root.render(<CaixasAbertosTable linhas={[]} locale="pt-BR" labels={labels} />)
    })
    expect(container.textContent).toContain('Nenhum caixa aberto no momento')
  })

  it('mostra operador, valor inicial, sangrias, suprimentos e status Aberto — sem coluna "esperado"', () => {
    act(() => {
      root.render(<CaixasAbertosTable linhas={[aberto]} locale="pt-BR" labels={labels} />)
    })
    const cabecalhos = Array.from(container.querySelectorAll('thead th')).map((th) => th.textContent)
    expect(cabecalhos).toEqual(['Operador', 'Abertura', 'Valor inicial', 'Sangrias', 'Suprimentos', 'Status'])
    const texto = container.querySelector('tbody tr')?.textContent ?? ''
    expect(texto).toContain('João')
    expect(texto).toMatch(/200,00/)
    expect(texto).toMatch(/300,00/)
    expect(texto).toMatch(/100,00/)
    expect(texto).toContain('Aberto')
    expect(texto).not.toContain('Retomado')
  })

  it('turno retomado ganha chip extra', () => {
    act(() => {
      root.render(<CaixasAbertosTable linhas={[{ ...aberto, retomado: true }]} locale="pt-BR" labels={labels} />)
    })
    expect(container.querySelector('tbody tr')?.textContent).toContain('Retomado')
  })
})
