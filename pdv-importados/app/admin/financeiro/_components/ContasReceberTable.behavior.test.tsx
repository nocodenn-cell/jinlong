/** @vitest-environment jsdom */
/**
 * O que a linha de Contas a receber tem de dizer, e o que ela tem de permitir.
 *
 * O defeito que originou esta tela: a liquidação vivia num painel separado que
 * fazia `abertas.slice(0, 8)` — do nono título em aberto em diante, NÃO HAVIA
 * como registrar recebimento pela interface. O primeiro bloco abaixo é o guarda
 * de regressão disso: 12 títulos, 12 ações de receber.
 */
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
  } & Record<string, unknown>) => React.createElement('a', { href, ...rest }, children),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))

vi.mock('@/app/gerente/financeiro/actions', () => ({
  liquidarTitulo: vi.fn(async () => ({ success: true, data: null })),
  criarTituloReceber: vi.fn(async () => ({ success: true, data: 'novo' })),
  listarLiquidacoesReceber: vi.fn(async () => ({ success: true, data: [] })),
  estornarLiquidacaoReceber: vi.fn(async () => ({ success: true, data: null })),
}))

const { ContasReceberTable } = await import(
  '@/app/admin/financeiro/_components/ContasReceberTable'
)

type Conta = React.ComponentProps<typeof ContasReceberTable>['contas'][number]

const LOJA = '11111111-1111-1111-1111-111111111111'

function conta(over: Partial<Conta> = {}): Conta {
  return {
    id: 'tit-1',
    cliente_nome: 'Mercado do Zé',
    valor_total: 5000,
    valor_aberto: 3000,
    valor_pago: 2000,
    status: 'PARCIAL',
    vencimento: '2099-12-31',
    descricao: 'Fiado de fevereiro',
    loja_id: LOJA,
    venda_id: null,
    ...over,
  }
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

function render(contas: Conta[]) {
  flushSync(() => {
    root.render(
      React.createElement(ContasReceberTable, {
        contas,
        labels: { vazioTitulo: 'Nenhum título', vazioSub: 'Ajuste os filtros', locale: 'pt-BR' },
        idioma: 'pt',
        caixasAbertos: [],
        actorLojaId: LOJA,
      }),
    )
  })
}

function textoDaTabela(): string {
  return (container.querySelector('table')?.textContent ?? '').replace(/\s+/g, ' ')
}

function gatilhos(): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll<HTMLButtonElement>('tbody button[aria-haspopup="menu"]'))
}

function abrirMenu(indice = 0): HTMLElement[] {
  const g = gatilhos()[indice]
  expect(g).toBeDefined()
  flushSync(() => g.click())
  return Array.from(container.querySelectorAll<HTMLElement>('[role="menuitem"]'))
}

describe('sem limite artificial de linhas acionáveis', () => {
  it('12 títulos em aberto rendem 12 menus de ação — o nono não fica órfão', () => {
    const muitos = Array.from({ length: 12 }, (_, i) =>
      conta({ id: `tit-${i}`, cliente_nome: `Cliente ${i}` }),
    )
    render(muitos)
    expect(gatilhos()).toHaveLength(12)
  })

  it('o 9º, o 10º e o 12º títulos oferecem "Registrar recebimento" como qualquer outro', () => {
    const muitos = Array.from({ length: 12 }, (_, i) =>
      conta({ id: `tit-${i}`, cliente_nome: `Cliente ${i}` }),
    )
    render(muitos)
    for (const indice of [8, 9, 11]) {
      const rotulos = abrirMenu(indice).map((el) => el.textContent)
      expect(rotulos, `título de índice ${indice}`).toContain('Registrar recebimento')
      flushSync(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      })
    }
  })
})

describe('saldo em aberto na linha', () => {
  it('R$ 5.000 com R$ 2.000 recebidos mostra R$ 3.000 a receber, o total e o recebido', () => {
    render([conta()])
    const texto = textoDaTabela()
    expect(texto).toContain('3.000,00')
    expect(texto).toContain('a receber')
    expect(texto).toContain('de R$ 5.000,00')
    expect(texto).toContain('recebido R$ 2.000,00')
  })

  it('o saldo é o número dominante, não o valor original', () => {
    render([conta()])
    const dominante = container.querySelector('tbody .text-body.font-bold')
    expect(dominante?.textContent).toContain('3.000,00')
    expect(dominante?.textContent).not.toContain('5.000,00')
  })

  it('título quitado mostra "Recebida" em vez de R$ 0,00 a receber', () => {
    render([conta({ valor_aberto: 0, valor_pago: 5000, status: 'QUITADO' })])
    const texto = textoDaTabela()
    expect(texto).toContain('Recebida')
    expect(texto).not.toContain('a receber')
  })
})

describe('situação derivada de saldo × vencimento', () => {
  it('parcial com vencimento futuro é "Recebida em parte"', () => {
    render([conta()])
    expect(textoDaTabela()).toContain('Recebida em parte')
  })

  it('parcial vencido é "Parcial · vencida"', () => {
    render([conta({ vencimento: '2020-01-01' })])
    expect(textoDaTabela()).toContain('Parcial · vencida')
  })

  it('sem nenhum recebimento e vencido é "Vencida"', () => {
    render([conta({ valor_aberto: 5000, valor_pago: 0, status: 'ABERTO', vencimento: '2020-01-01' })])
    expect(textoDaTabela()).toContain('Vencida')
  })

  it('título cancelado continua identificável na lista', () => {
    render([conta({ status: 'CANCELADO' })])
    expect(textoDaTabela()).toContain('Cancelada')
  })
})

describe('origem do título', () => {
  it('título vindo de uma venda mostra a origem e oferece o atalho para ela', () => {
    const vendaId = 'abcdef12-3456-7890-abcd-ef1234567890'
    render([conta({ venda_id: vendaId })])
    expect(textoDaTabela()).toContain('Venda ABCDEF12')

    const rotulos = abrirMenu().map((el) => el.textContent)
    expect(rotulos).toContain('Abrir venda de origem')

    const link = container.querySelector<HTMLAnchorElement>('a[role="menuitem"]')
    expect(link?.getAttribute('href')).toContain(`venda=${vendaId}`)
  })

  it('título lançado à mão diz que é manual e não oferece atalho de venda', () => {
    render([conta({ venda_id: null })])
    expect(textoDaTabela()).toContain('Lançamento manual')
    expect(abrirMenu().map((el) => el.textContent)).not.toContain('Abrir venda de origem')
  })
})

describe('ações de linha', () => {
  it('título em aberto oferece receber e histórico', () => {
    render([conta()])
    expect(abrirMenu().map((el) => el.textContent)).toEqual([
      'Registrar recebimento',
      'Histórico de recebimentos',
    ])
  })

  it('título quitado não oferece receber, mas mantém o histórico', () => {
    render([conta({ valor_aberto: 0, valor_pago: 5000, status: 'QUITADO' })])
    expect(abrirMenu().map((el) => el.textContent)).toEqual(['Histórico de recebimentos'])
  })

  it('título de outra loja mantém as ações visíveis, desabilitadas e explicadas', () => {
    render([conta({ loja_id: '22222222-2222-2222-2222-222222222222' })])
    const itens = abrirMenu()
    const receber = itens.find((el) => el.textContent === 'Registrar recebimento') as HTMLButtonElement
    const historico = itens.find(
      (el) => el.textContent === 'Histórico de recebimentos',
    ) as HTMLButtonElement
    expect(receber.disabled).toBe(true)
    expect(receber.getAttribute('title')).toContain('outra loja')
    // Ler o histórico não é escrever: continua disponível.
    expect(historico.disabled).toBe(false)
  })

  it('abre o modal de recebimento com o saldo pré-preenchido, não um formulário na linha', () => {
    render([conta()])
    const receber = abrirMenu().find((el) => el.textContent === 'Registrar recebimento')
    flushSync(() => receber?.click())

    const modal = document.querySelector('[data-testid="receber-titulo-modal"]')
    expect(modal).not.toBeNull()
    const valor = modal?.querySelector<HTMLInputElement>('#ar-valor')
    expect(valor?.value).toBe('3.000,00')
  })
})
