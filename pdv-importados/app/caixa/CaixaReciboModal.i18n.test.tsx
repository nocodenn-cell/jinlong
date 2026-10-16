/** @vitest-environment jsdom */
/**
 * Hardening i18n go-live — CaixaReciboModal (recibo de venda, D0).
 *
 * O corpo do recibo (título do cupom, subtotal, total, formas de pagamento)
 * já era construído via `buildReciboLabels(m)` — catálogo, correto. Só a
 * barra de ferramentas do modal (título do diálogo, botões Imprimir/Fechar,
 * tooltips) estava hardcoded em PT, inconsistente com o resto do mesmo
 * arquivo. Este teste prova que a barra de ferramentas agora segue o idioma
 * da sessão nos dois idiomas, sem tocar em valores, cálculos, pagamentos ou
 * identificação da venda.
 */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getMessages } from '@/i18n/getMessages'
import { CaixaReciboModal } from '@/app/caixa/CaixaReciboModal'
import type { ReciboVenda } from '@/lib/caixa/reciboTypes'
import type { UseThermalPrinterReturn } from '@/hooks/useThermalPrinter'

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

const venda: ReciboVenda = {
  vendaId: 'venda-teste-0001',
  data: new Date('2026-08-27T12:00:00Z'),
  clienteNome: null,
  itens: [
    { nome: 'Produto teste', quantidade: 2, precoUnitario: 10, precoOriginal: 10, tipoPreco: 'VAREJO' },
  ],
  pagamentos: [{ formaPagamento: 'DINHEIRO', valor: 20 }],
  totalBruto: 20,
  totalDesconto: 0,
  totalLiquidoComGerente: 20,
  descontoGerentePercentual: 0,
  valorDescontoGerente: 0,
  moeda: 'R$',
}

const thermal: UseThermalPrinterReturn = {
  supported: false,
  status: 'idle',
  deviceInfo: null,
  savedInfo: null,
  errorMsg: null,
  connect: vi.fn(async () => {}),
  printRecibo: vi.fn(async () => {}),
  abrirGaveta: vi.fn(async () => true),
  disconnect: vi.fn(async () => {}),
}

function renderModal(m: ReturnType<typeof getMessages>) {
  act(() => {
    root.render(
      <CaixaReciboModal
        venda={venda}
        m={m}
        onClose={() => {}}
        onNovaVenda={() => {}}
        onFinalizarCaixa={() => {}}
        thermal={thermal}
      />,
    )
  })
}

describe('CaixaReciboModal — barra de ferramentas no idioma da sessão', () => {
  it('PT: título, imprimir e fechar aparecem em português', () => {
    const m = getMessages('pt')
    renderModal(m)

    expect(container.textContent).toContain(m.caixa.modal_recibo_venda_titulo)
    expect(container.textContent).toContain(m.caixa.btn_imprimir_comprovante)
    expect(container.textContent).toContain(m.caixa.btn_fechar_comprovante)

    // não mexe no corpo do recibo (já catalog-driven) nem em valores/venda
    expect(container.textContent).toContain(m.caixa.recibo.total)
    expect(container.textContent).toContain('Produto teste')
    expect(container.textContent).toContain('venda-teste-0001'.slice(0, 8).toUpperCase())
  })

  it('中文: título, imprimir e fechar aparecem em chinês, não em português', () => {
    const m = getMessages('zh')
    const mPt = getMessages('pt')
    renderModal(m)

    expect(container.textContent).toContain(m.caixa.modal_recibo_venda_titulo)
    expect(container.textContent).toContain(m.caixa.btn_imprimir_comprovante)
    expect(container.textContent).toContain(m.caixa.btn_fechar_comprovante)
    expect(container.textContent).not.toContain(mPt.caixa.modal_recibo_venda_titulo)
    expect(container.textContent).not.toContain(mPt.caixa.btn_imprimir_comprovante)
  })

  it('o tooltip do botão de impressão também segue o idioma', () => {
    const m = getMessages('zh')
    renderModal(m)

    const printBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes(m.caixa.btn_imprimir_comprovante),
    ) as HTMLButtonElement
    expect(printBtn.title).toBe(m.caixa.modal_recibo_venda_imprimir_janela_hint)
  })
})

/**
 * Regressão: o botão de impressão térmica usa `loading` (do design system),
 * que injeta um `<span className="sr-only">Carregando</span>` sempre em PT
 * (componente compartilhado, fora do escopo deste hardening). Sem um
 * `aria-label` explícito e traduzido, o nome acessível durante "conectando"/
 * "imprimindo" ficava PT+中文 misturado para leitor de tela em 中文.
 */
describe('CaixaReciboModal — botão de impressão térmica (WebUSB)', () => {
  const originalUsb = (globalThis.navigator as unknown as { usb?: unknown }).usb

  beforeEach(() => {
    Object.defineProperty(globalThis.navigator, 'usb', {
      value: {},
      configurable: true,
    })
  })

  afterEach(() => {
    Object.defineProperty(globalThis.navigator, 'usb', {
      value: originalUsb,
      configurable: true,
    })
  })

  it('中文: aria-label do botão térmico é estável e traduzido mesmo durante "conectando" (loading)', () => {
    const m = getMessages('zh')
    const thermalConectando: UseThermalPrinterReturn = { ...thermal, status: 'connecting' }
    act(() => {
      root.render(
        <CaixaReciboModal
          venda={venda}
          m={m}
          onClose={() => {}}
          onNovaVenda={() => {}}
          onFinalizarCaixa={() => {}}
          thermal={thermalConectando}
        />,
      )
    })

    const termicoBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes(m.caixa.modal_recibo_venda_conectando),
    ) as HTMLButtonElement
    expect(termicoBtn.getAttribute('aria-label')).toBe(m.caixa.modal_recibo_venda_imprimir_termica)
    // nunca deve conter o "Carregando" em PT do design system como parte do nome acessível anunciado
    expect(termicoBtn.getAttribute('aria-label')).not.toContain('Carregando')
  })

  function botoesImpressao(m: ReturnType<typeof getMessages>) {
    const botoes = Array.from(container.querySelectorAll('button'))
    return {
      termica: botoes.find(
        (b) => b.getAttribute('aria-label') === m.caixa.modal_recibo_venda_imprimir_termica,
      ),
      navegador: botoes.find((b) => b.textContent?.includes(m.caixa.btn_imprimir_comprovante)),
    }
  }

  it('com WebUSB: mostra os DOIS botões (térmica e navegador)', () => {
    const m = getMessages('pt')
    renderModal(m)
    const { termica, navegador } = botoesImpressao(m)
    expect(termica).toBeDefined()
    expect(navegador).toBeDefined()
    expect(navegador?.title).toBe(m.caixa.modal_recibo_venda_imprimir_janela_hint)
  })

  it('sem WebUSB: mostra só o botão de navegador', () => {
    delete (globalThis.navigator as unknown as { usb?: unknown }).usb
    const m = getMessages('pt')
    renderModal(m)
    const { termica, navegador } = botoesImpressao(m)
    expect(termica).toBeUndefined()
    expect(navegador).toBeDefined()
  })
})

describe('CaixaReciboModal — loja e 2ª via no cabeçalho', () => {
  function renderCom(m: ReturnType<typeof getMessages>, extra: { lojaNome?: string | null; segundaVia?: boolean }) {
    act(() => {
      root.render(
        <CaixaReciboModal
          venda={venda}
          m={m}
          onClose={() => {}}
          onNovaVenda={() => {}}
          onFinalizarCaixa={() => {}}
          thermal={thermal}
          {...extra}
        />,
      )
    })
  }

  it('mostra o nome da loja quando informado', () => {
    renderCom(getMessages('pt'), { lojaNome: 'Loja Centro' })
    expect(container.textContent).toContain('Loja Centro')
  })

  it('cupom original não mostra a marca de 2ª via', () => {
    renderCom(getMessages('pt'), { segundaVia: false })
    expect(container.querySelector('[data-testid="caixa-recibo-segunda-via"]')).toBeNull()
  })

  it('reimpressão mostra a marca no idioma da sessão (pt e zh)', () => {
    for (const idioma of ['pt', 'zh'] as const) {
      const m = getMessages(idioma)
      renderCom(m, { segundaVia: true })
      expect(container.querySelector('[data-testid="caixa-recibo-segunda-via"]')?.textContent).toBe(
        m.caixa.recibo.segunda_via,
      )
    }
  })
})
