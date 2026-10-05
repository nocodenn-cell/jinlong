/** @vitest-environment jsdom */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const preview = vi.hoisted(() => vi.fn())
const remessa = vi.hoisted(() => vi.fn())
const buscar = vi.hoisted(() => vi.fn())
const toast = vi.hoisted(() => vi.fn())
vi.mock('./actions', () => ({ criarRemessaConferencia: remessa, buscarProdutosRecebimento: buscar }))
vi.mock('../compras/actions', () => ({
  listarOrdensCompraElegiveisParaVinculo: vi.fn(async () => []), obterOrdemCompraDetalhe: vi.fn(),
}))
vi.mock('../estoque/importar-nfe/actions', () => ({
  previewNotaManualNfe: preview, listarImportacoesNfePendentes: vi.fn(async () => ({ success: true, data: [] })),
  listarNotasLancadas: vi.fn(async () => ({ success: true, data: [] })),
  previewImportacaoNfe: vi.fn(), executarImportacaoNfe: vi.fn(), confirmarImportacaoNfe: vi.fn(),
  buscarProdutosParaVinculo: vi.fn(), registrarConferenciaNfe: vi.fn(), vincularImportacaoNfeOrdemCompra: vi.fn(),
  obterConferenciaImportacaoNfe: vi.fn(), obterResumoContasPagarImportacaoNfe: vi.fn(),
}))
vi.mock('@/lib/gerente/toast', () => ({ emitGerenteToast: toast }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/admin/estoque/recebimento', useSearchParams: () => new URLSearchParams(),
}))
import { RecebimentoGerentePageClient } from './RecebimentoGerentePageClient'
import { AdminV2SessionProvider } from '@/components/ui/admin-v2/AdminV2SessionContext'

const P1 = { id: '11111111-1111-4111-8111-111111111111', nome: 'Tapete', codigo_barras: null }
const P2 = { id: '22222222-2222-4222-8222-222222222222', nome: 'Outro produto', codigo_barras: null }
let container: HTMLDivElement
let root: Root
beforeEach(async () => {
  vi.useFakeTimers(); vi.clearAllMocks()
  buscar.mockResolvedValue({ success: true, data: [P2] })
  preview.mockResolvedValue({ success: false, error: 'Falha de rede' })
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container)
  await act(async () => root.render(<AdminV2SessionProvider idioma="pt">
    <RecebimentoGerentePageClient idioma="pt" temProdutos remessasRecentes={[]} embeddedInAdminHub produtoPreSelecionado={P1} />
  </AdminV2SessionProvider>))
})
afterEach(() => { act(() => root.unmount()); container.remove(); vi.useRealTimers() })
function setInput(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
function input(label: string, index = 0): HTMLInputElement {
  return [...container.querySelectorAll('label')].filter((l) => l.textContent?.trim().startsWith(label))[index].querySelector('input')!
}
function button(label: string): HTMLButtonElement {
  return [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)!
}
async function preencher() {
  await act(async () => {
    setInput(input('Fornecedor'), 'Fornecedor A'); setInput(input('CNPJ'), '12345678000199')
    setInput(input('Qtd.'), '900'); setInput(input('Valor unit.'), '10,00')
  })
}
async function parcelas() {
  await act(async () => {
    const select = container.querySelector('select')!
    select.value = '0'; select.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

describe('Sem documento — entrada manual com valores', () => {
  it('limita o CNPJ a 14 dígitos e remove símbolos ao digitar ou colar', async () => {
    const campo = input('CNPJ')
    expect(campo.maxLength).toBe(14)
    await act(async () => setInput(campo, '12.345.678/0001-99+123456789'))
    expect(campo.value).toBe('12345678000199')
    await act(async () => setInput(campo, 'abc+123'))
    expect(campo.value).toBe('123')
  })
  it('abre quantidade, valor unitário e parcelas diretamente, sem exigir nota ou XML', () => {
    expect(container.querySelector('[data-testid="nota-manual"]')).not.toBeNull()
    expect(input('Qtd.')).toBeTruthy(); expect(input('Valor unit.')).toBeTruthy()
    expect(container.querySelector('#recebimento-form')).toBeNull()
    expect(container.textContent).toContain('Parcelas / vencimentos')
    expect(container.textContent).not.toContain('Nº da nota')
    expect(container.querySelector('input[type="file"]')).toBeNull()
  })
  it('envia quantidade e valor ao fluxo financeiro existente e preserva os dados numa falha', async () => {
    await preencher(); await parcelas()
    await act(async () => button('Continuar para vincular produtos').click())
    expect(preview).toHaveBeenCalledWith(expect.objectContaining({
      sem_documento: true,
      itens: [expect.objectContaining({ produto_id: P1.id, q_com: 900, v_un_com: 10 })],
      duplicatas: [expect.objectContaining({ valor: 9000 })],
    }))
    expect(remessa).not.toHaveBeenCalled()
    expect(input('Qtd.').value).toBe('900')
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ message: 'Falha de rede' }))
  })
  it('não cria entrada nem dívida sem condição de pagamento', async () => {
    await preencher(); await act(async () => button('Continuar para vincular produtos').click())
    expect(preview).not.toHaveBeenCalled(); expect(remessa).not.toHaveBeenCalled()
  })
  it('envia dois produtos, cada um com sua quantidade e valor, no mesmo lançamento', async () => {
    await preencher(); await act(async () => button('Adicionar item').click())
    const busca = [...container.querySelectorAll<HTMLInputElement>('input[role="combobox"]')][1]
    await act(async () => { busca.dispatchEvent(new Event('focus', { bubbles: true })); setInput(busca, 'Outro') })
    await act(async () => { vi.advanceTimersByTime(400); await Promise.resolve(); await Promise.resolve() })
    await act(async () => (container.querySelector('button[role="option"]') as HTMLButtonElement).click())
    await act(async () => { setInput(input('Qtd.', 1), '4'); setInput(input('Valor unit.', 1), '25,00') })
    await parcelas(); await act(async () => button('Continuar para vincular produtos').click())
    expect(preview).toHaveBeenCalledWith(expect.objectContaining({
      itens: [expect.objectContaining({ produto_id: P1.id, q_com: 900, v_un_com: 10 }),
        expect.objectContaining({ produto_id: P2.id, q_com: 4, v_un_com: 25 })],
      duplicatas: [expect.objectContaining({ valor: 9100 })],
    }))
    expect(remessa).not.toHaveBeenCalled()
  })
})
