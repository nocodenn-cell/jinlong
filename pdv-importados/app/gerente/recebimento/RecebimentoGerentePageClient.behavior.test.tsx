/** @vitest-environment jsdom */
/**
 * Recebimento manual ("Entrada sem nota") — comportamento do formulário.
 *
 * (1) UX-04: "Como chegou?" — NF-e (link), Ordem de Compra ou Sem documento. Só com "Ordem de
 *     Compra" o campo do pedido aparece e vira obrigatório; a entrada abate o saldo do pedido
 *     (o banco decide) e a tela mostra o que mudou: estoque, quanto falta, se o pedido fechou.
 * (1b) Sem documento não há "quantidade esperada": o campo some, a action assume esperada =
 *     conferida e o feedback mostra produto, quantidade e saldo novo. Só o modo Pedido mostra
 *     "esperada" (e a divergência).
 * (2) A1: depois de confirmar a entrada o formulário volta ao estado inicial. Com os campos
 *     preenchidos e uma nova chave de idempotência, um segundo clique criava outra entrada
 *     (e outro crédito de estoque).
 */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const criarRemessaMock = vi.fn()
const listarOcMock = vi.fn()
const detalheOcMock = vi.fn()
const toastMock = vi.fn()

vi.mock('../estoque/importar-nfe/ImportarNfePageClient', () => ({ ImportarNfePageClient: () => React.createElement('div', { 'data-testid': 'entrada-manual-financeira' }, 'Entrada manual com quantidade, valor e parcelas') }))
vi.mock('./actions', () => ({
  criarRemessaConferencia: (...a: unknown[]) => criarRemessaMock(...a),
  buscarProdutosRecebimento: vi.fn(async () => ({ success: true, data: [] })),
}))
vi.mock('../compras/actions', () => ({
  listarOrdensCompraElegiveisParaVinculo: (...a: unknown[]) => listarOcMock(...a),
  obterOrdemCompraDetalhe: (...a: unknown[]) => detalheOcMock(...a),
}))
vi.mock('@/lib/gerente/toast', () => ({ emitGerenteToast: (...a: unknown[]) => toastMock(...a) }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/admin/estoque/recebimento',
  useSearchParams: () => new URLSearchParams(),
}))

const { RecebimentoGerentePageClient } = await import('./RecebimentoGerentePageClient')
const { AdminV2SessionProvider } = await import('@/components/ui/admin-v2/AdminV2SessionContext')

const PRODUTO = { id: 'p1', nome: 'Produto A', codigo_barras: null }
const OC_ID = 'oc-11112222-3333-4444-5555-666677778888'

const OC_LISTA = {
  id: OC_ID,
  fornecedor_id: 'f1',
  fornecedor_nome: 'Fornecedor Alfa',
  status: 'EM_TRANSITO',
  data_emissao: '2026-09-01',
  data_prevista_chegada: null,
  observacao: null,
  total_itens: 1,
  valor_total: 300,
  created_at: '2026-09-01T00:00:00Z',
  pedido_total: 100,
  recebido_total: 0,
  pendente_total: 100,
  encerrada_com_falta: false,
  encerramento_motivo: null,
}

const OC_DETALHE = {
  ...OC_LISTA,
  itens: [
    {
      id: 'it-1',
      produto_id: 'p1',
      produto_nome: 'Produto A',
      descricao: null,
      quantidade: 100,
      preco_unitario: 3,
      quantidade_recebida: 0,
      saldo_pendente: 100,
      unidade_medida: 'UN',
    },
  ],
  entradas: [],
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.useFakeTimers()
  criarRemessaMock.mockReset()
  listarOcMock.mockReset()
  detalheOcMock.mockReset()
  toastMock.mockReset()
  listarOcMock.mockResolvedValue([OC_LISTA])
  detalheOcMock.mockResolvedValue({ success: true, data: OC_DETALHE })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.useRealTimers()
})

async function renderizar(
  opts: { idioma?: 'pt' | 'zh'; preSelecionado?: boolean; hubNav?: React.ReactNode } = {},
) {
  const idioma = opts.idioma ?? 'pt'
  await act(async () => {
    root.render(
      <AdminV2SessionProvider idioma={idioma}>
        <RecebimentoGerentePageClient
          idioma={idioma}
          temProdutos
          remessasRecentes={[]}
          embeddedInAdminHub
          produtoPreSelecionado={opts.preSelecionado ? PRODUTO : null}
          hubNav={opts.hubNav}
        />
      </AdminV2SessionProvider>,
    )
  })
}

function definirValor(input: HTMLInputElement, valor: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  setter.call(input, valor)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function form(): HTMLFormElement {
  return container.querySelector('#recebimento-form') as HTMLFormElement
}

function campo(nome: string): HTMLInputElement {
  return form().querySelector(`input[name="${nome}"]`) as HTMLInputElement
}

function botaoVia(rotulo: string): HTMLButtonElement {
  return Array.from(container.querySelectorAll('[data-testid="rec-como-chegou"] button')).find(
    (b) => b.textContent?.trim().startsWith(rotulo),
  ) as HTMLButtonElement
}

async function escolherPedidoNaLista() {
  // o combobox do pedido vem depois do de produto
  const busca = Array.from(container.querySelectorAll('input[role="combobox"]')).at(-1) as HTMLInputElement
  act(() => {
    busca.dispatchEvent(new Event('focus', { bubbles: true }))
    definirValor(busca, 'Alfa')
  })
  await act(async () => {
    vi.advanceTimersByTime(300)
    await Promise.resolve()
    await Promise.resolve()
  })
  const opcao = container.querySelector('button[role="option"]') as HTMLButtonElement
  expect(opcao).toBeTruthy()
  // a opção mostra quanto falta do pedido
  expect(opcao.textContent).toContain('Faltam 100')
  await act(async () => {
    opcao.click()
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('RecebimentoGerentePageClient — abas do hub', () => {
  it('renderiza as abas (hubNav) logo abaixo do título, nunca acima', async () => {
    await renderizar({ hubNav: <nav data-testid="hub-nav">abas</nav> })

    const titulo = container.querySelector('h1')!
    const nav = container.querySelector('[data-testid="hub-nav"]')!
    expect(titulo).toBeTruthy()
    expect(nav).toBeTruthy()
    expect(titulo.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(titulo.closest('header')!.nextElementSibling).toBe(nav)
  })
})

describe('RecebimentoGerentePageClient — "Como chegou?" (UX-04)', () => {
  it('pt: oferece NF-e (link para a importação), Ordem de Compra e Sem documento; começa em Sem documento, sem campo de pedido', async () => {
    await renderizar({ idioma: 'pt' })

    const faixa = container.querySelector('[data-testid="rec-como-chegou"]')
    expect(faixa?.textContent).toContain('Como chegou?')
    const nfe = botaoVia('Nota fiscal (com valores)')
    expect(nfe).toBeTruthy()
    expect(botaoVia('Histórico de entradas')).toBeTruthy()
    expect(botaoVia('Ordem de Compra')).toBeTruthy()
    expect(botaoVia('Sem documento').getAttribute('aria-pressed')).toBe('true')

    // Sem documento: nenhum vínculo é enviado — entrada avulsa como sempre foi
    expect((form()?.querySelector('#rec-oc') ?? null)).toBeNull()
    expect((form()?.querySelector('input[name="ordem_compra_id"]') ?? null)).toBeNull()
  })

  it('pt: escolher "Ordem de Compra" mostra o campo do pedido com a ajuda nova (abate o saldo, item a item)', async () => {
    await renderizar({ idioma: 'pt' })
    await act(async () => botaoVia('Ordem de Compra').click())

    const hint = container.querySelector('#rec-oc-hint')
    expect(hint?.textContent).toContain('saldo pendente deste pedido')
    // o texto antigo ("não dá baixa", "duplicaria o estoque") não pode mais aparecer
    expect(container.textContent).not.toContain('Ele não dá baixa no pedido')
    expect(container.textContent).not.toContain('duplicaria o estoque')
    expect(botaoVia('Ordem de Compra').getAttribute('aria-pressed')).toBe('true')
  })

  it('zh: a faixa e a ajuda existem sem chave faltando', async () => {
    await renderizar({ idioma: 'zh' })
    const faixa = container.querySelector('[data-testid="rec-como-chegou"]')
    expect(faixa?.textContent).not.toContain('undefined')
    expect((faixa?.textContent ?? '').length).toBeGreaterThan(8)

    const viaPedido = faixa!.querySelectorAll('button')[1] as HTMLButtonElement
    await act(async () => viaPedido.click())
    const hint = container.querySelector('#rec-oc-hint')
    expect((hint?.textContent ?? '').length).toBeGreaterThan(10)
    expect(hint?.textContent).not.toContain('undefined')
  })

  it('modo Ordem de Compra sem escolher o pedido: recusa no cliente, nada é enviado', async () => {
    await renderizar({ preSelecionado: true })
    await act(async () => botaoVia('Ordem de Compra').click())
    await act(async () => {
      definirValor(campo('origem'), 'Entrega')
      definirValor(campo('qtd_esperada'), '60')
      definirValor(campo('qtd_conferida'), '60')
    })
    await act(async () => {
      form().requestSubmit()
    })

    expect(criarRemessaMock).not.toHaveBeenCalled()
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'error', message: 'Escolha o pedido ao qual esta entrada pertence.' }),
    )
  })

  it('com pedido: mostra o saldo por item, envia o vínculo e informa o que mudou (100 pedidas → +60, faltam 40)', async () => {
    criarRemessaMock.mockResolvedValue({
      success: true,
      data: {
        remessaId: 'rem-12345678',
        oc: {
          oc_id: OC_ID,
          status: 'EM_TRANSITO',
          pedido_total: 100,
          recebido_total: 60,
          pendente_total: 40,
          itens_pendentes: 1,
          encerrada: false,
          encerrada_com_falta: false,
        },
      },
    })
    await renderizar({ preSelecionado: true })
    await act(async () => botaoVia('Ordem de Compra').click())
    await escolherPedidoNaLista()

    const saldo = container.querySelector('[data-testid="rec-oc-saldo"]')
    expect(saldo?.textContent).toContain('Produto A: pedido 100 · recebido 0 · faltam 100')

    await act(async () => {
      definirValor(campo('origem'), 'Primeira entrega')
      definirValor(campo('qtd_esperada'), '60')
      definirValor(campo('qtd_conferida'), '60')
    })
    await act(async () => {
      form().requestSubmit()
    })

    expect(criarRemessaMock).toHaveBeenCalledTimes(1)
    expect(criarRemessaMock).toHaveBeenCalledWith(
      expect.objectContaining({
        ordemCompraId: OC_ID,
        itens: [{ produto_id: 'p1', quantidade_esperada: 100, quantidade_conferida: 60 }],
      }),
    )
    const resultado = container.querySelector('[data-testid="rec-resultado"]')
    expect(resultado?.textContent).toContain('Estoque atualizado: +60.')
    expect(resultado?.textContent).toContain('Pedido: 60 de 100 recebidas.')
    expect(resultado?.textContent).toContain('Faltam 40 unidades.')
    // depois da entrada o formulário volta ao início, sem pedido escolhido (evita reenvio)
    expect(campo('qtd_conferida').value).toBe('')
    expect(container.querySelector('[data-testid="rec-oc-saldo"]')).toBeNull()
  })

  it('entrada que fecha o pedido: diz "Pedido totalmente recebido."', async () => {
    criarRemessaMock.mockResolvedValue({
      success: true,
      data: {
        remessaId: 'rem-87654321',
        oc: {
          oc_id: OC_ID,
          status: 'RECEBIDA',
          pedido_total: 100,
          recebido_total: 100,
          pendente_total: 0,
          itens_pendentes: 0,
          encerrada: true,
          encerrada_com_falta: false,
        },
      },
    })
    await renderizar({ preSelecionado: true })
    await act(async () => botaoVia('Ordem de Compra').click())
    await escolherPedidoNaLista()
    await act(async () => {
      definirValor(campo('origem'), 'Última entrega')
      definirValor(campo('qtd_esperada'), '100')
      definirValor(campo('qtd_conferida'), '100')
    })
    await act(async () => {
      form().requestSubmit()
    })

    const resultado = container.querySelector('[data-testid="rec-resultado"]')
    expect(resultado?.textContent).toContain('Pedido totalmente recebido.')
    expect(resultado?.textContent).not.toContain('Faltam')
  })
})

describe('RecebimentoGerentePageClient — sem documento não pede "esperada" e confirma com feedback útil', () => {
  it('sem documento: não há campo "quantidade esperada" nem divergência; o modo Pedido mostra o campo', async () => {
    await renderizar({ preSelecionado: true })
    expect((form()?.querySelector('input[name="qtd_esperada"]') ?? null)).toBeNull()
    expect(container.textContent).not.toContain('Quantidade esperada')

    await act(async () => botaoVia('Ordem de Compra').click())
    expect((form()?.querySelector('input[name="qtd_esperada"]') ?? null)).not.toBeNull()
    expect(campo('qtd_esperada').required).toBe(true)
  })

  it('voltar para "Sem documento" descarta a esperada digitada e a divergência some', async () => {
    await renderizar({ preSelecionado: true })
    await act(async () => botaoVia('Ordem de Compra').click())
    await act(async () => {
      definirValor(campo('qtd_esperada'), '10')
      definirValor(campo('qtd_conferida'), '4')
    })
    expect(container.textContent).toContain('Divergência')

    await act(async () => botaoVia('Sem documento').click())
    expect(container.textContent).not.toContain('Divergência')
    await act(async () => botaoVia('Ordem de Compra').click())
    expect(campo('qtd_esperada').value).toBe('')
  })

  it('o selo do topo acompanha o modo: "Entrada sem NF" em Sem documento, "Entrada com pedido" em Pedido', async () => {
    await renderizar()
    expect(container.textContent).toContain('Entrada sem NF')
    await act(async () => botaoVia('Ordem de Compra').click())
    expect(container.textContent).toContain('Entrada com pedido')
    expect(container.textContent).not.toContain('Entrada sem NF')
  })

  it('com pedido: a confirmação inclui o produto, o que mudou no pedido e o saldo novo', async () => {
    criarRemessaMock.mockResolvedValue({
      success: true,
      data: {
        remessaId: 'rem-12345678',
        saldoAtual: 60,
        oc: {
          oc_id: OC_ID,
          status: 'EM_TRANSITO',
          pedido_total: 100,
          recebido_total: 60,
          pendente_total: 40,
          itens_pendentes: 1,
          encerrada: false,
          encerrada_com_falta: false,
        },
      },
    })
    await renderizar({ preSelecionado: true })
    await act(async () => botaoVia('Ordem de Compra').click())
    await escolherPedidoNaLista()
    await act(async () => {
      definirValor(campo('origem'), 'Primeira entrega')
      definirValor(campo('qtd_esperada'), '60')
      definirValor(campo('qtd_conferida'), '60')
    })
    await act(async () => {
      form().requestSubmit()
    })

    const texto = container.querySelector('[data-testid="rec-resultado"]')?.textContent ?? ''
    expect(texto).toContain('confirmada: Produto A.')
    expect(texto).toContain('Faltam 40 unidades.')
    expect(texto).toContain('Saldo atual do produto: 60.')
  })

  it('saldo do pedido que não carrega: avisa em vez de sumir em silêncio', async () => {
    detalheOcMock.mockResolvedValue({ success: false, error: 'falha' })
    await renderizar({ preSelecionado: true })
    await act(async () => botaoVia('Ordem de Compra').click())
    await escolherPedidoNaLista()

    const saldo = container.querySelector('[data-testid="rec-oc-saldo"]')
    expect(saldo?.textContent).toContain('Não foi possível carregar o saldo do pedido')
  })
})

describe('RecebimentoGerentePageClient — formulário limpo após confirmar a entrada (A1)', () => {
  it('confirma, limpa todos os campos (inclusive o produto) e um novo envio imediato não cria outra entrada', async () => {
    criarRemessaMock.mockResolvedValue({
      success: true,
      data: { remessaId: 'rem-12345678', oc: null, saldoAtual: null },
    })
    await renderizar({ preSelecionado: true })
    await act(async () => botaoVia('Ordem de Compra').click())
    await escolherPedidoNaLista()

    expect(campo('produto_id').value).toBe('p1')
    await act(async () => {
      definirValor(campo('origem'), 'Entrega do fornecedor X')
      definirValor(campo('qtd_esperada'), '10')
      definirValor(campo('qtd_conferida'), '10')
    })
    await act(async () => {
      form().requestSubmit()
    })

    expect(criarRemessaMock).toHaveBeenCalledTimes(1)
    expect(criarRemessaMock).toHaveBeenCalledWith(
      expect.objectContaining({
        origem: 'Entrega do fornecedor X',
        itens: [{ produto_id: 'p1', quantidade_esperada: 100, quantidade_conferida: 10 }],
      }),
    )

    expect(campo('origem').value).toBe('')
    expect(campo('qtd_conferida').value).toBe('')
    expect(campo('produto_id').value).toBe('')

    await act(async () => {
      form().requestSubmit()
    })
    expect(criarRemessaMock).toHaveBeenCalledTimes(1)
  })

  it('falha ao confirmar: mantém o que o operador digitou (nada de perder o preenchimento)', async () => {
    criarRemessaMock.mockResolvedValue({ success: false, error: 'Falha de rede.' })
    await renderizar({ preSelecionado: true })
    await act(async () => botaoVia('Ordem de Compra').click())
    await escolherPedidoNaLista()

    await act(async () => {
      definirValor(campo('origem'), 'Entrega do fornecedor X')
      definirValor(campo('qtd_esperada'), '10')
      definirValor(campo('qtd_conferida'), '10')
    })
    await act(async () => {
      form().requestSubmit()
    })

    expect(criarRemessaMock).toHaveBeenCalledTimes(1)
    expect(campo('origem').value).toBe('Entrega do fornecedor X')
    expect(campo('qtd_conferida').value).toBe('10')
    expect(campo('produto_id').value).toBe('p1')
  })
})

it('pedido com vários produtos: item não recebido não credita, o segundo mantém seu saldo esperado', async () => {
  detalheOcMock.mockResolvedValue({ success: true, data: { ...OC_DETALHE, itens: [
    ...OC_DETALHE.itens, { ...OC_DETALHE.itens[0], id: 'it-2', produto_id: 'p2', produto_nome: 'Produto B', saldo_pendente: 5 },
  ] } })
  criarRemessaMock.mockResolvedValue({ success: true, data: { remessaId: 'rem-multi' } })
  await renderizar()
  await act(async () => botaoVia('Ordem de Compra').click())
  await escolherPedidoNaLista()
  await act(async () => { definirValor(campo('origem'), 'Entrega parcial'); definirValor(campo('qtd_p2'), '3') })
  await act(async () => form().requestSubmit())
  expect(criarRemessaMock).toHaveBeenCalledWith(expect.objectContaining({
    ordemCompraId: OC_ID, itens: [{ produto_id: 'p2', quantidade_esperada: 5, quantidade_conferida: 3 }],
  }))
})
