/** @vitest-environment jsdom */
/**
 * UX-007 — Kardex mostrava só a coluna Tipo (a observação técnica alargava a tabela e empurrava
 * data/quantidade para fora da área visível). Agora: Data · Tipo · Qtd · Motivo, sem uuid cru.
 */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const obterKardexProdutoMock = vi.fn()

vi.mock('../actions', () => ({
  obterKardexProduto: (...args: unknown[]) => obterKardexProdutoMock(...args),
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const { KardexSheet, formatObservacaoKardex } = await import('./KardexSheet')

const labels = {
  titulo: 'Kardex',
  semMovimentos: 'Sem movimentos',
  semMovimentosSub: 'sub',
  tipoMap: { DEVOLUCAO: 'Devolução' },
  verAuditoria: 'Ver auditoria',
}

const OP = '3f2c1d4e-1111-4222-8333-444455556666'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  obterKardexProdutoMock.mockReset()
  obterKardexProdutoMock.mockResolvedValue([
    {
      id: 'm1',
      created_at: '2026-09-30T12:00:00Z',
      tipo_codigo: 'DEVOLUCAO',
      quantidade_delta: 2,
      observacao: `devolucao | motivo=troca de tamanho | operacao=${OP}`,
      usuario_nome: 'Maria Souza',
      saldo_apos: 7,
    },
    {
      id: 'm2',
      created_at: '2026-09-29T12:00:00Z',
      tipo_codigo: 'VENDA',
      quantidade_delta: -1,
      observacao: null,
      usuario_nome: null,
      saldo_apos: 5,
    },
  ])
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('formatObservacaoKardex', () => {
  it('mostra só o motivo e esconde o id da operação', () => {
    expect(formatObservacaoKardex(`devolucao | motivo=troca | operacao=${OP}`)).toBe('troca')
  })
  it('sem motivo=, mantém o texto sem o id da operação', () => {
    expect(formatObservacaoKardex(`ajuste manual | operacao=${OP}`)).toBe('ajuste manual')
    expect(formatObservacaoKardex('contagem física')).toBe('contagem física')
  })
  it('vazio/null → string vazia', () => {
    expect(formatObservacaoKardex(null)).toBe('')
    expect(formatObservacaoKardex('')).toBe('')
  })
})

describe('KardexSheet — colunas legíveis (UX-007)', () => {
  async function abrir() {
    await act(async () => {
      root.render(<KardexSheet alvo={{ produtoId: 'p1', produtoNome: 'Caneca' }} onClose={() => {}} labels={labels} />)
      await Promise.resolve()
    })
    await act(async () => {
      await Promise.resolve()
    })
  }

  it('exibe cabeçalhos Data, Tipo, Qtd, Saldo após, Usuário e Motivo e os valores', async () => {
    await abrir()
    const headers = Array.from(document.querySelectorAll('th')).map((th) => th.textContent?.trim())
    expect(headers).toEqual(['Data', 'Tipo', 'Qtd', 'Saldo após', 'Usuário', 'Motivo'])
    const texto = document.body.textContent ?? ''
    expect(texto).toContain('Maria Souza')
    expect(texto).toContain('7')
    expect(texto).toContain('5')
    expect(texto).toContain('30/09/26')
    expect(texto).toContain('Devolução')
    expect(texto).toContain('troca de tamanho')
  })

  it('sem saldo provado a coluna Saldo após some; usuário ausente vira traço', async () => {
    obterKardexProdutoMock.mockResolvedValue([
      {
        id: 'm3',
        created_at: '2026-09-28T12:00:00Z',
        tipo_codigo: 'VENDA',
        quantidade_delta: -1,
        observacao: null,
        usuario_nome: null,
        saldo_apos: null,
      },
    ])
    await abrir()
    const headers = Array.from(document.querySelectorAll('th')).map((th) => th.textContent?.trim())
    expect(headers).toEqual(['Data', 'Tipo', 'Qtd', 'Usuário', 'Motivo'])
  })

  it('não vaza o uuid da operação nem o texto técnico', async () => {
    await abrir()
    const texto = document.body.textContent ?? ''
    expect(texto).not.toContain(OP)
    expect(texto).not.toContain('operacao=')
    expect(texto).not.toContain('motivo=')
  })

  it('motivo longo é truncado com tooltip, sem alargar a tabela', async () => {
    await abrir()
    const celula = Array.from(document.querySelectorAll('td span.truncate')).find(
      (el) => el.getAttribute('title') === 'troca de tamanho',
    ) as HTMLElement
    expect(celula).toBeTruthy()
    expect((celula.closest('td') as HTMLElement).className).toContain('max-w-')
  })
})
