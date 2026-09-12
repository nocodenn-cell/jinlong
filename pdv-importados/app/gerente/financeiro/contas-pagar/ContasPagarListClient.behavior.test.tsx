/** @vitest-environment jsdom */
/**
 * O que a linha de Contas a pagar tem de dizer sem o operador procurar.
 *
 * Requisito literal da sprint: um título de R$ 5.000 com R$ 2.000 pagos precisa
 * mostrar **R$ 3.000 pendente** de imediato. Antes, a linha destacava o valor
 * ORIGINAL e escondia o saldo numa legenda secundária — o número grande era o
 * que menos importava para decidir o dia.
 *
 * Aqui também se fixa a situação derivada (saldo × vencimento), que substituiu
 * o status contábil cru: PENDENTE vencido ontem e PENDENTE que vence em 30 dias
 * apareciam idênticos.
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

// As server actions não rodam em jsdom; a lista recebe os dados por prop.
vi.mock('@/app/gerente/financeiro/contas-pagar/actions', () => ({
  buscarContasPagarAction: vi.fn(async () => ({ ok: true, contas: [], hasMore: false })),
  cancelarContaPagarAction: vi.fn(async () => ({ ok: true })),
  exportarContasPagarParaCSVAction: vi.fn(async () => ({ ok: true, rows: [] })),
  listarPagamentosContaPagarAction: vi.fn(async () => ({ ok: true, pagamentos: [] })),
  estornarPagamentoContaPagarAction: vi.fn(async () => ({ ok: true, status: 'PENDENTE', valor_pago: 0 })),
  registrarPagamentoAction: vi.fn(async () => ({ ok: false, error: 'n/a' })),
  buscarCaixasAbertosPagamentoAction: vi.fn(async () => ({ ok: true, caixas: [] })),
}))

class ObserverStub {
  observe() {}
  disconnect() {}
  unobserve() {}
}
;(globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = ObserverStub

const { ContasPagarListClient } = await import(
  '@/app/gerente/financeiro/contas-pagar/ContasPagarListClient'
)

type Conta = React.ComponentProps<typeof ContasPagarListClient>['contasIniciais'][number]

const LOJA = '11111111-1111-1111-1111-111111111111'

function conta(over: Partial<Conta> = {}): Conta {
  return {
    id: 'c1',
    fornecedor_id: 'f1',
    fornecedor_nome: 'Fornecedor Teste',
    descricao: 'Ordem de compra 50467B28',
    valor_total: 5000,
    valor_pago: 2000,
    vencimento: '2099-12-31',
    status: 'PARCIAL',
    nfe_numero: null,
    nfe_parcela: null,
    nfe_importacao_id: null,
    criado_em: '2026-09-01T12:00:00Z',
    loja_id: LOJA,
    atrasado: false,
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
      React.createElement(ContasPagarListClient, {
        idioma: 'pt',
        locale: 'pt-BR',
        contasIniciais: contas,
        hasMoreInicial: false,
        fornecedoresOpts: [],
        statusInicial: 'todos',
        periodoInicial: '',
        actorLojaId: LOJA,
      }),
    )
  })
}

/** Texto da tabela, com espaços normalizados (inclui NBSP de moeda). */
function textoDaTabela(): string {
  return (container.querySelector('table')?.textContent ?? '').replace(/\s+/g, ' ')
}

function abrirMenuDaPrimeiraLinha(): HTMLElement[] {
  const gatilho = container.querySelector<HTMLButtonElement>(
    'tbody button[aria-haspopup="menu"]',
  )
  expect(gatilho).not.toBeNull()
  flushSync(() => gatilho?.click())
  return Array.from(container.querySelectorAll<HTMLElement>('[role="menuitem"]'))
}

describe('saldo pendente na linha', () => {
  it('R$ 5.000 com R$ 2.000 pagos mostra R$ 3.000 pendente, o original e o pago', () => {
    render([conta()])
    const texto = textoDaTabela()
    expect(texto).toContain('3.000,00')
    expect(texto).toContain('pendente')
    expect(texto).toContain('de R$ 5.000,00')
    expect(texto).toContain('pago R$ 2.000,00')
  })

  it('o saldo é o número dominante da célula, não o valor original', () => {
    render([conta()])
    const dominante = container.querySelector('tbody .text-body.font-bold')
    expect(dominante?.textContent).toContain('3.000,00')
    expect(dominante?.textContent).not.toContain('5.000,00')
  })

  it('título sem nenhum pagamento mostra o total como pendente, sem linha de pago', () => {
    render([conta({ valor_pago: 0, status: 'PENDENTE' })])
    const texto = textoDaTabela()
    expect(texto).toContain('5.000,00')
    expect(texto).toContain('pendente')
    expect(texto).not.toContain('pago R$')
  })

  it('título quitado troca o número por "Quitada" em vez de exibir R$ 0,00 pendente', () => {
    render([conta({ valor_pago: 5000, status: 'PAGO' })])
    const texto = textoDaTabela()
    expect(texto).toContain('Quitada')
    expect(texto).not.toContain('pendente')
  })
})

describe('situação derivada de saldo × vencimento', () => {
  it('parcial com vencimento futuro é "Paga em parte"', () => {
    render([conta()])
    expect(textoDaTabela()).toContain('Paga em parte')
  })

  it('parcial com vencimento no passado é "Parcial · atrasada"', () => {
    render([conta({ vencimento: '2020-01-01' })])
    expect(textoDaTabela()).toContain('Parcial · atrasada')
  })

  it('sem pagamento e vencido é "Atrasada"', () => {
    render([conta({ valor_pago: 0, status: 'PENDENTE', vencimento: '2020-01-01' })])
    expect(textoDaTabela()).toContain('Atrasada')
  })

  it('cancelada continua identificável na lista', () => {
    render([conta({ status: 'CANCELADO' })])
    expect(textoDaTabela()).toContain('Cancelada')
  })
})

describe('ações de linha', () => {
  it('título em aberto oferece pagar, histórico e cancelar no mesmo menu', () => {
    render([conta()])
    const rotulos = abrirMenuDaPrimeiraLinha().map((el) => el.textContent)
    expect(rotulos).toEqual(['Registrar pagamento', 'Histórico de pagamentos', 'Cancelar conta'])
  })

  it('título quitado não oferece pagar nem cancelar, mas mantém o histórico', () => {
    render([conta({ valor_pago: 5000, status: 'PAGO' })])
    const rotulos = abrirMenuDaPrimeiraLinha().map((el) => el.textContent)
    expect(rotulos).toEqual(['Histórico de pagamentos'])
  })

  it('título com NF-e de origem ganha o atalho para a nota', () => {
    render([conta({ nfe_numero: '23577', nfe_importacao_id: 'imp-1' })])
    const rotulos = abrirMenuDaPrimeiraLinha().map((el) => el.textContent)
    expect(rotulos).toContain('Abrir NF-e de origem')
  })

  it('conta de outra loja mantém as ações visíveis, porém desabilitadas e explicadas', () => {
    render([conta({ loja_id: '22222222-2222-2222-2222-222222222222' })])
    const itens = abrirMenuDaPrimeiraLinha()
    const pagar = itens.find((el) => el.textContent === 'Registrar pagamento') as HTMLButtonElement
    const historico = itens.find(
      (el) => el.textContent === 'Histórico de pagamentos',
    ) as HTMLButtonElement
    expect(pagar.disabled).toBe(true)
    expect(pagar.getAttribute('title')).toContain('outra loja')
    // Ler o histórico não é escrever: continua disponível.
    expect(historico.disabled).toBe(false)
  })
})

describe('cancelamento', () => {
  it('pede o motivo num modal que declara a consequência, não num window.prompt', () => {
    const prompt = vi.fn()
    vi.stubGlobal('prompt', prompt)
    render([conta()])
    const cancelar = abrirMenuDaPrimeiraLinha().find((el) => el.textContent === 'Cancelar conta')
    flushSync(() => cancelar?.click())

    expect(prompt).not.toHaveBeenCalled()
    const modal = document.querySelector('[data-testid="motivo-operacao-modal"]')
    expect(modal).not.toBeNull()
    expect(modal?.textContent).toContain('Pagamentos já registrados nesta conta são estornados')
    expect(modal?.querySelector('textarea[name="motivo"]')).not.toBeNull()
    vi.unstubAllGlobals()
  })

  it('o botão de confirmar nasce desabilitado até haver motivo', () => {
    render([conta()])
    const cancelar = abrirMenuDaPrimeiraLinha().find((el) => el.textContent === 'Cancelar conta')
    flushSync(() => cancelar?.click())

    const modal = document.querySelector('[data-testid="motivo-operacao-modal"]')
    const confirmar = Array.from(modal?.querySelectorAll('button') ?? []).find((b) =>
      b.textContent?.includes('Cancelar conta'),
    ) as HTMLButtonElement | undefined
    expect(confirmar?.disabled).toBe(true)
  })
})
