/** @vitest-environment jsdom */
/**
 * Smoke estrutural do layout 3 colunas / drawer F3 — sem montar o CaixaPageClient inteiro.
 */
import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CaixaCheckoutTotaisPanel } from '@/app/caixa/CaixaCheckoutTotaisPanel'
import { CaixaDescontoDrawer } from '@/app/caixa/CaixaDescontoDrawer'
import { CaixaAtalhosProdutosGrid } from '@/app/caixa/CaixaAtalhosProdutosGrid'
import { CAIXA_ATALHOS_PRODUTOS_PADRAO } from '@/app/caixa/caixaAtalhosProdutos'
import type { Mensagens } from '@/i18n/getMessages'

vi.mock('@/app/caixa/CaixaDescontoManual', () => ({
  CaixaDescontoManual: () => <div data-testid="mock-desconto-manual" />,
}))
vi.mock('@/app/caixa/CaixaDescontoComercialDinheiro', () => ({
  CaixaDescontoComercialDinheiro: () => <div data-testid="mock-desconto-comercial" />,
}))

const m = {
  caixa: {
    bruto: 'Subtotal',
    descontos_regras: 'Desconto',
    cart_bar_total_label: 'Total',
    pdv_pgto_valor_recebido: 'Recebido',
    pdv_pgto_troco_cliente: 'Troco',
    finalizar_venda: 'Finalizar venda',
    finalizando: 'Finalizando…',
    pdv_tab_aria_pgto: 'Pagamento',
  },
} as unknown as Mensagens

describe('CaixaCheckoutTotaisPanel', () => {
  it('oculta linha de desconto quando zero e mostra resumo quando aplicado', () => {
    const onAbrirDesconto = vi.fn()
    const { rerender } = render(
      <CaixaCheckoutTotaisPanel
        m={m}
        moedaPrefixo="R$"
        subtotal={100}
        descontoTotal={0}
        totalFinal={100}
        onAbrirDesconto={onAbrirDesconto}
        onFinalizar={vi.fn()}
        finalizando={false}
        finalizarDisabled={false}
        metodoPagamentoPanel={<div data-testid="metodo-pgto" />}
      />,
    )
    expect(screen.queryByTestId('caixa-desconto-resumo')).toBeNull()
    expect(screen.getByTestId('caixa-abrir-desconto').textContent).toMatch(/Aplicar desconto/)

    rerender(
      <CaixaCheckoutTotaisPanel
        m={m}
        moedaPrefixo="R$"
        subtotal={100}
        descontoTotal={10}
        totalFinal={90}
        descontoPercentual={10}
        valorRecebido={100}
        troco={10}
        onAbrirDesconto={onAbrirDesconto}
        onFinalizar={vi.fn()}
        finalizando={false}
        finalizarDisabled={false}
        metodoPagamentoPanel={<div data-testid="metodo-pgto" />}
      />,
    )
    expect(screen.getByTestId('caixa-desconto-resumo')).toBeTruthy()
    expect(screen.getByTestId('caixa-total-liquido').textContent).toMatch(/90/)
    expect(screen.getByTestId('caixa-troco-destaque').textContent).toMatch(/10/)
    expect(screen.getByTestId('caixa-abrir-desconto').textContent).toMatch(/10/)
    fireEvent.click(screen.getByTestId('caixa-abrir-desconto'))
    expect(onAbrirDesconto).toHaveBeenCalledOnce()
  })
})

describe('CaixaDescontoDrawer', () => {
  it('abre com tabs e fecha pelo botão do DragonModal', () => {
    const onClose = vi.fn()
    render(
      <CaixaDescontoDrawer
        open
        onClose={onClose}
        idioma="pt"
        limiteManual={10}
        subtotal={100}
        descontoPercentualAtual={0}
        onSolicitarComercial={vi.fn()}
        onLimparComercial={vi.fn()}
        onAbrirGerente={vi.fn()}
        podeComercialDinheiro
      />,
    )
    expect(screen.getByTestId('caixa-desconto-drawer')).toBeTruthy()
    expect(screen.getByTestId('mock-desconto-manual')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(onClose).toHaveBeenCalled()
  })
})

describe('CaixaAtalhosProdutosGrid', () => {
  it('dispara código do atalho ao clicar', () => {
    const onSelecionar = vi.fn()
    render(
      <CaixaAtalhosProdutosGrid
        atalhos={CAIXA_ATALHOS_PRODUTOS_PADRAO}
        onSelecionar={onSelecionar}
      />,
    )
    fireEvent.click(screen.getByText('Água'))
    expect(onSelecionar).toHaveBeenCalledWith('agua')
  })
})
