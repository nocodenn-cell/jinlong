/**
 * Critérios de UX do desconto no /caixa (baseline clássico pós-#471):
 * - desconto manual não fica exposto na tela principal
 * - desconto comercial no dinheiro é gaveta fechada por padrão
 * - selecionar Dinheiro não abre a gaveta automaticamente
 * - desconto gerente continua acessível e separado do comercial
 *
 * @vitest-environment jsdom
 */
import React from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CaixaPdvOperadorTabs } from '@/app/caixa/CaixaPdvOperadorTabs'
import { CaixaDescontoComercialDinheiro } from '@/app/caixa/CaixaDescontoComercialDinheiro'
import type { FormaPagamento } from '@/app/caixa/hooks/useCaixaPagamentos'
import type { Mensagens } from '@/i18n/getMessages'

const mockMensagens = {
  caixa: {
    pdv_tab_aria_pgto: 'Pagamento',
    pdv_pgto_parcelas_titulo: 'Formas de pagamento',
    pdv_pgto_auto_completar: 'Auto-completar',
    aria_parcela_forma: 'Forma da parcela {{n}}',
    aria_remover_parcela: 'Remover parcela {{n}}',
    aria_parcela_valor: 'Valor da parcela {{n}}',
    aria_adicionar_parcela: 'Adicionar forma',
    pdv_pgto_adicionar_forma: 'Adicionar forma',
    pdv_pgto_max_parcelas: 'Máximo de formas',
    total_pagar: 'Total a pagar',
    pdv_pgto_soma_parcelas: 'Soma',
    pdv_pgto_troco_cliente: 'Troco',
    pdv_pgto_diferenca: 'Falta',
    pdv_pgto_excesso_sem_dinheiro: 'Excesso sem troco',
    pdv_pgto_valor_recebido: 'Recebido R$',
    validar_gerente: 'Desconto gerente',
  },
  gerente: {
    pagamento_dinheiro: 'Dinheiro',
  },
} as unknown as Mensagens

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

function renderComercial(forma: FormaPagamento, onDescontoDinheiro = vi.fn()) {
  const panel = (
    <CaixaDescontoComercialDinheiro
      idioma="pt"
      subtotal={100}
      descontoPercentualAtual={0}
      onSolicitar={vi.fn()}
      onLimpar={vi.fn()}
    />
  )
  flushSync(() => {
    root.render(
      <CaixaPdvOperadorTabs
        m={mockMensagens}
        pagamentos={[{ formaPagamento: forma, valor: 100 }]}
        totalLiquidoComGerente={100}
        somaParcelas={100}
        diferenca={0}
        podeAdicionarParcela
        formasDisponiveis={['DINHEIRO', 'PIX', 'CARTAO_CREDITO', 'CARTAO_DEBITO']}
        onAdicionarParcela={() => {}}
        onRemoverParcela={() => {}}
        onAtualizarForma={() => {}}
        onAtualizarValor={() => {}}
        onAutoCompletar={() => {}}
        onDescontoDinheiro={onDescontoDinheiro}
        descontoComercialPanel={panel}
        moedaPrefixo="R$"
        produtoPanel={<div data-testid="produto-panel">busca</div>}
      />,
    )
  })
}

describe('UI desconto /caixa — exposição e gaveta', () => {
  it('CaixaPageClient não monta Desconto manual na tela principal', () => {
    const src = readFileSync(join(__dirname, 'CaixaPageClient.tsx'), 'utf8')
    expect(src).not.toMatch(/CaixaDescontoManual/)
    expect(src).not.toMatch(/<CaixaDescontoManual[\s/>]/)
    expect(src).toMatch(/CaixaDescontoComercialDinheiro/)
    expect(src).toMatch(/onDescontoDinheiro=\{abrirGerenteModal\}/)
    expect(src).toMatch(/onValidarGerente=\{abrirGerenteModal\}/)
  })

  it('selecionar Dinheiro mostra a gaveta fechada (não abre sozinha)', () => {
    renderComercial('DINHEIRO')
    const gaveta = container.querySelector(
      '[data-testid="caixa-desconto-comercial-dinheiro"]',
    ) as HTMLDetailsElement | null
    expect(gaveta).toBeTruthy()
    expect(gaveta!.open).toBe(false)
    expect(container.textContent).toContain('Desconto comercial no dinheiro')
    expect(container.textContent).toContain('Desconto gerente')
  })

  it('PIX não mostra a gaveta comercial (só dinheiro)', () => {
    renderComercial('PIX')
    expect(
      container.querySelector('[data-testid="caixa-desconto-comercial-dinheiro"]'),
    ).toBeNull()
  })

  it('troca Dinheiro → PIX remove a gaveta sem estado incorreto; volta Dinheiro fechada', () => {
    renderComercial('DINHEIRO')
    const gaveta = container.querySelector(
      '[data-testid="caixa-desconto-comercial-dinheiro"]',
    ) as HTMLDetailsElement
    gaveta.open = true
    expect(gaveta.open).toBe(true)

    renderComercial('PIX')
    expect(
      container.querySelector('[data-testid="caixa-desconto-comercial-dinheiro"]'),
    ).toBeNull()

    renderComercial('DINHEIRO')
    const novamente = container.querySelector(
      '[data-testid="caixa-desconto-comercial-dinheiro"]',
    ) as HTMLDetailsElement
    expect(novamente).toBeTruthy()
    expect(novamente.open).toBe(false)
  })

  it('desconto gerente permanece acessível e separado do comercial', () => {
    const onGerente = vi.fn()
    renderComercial('DINHEIRO', onGerente)
    const btn = container.querySelector(
      '[data-testid="caixa-desconto-dinheiro"]',
    ) as HTMLButtonElement | null
    expect(btn).toBeTruthy()
    expect(btn!.textContent).toMatch(/Desconto gerente/i)
    btn!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onGerente).toHaveBeenCalledTimes(1)
  })
})
