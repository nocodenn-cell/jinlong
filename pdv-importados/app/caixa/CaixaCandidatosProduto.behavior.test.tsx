/** @vitest-environment jsdom */
/**
 * Regressão do achado de review (Codex, PR #351): o cabeçalho da lista de
 * candidatos vinha do servidor em português puro, ignorando o idioma da
 * sessão — a dica de teclado abaixo (via `m.caixa.*`) já era traduzida,
 * deixando a UI com mistura de idiomas para um operador em chinês.
 * `candidatos_titulo` (pt/zh) existia no dicionário mas nunca era usado.
 */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CaixaCandidatosProduto, candidatoOptionId } from './CaixaCandidatosProduto'
import type { Mensagens } from '@/i18n/getMessages'
import type { ProdutoCaixaDTO } from '@/app/caixa/caixaActionTypes'

function mensagens(candidatos_titulo: string): Mensagens {
  return {
    caixa: {
      candidatos_titulo,
      candidatos_hint_teclado: '↑ ↓ · Enter · Esc',
      candidatos_aria_label: 'Produtos encontrados',
      candidatos_selecionar_aria: 'Selecionar {{nome}}',
      candidatos_badge_sem_estoque: 'Sem estoque',
      candidatos_badge_estoque_baixo: 'Estoque baixo',
    },
  } as unknown as Mensagens
}

function produto(overrides: Partial<ProdutoCaixaDTO>): ProdutoCaixaDTO {
  return {
    id: 'p-1',
    nome: 'Cadeira Vermelha',
    codigo_barras: '7891000000001',
    codigo_interno: null,
    preco_varejo: 150,
    preco_atacado: null,
    quantidade_gatilho_atacado: null,
    quantidade_estoque: 10,
    estoque_minimo: 2,
    ...overrides,
  } as ProdutoCaixaDTO
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

describe('CaixaCandidatosProduto — idioma da sessão (Codex PR #351)', () => {
  it('PT: usa o título localizado do dicionário, não uma mensagem crua do servidor', () => {
    flushSync(() => {
      root.render(
        <CaixaCandidatosProduto
          m={mensagens('Vários produtos encontrados — escolha um:')}
          idioma="pt"
          itens={[produto({})]}
          ativoIndex={0}
          onHoverIndex={() => {}}
          onSelecionar={() => {}}
        />,
      )
    })
    expect(container.textContent).toContain('Vários produtos encontrados — escolha um:')
  })

  it('ZH: usa o título em chinês, não a frase em português vinda do servidor', () => {
    flushSync(() => {
      root.render(
        <CaixaCandidatosProduto
          m={mensagens('找到多个商品——请选择一个：')}
          idioma="zh"
          itens={[produto({})]}
          ativoIndex={0}
          onHoverIndex={() => {}}
          onSelecionar={() => {}}
        />,
      )
    })
    expect(container.textContent).toContain('找到多个商品——请选择一个：')
    expect(container.textContent).not.toContain('Vários produtos')
  })
})

describe('CaixaCandidatosProduto — id estável da opção (a11y, Codex PR #351)', () => {
  it('cada opção tem o id previsível usado por aria-activedescendant no campo de busca', () => {
    flushSync(() => {
      root.render(
        <CaixaCandidatosProduto
          m={mensagens('t')}
          idioma="pt"
          itens={[produto({ id: 'p-verm' }), produto({ id: 'p-verd', nome: 'Cadeira Verde' })]}
          ativoIndex={0}
          onHoverIndex={() => {}}
          onSelecionar={() => {}}
        />,
      )
    })
    expect(document.getElementById(candidatoOptionId('p-verm'))).not.toBeNull()
    expect(document.getElementById(candidatoOptionId('p-verd'))).not.toBeNull()
  })

  it('onSelecionar dispara com o produto clicado', () => {
    const onSelecionar = vi.fn()
    const p = produto({ id: 'p-verm' })
    flushSync(() => {
      root.render(
        <CaixaCandidatosProduto
          m={mensagens('t')}
          idioma="pt"
          itens={[p]}
          ativoIndex={0}
          onHoverIndex={() => {}}
          onSelecionar={onSelecionar}
        />,
      )
    })
    const btn = document.getElementById(candidatoOptionId('p-verm')) as HTMLButtonElement
    flushSync(() => {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onSelecionar).toHaveBeenCalledWith(p)
  })
})
