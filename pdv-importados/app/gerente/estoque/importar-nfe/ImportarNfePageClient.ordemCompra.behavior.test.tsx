/** @vitest-environment jsdom */
/**
 * UX-04 — a NF-e em conferência pode ser relacionada a um Ordem de Compra, por escolha do operador.
 * Prova: sem pedido a tela oferece o seletor (nada é presumido); com pedido mostra o saldo e avisa
 * dos itens da nota que não fazem parte do pedido; "Desvincular" existe só antes de confirmar; e
 * depois de confirmar mostra o que a nota fez no pedido. Regra de saldo = banco (SQL T10).
 */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const obterConferenciaMock = vi.fn()
const vincularMock = vi.fn()
const confirmarMock = vi.fn()
const registrarMock = vi.fn()
const emitToastMock = vi.fn()

vi.mock('./actions', () => ({
  listarNotasLancadas: async () => ({ success: true, data: [] }),
  buscarProdutosParaVinculo: vi.fn(),
  confirmarImportacaoNfe: (p: unknown) => confirmarMock(p),
  executarImportacaoNfe: vi.fn(),
  listarImportacoesNfePendentes: async () => ({ success: true, data: [] }),
  obterConferenciaImportacaoNfe: (id: string) => obterConferenciaMock(id),
  obterResumoContasPagarImportacaoNfe: async () => ({
    success: true,
    data: { quantidade: 0, valor_total: 0, primeiro_vencimento: null, fornecedor_id: null },
  }),
  previewImportacaoNfe: vi.fn(),
  registrarConferenciaNfe: (p: unknown) => registrarMock(p),
  vincularImportacaoNfeOrdemCompra: (p: unknown) => vincularMock(p),
}))
vi.mock('@/app/gerente/compras/actions', () => ({
  listarOrdensCompraElegiveisParaVinculo: async () => [],
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/admin/estoque/importar-nfe',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/gerente/toast', () => ({ emitGerenteToast: (t: unknown) => emitToastMock(t) }))

const { ImportarNfePageClient } = await import('./ImportarNfePageClient')
const { AdminV2SessionProvider } = await import('@/components/ui/admin-v2/AdminV2SessionContext')

const OC_ID = 'aaaabbbb-1111-4222-8333-ccccddddeeee'

function conferencia(over: Record<string, unknown> = {}) {
  return {
    importacao_id: 'imp-1',
    status: 'EM_CONFERENCIA' as const,
    numero_nf: '123',
    fornecedor_nome: 'Fornecedor Alfa',
    created_at: '2026-09-17T10:00:00Z',
    itens: [
      {
        item_id: 'it-1',
        produto_id: 'p-1',
        produto_nome: 'Produto A',
        produto_codigo_barras: null,
        quantidade_nfe: 60,
        custo_unitario: 5,
        atualizar_custo: true,
        quantidade_conferida: 60,
        divergencia_obs: null,
        status_conferencia: 'CONFERIDO' as const,
      },
    ],
    ordem_compra: null,
    ...over,
  }
}

const OC_VINCULADA = {
  oc_id: OC_ID,
  fornecedor_nome: 'Fornecedor Alfa',
  status: 'EM_TRANSITO',
  pedido_total: 100,
  recebido_total: 0,
  pendente_total: 100,
  itens_fora_do_pedido: [] as string[],
}

let container: HTMLDivElement
let root: Root

async function abrir(data: unknown) {
  obterConferenciaMock.mockResolvedValue({ success: true, data })
  await act(async () => {
    root.render(
      <AdminV2SessionProvider idioma="pt">
        <ImportarNfePageClient idioma="pt" embeddedInAdminHub importacaoInicialId="imp-1" />
      </AdminV2SessionProvider>,
    )
  })
}

beforeEach(() => {
  obterConferenciaMock.mockReset()
  vincularMock.mockReset()
  confirmarMock.mockReset()
  registrarMock.mockReset()
  emitToastMock.mockReset()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const painel = () => container.querySelector('[data-testid="nfe-oc-vinculo"]')

describe('ImportarNfePageClient — NF-e ↔ Ordem de Compra (UX-04)', () => {
  it('sem pedido: oferece o seletor opcional e explica que o vínculo nunca é feito sozinho', async () => {
    await abrir(conferencia())

    expect(painel()?.textContent).toContain('Pedido de compra (opcional)')
    expect(painel()?.textContent).toContain('O sistema nunca faz esse vínculo sozinho')
    expect(painel()?.querySelector('input[role="combobox"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="nfe-oc-vinculada"]')).toBeNull()
  })

  it('com pedido relacionado: mostra o saldo, avisa dos itens fora do pedido e permite desvincular antes de confirmar', async () => {
    await abrir(conferencia({ ordem_compra: { ...OC_VINCULADA, recebido_total: 0, itens_fora_do_pedido: ['Brinde X'] } }))

    const vinculada = container.querySelector('[data-testid="nfe-oc-vinculada"]')
    expect(vinculada?.textContent).toContain('recebido 0 de 100')
    expect(vinculada?.textContent).toContain('Faltam 100 unidades.')
    expect(container.querySelector('[data-testid="nfe-oc-fora"]')?.textContent).toContain('Brinde X')
    const desvincular = Array.from(painel()!.querySelectorAll('button')).find((b) => b.textContent?.includes('Desvincular'))
    expect(desvincular).toBeTruthy()

    vincularMock.mockResolvedValue({ success: true, data: null })
    obterConferenciaMock.mockResolvedValue({ success: true, data: conferencia() })
    await act(async () => desvincular!.click())

    expect(vincularMock).toHaveBeenCalledWith({ importacao_id: 'imp-1', ordem_compra_id: null })
    expect(container.querySelector('[data-testid="nfe-oc-vinculada"]')).toBeNull()
  })

  it('depois de confirmar: mostra o que a nota fez no pedido (60 abatidas, faltam 40) e some o "Desvincular"', async () => {
    await abrir(conferencia({ ordem_compra: OC_VINCULADA }))
    confirmarMock.mockResolvedValue({
      success: true,
      data: {
        abatido: 60,
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

    const botao = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Confirmar e atualizar estoque'),
    ) as HTMLButtonElement
    expect(botao.disabled).toBe(false)
    await act(async () => botao.click())

    expect(confirmarMock).toHaveBeenCalledWith({ importacao_id: 'imp-1' })
    const res = container.querySelector('[data-testid="nfe-oc-resultado"]')
    expect(res?.textContent).toContain('60 unidades desta nota abateram o pedido')
    expect(res?.textContent).toContain('recebido 60 de 100')
    expect(res?.textContent).toContain('Faltam 40 unidades.')
    expect(Array.from(container.querySelectorAll('button')).some((b) => b.textContent?.includes('Desvincular'))).toBe(false)
  })

  it('NF-e já concluída: mostra o pedido relacionado, sem seletor e sem "Desvincular"', async () => {
    await abrir(conferencia({ status: 'CONCLUIDA', ordem_compra: { ...OC_VINCULADA, recebido_total: 60, pendente_total: 40 } }))

    expect(container.querySelector('[data-testid="nfe-oc-vinculada"]')?.textContent).toContain('recebido 60 de 100')
    expect(painel()?.querySelector('input[role="combobox"]')).toBeNull()
    expect(Array.from(painel()!.querySelectorAll('button')).some((b) => b.textContent?.includes('Desvincular'))).toBe(false)
  })

  it('NF-e concluída sem pedido: nenhum painel de pedido (fluxo antigo intacto)', async () => {
    await abrir(conferencia({ status: 'CONCLUIDA' }))

    expect(painel()).toBeNull()
  })
})

function botaoConfirmar(): HTMLButtonElement {
  return Array.from(container.querySelectorAll('button')).find((b) =>
    b.textContent?.includes('Confirmar e atualizar estoque'),
  ) as HTMLButtonElement
}

async function editarQuantidade(value: string) {
  const input = container.querySelector('input[type="number"]') as HTMLInputElement
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('P0 — confirmar somente a conferência visível já salva', () => {
  it.each(['59', '', '0'])('bloqueia quantidade local %s e não confirma saldo antigo', async (value) => {
    await abrir(conferencia())
    expect(botaoConfirmar().disabled).toBe(false)
    await editarQuantidade(value)
    expect(botaoConfirmar().disabled).toBe(true)
    await act(async () => botaoConfirmar().click())
    expect(confirmarMock).not.toHaveBeenCalled()
  })

  it('reabilita após registrar e recarregar exatamente a nova quantidade', async () => {
    await abrir(conferencia())
    await editarQuantidade('59')
    registrarMock.mockResolvedValue({ success: true, data: null })
    const saved = conferencia()
    saved.itens[0].quantidade_conferida = 59
    obterConferenciaMock.mockResolvedValue({ success: true, data: saved })
    const registrar = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Registrar conferência'),
    )!
    await act(async () => registrar.click())
    expect(registrarMock).toHaveBeenCalledWith({
      importacao_id: 'imp-1',
      itens: [{ item_id: 'it-1', quantidade_conferida: 59, divergencia_obs: null }],
    })
    expect(botaoConfirmar().disabled).toBe(false)
  })

  it('falha ao registrar mantém confirmação bloqueada', async () => {
    await abrir(conferencia())
    await editarQuantidade('59')
    registrarMock.mockResolvedValue({ success: false, error: 'Falha simulada' })
    const registrar = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Registrar conferência'),
    )!
    await act(async () => registrar.click())
    expect(botaoConfirmar().disabled).toBe(true)
    expect(confirmarMock).not.toHaveBeenCalled()
  })
})

it('P0 — alteração somente da observação também impede confirmar', async () => {
  const saved = conferencia()
  saved.itens[0].quantidade_conferida = 59
  await abrir(saved)
  const quantity = container.querySelector('input[type="number"]')!
  const observation = quantity.closest('tr')!.querySelector('input[type="text"]') as HTMLInputElement
  expect(observation).toBeTruthy()
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(observation, 'Contagem sintética')
    observation!.dispatchEvent(new Event('input', { bubbles: true }))
  })
  expect(botaoConfirmar().disabled).toBe(true)
  expect(confirmarMock).not.toHaveBeenCalled()
})

describe('Documento recebido depois da mercadoria', () => {
  it('escolher entrega anterior bloqueia crédito até salvar a associação', async () => {
    await abrir(conferencia())
    const button = Array.from(container.querySelectorAll('button')).find((item) => item.textContent?.includes('Mercadoria já entrou?'))!
    await act(async () => button.click())
    const confirmar = botaoConfirmar()
    expect(confirmar.disabled).toBe(true)
    await act(async () => confirmar.click())
    expect(confirmarMock).not.toHaveBeenCalled()
  })
  it('associação persistida explica que documento não creditará novamente', async () => {
    await abrir(conferencia({ entrega_anterior_id: 'remessa-1' }))
    expect(container.textContent).toContain('sem creditar estoque novamente')
    expect(container.textContent).toContain('remessa-')
  })
})
