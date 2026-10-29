/** @vitest-environment jsdom */
/**
 * SSOT-003 na tela: a prévia avisa quando a nota tem valor e nenhuma duplicata, e a
 * confirmação do estoque fica bloqueada (sem chamar o servidor) nesse caso.
 */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const obterConferenciaMock = vi.fn()
const previewMock = vi.fn()
const confirmarMock = vi.fn()

vi.mock('./actions', () => ({
  listarNotasLancadas: async () => ({ success: true, data: [] }),
  listarImportacoesNfePendentes: async () => ({ success: true, data: [] }),
  buscarProdutosParaVinculo: vi.fn(),
  confirmarImportacaoNfe: (p: unknown) => confirmarMock(p),
  executarImportacaoNfe: vi.fn(),
  obterConferenciaImportacaoNfe: (id: string) => obterConferenciaMock(id),
  obterResumoContasPagarImportacaoNfe: vi.fn(async () => ({ success: true, data: { quantidade: 0, valor_total: 0, primeiro_vencimento: null, fornecedor_id: null } })),
  previewImportacaoNfe: (xml: string) => previewMock(xml),
  registrarConferenciaNfe: vi.fn(),
  vincularImportacaoNfeOrdemCompra: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/admin/estoque/importar-nfe',
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/lib/gerente/toast', () => ({ emitGerenteToast: vi.fn() }))

const { ImportarNfePageClient } = await import('./ImportarNfePageClient')
const { AdminV2SessionProvider } = await import('@/components/ui/admin-v2/AdminV2SessionContext')

function conferencia(duplicatasTotal: number, quantidade = 10) {
  return {
    importacao_id: 'imp-1',
    status: 'EM_CONFERENCIA' as const,
    numero_nf: '555',
    fornecedor_nome: 'Fornecedor',
    created_at: '2026-10-20T10:00:00Z',
    duplicatas_total: duplicatasTotal,
    itens: [
      {
        item_id: 'it-1',
        produto_id: 'p-1',
        produto_nome: 'Tapete',
        produto_codigo_barras: null,
        quantidade_nfe: quantidade,
        custo_unitario: 5,
        atualizar_custo: false,
        quantidade_conferida: quantidade,
        divergencia_obs: null,
        status_conferencia: 'CONFERIDO' as const,
      },
    ],
  }
}

const parsedSemParcelas = {
  chave_acesso: '1'.repeat(44),
  numero_nf: '555',
  emitente: { nome: 'Fornecedor', cnpj: '12345678000199' },
  itens: [{ nome_produto: 'Tapete', gtin: null, ref_fornecedor: 'T1', ncm: null, u_com: 'UN', q_com: 10, v_un_com: 5 }],
  duplicatas: [],
}
const linhaPreview = { ...parsedSemParcelas.itens[0], status_produto: 'DESCONHECIDO', produto_id: null, produto_nome: null }

let container: HTMLDivElement
let root: Root

async function renderar(props: { importacaoInicialId?: string | null }) {
  await act(async () => {
    root.render(
      <AdminV2SessionProvider idioma="pt">
        <ImportarNfePageClient idioma="pt" embeddedInAdminHub {...props} />
      </AdminV2SessionProvider>,
    )
  })
}

function botao(texto: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes(texto)) as HTMLButtonElement | undefined
}

beforeEach(() => {
  obterConferenciaMock.mockReset()
  previewMock.mockReset()
  confirmarMock.mockReset()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('ImportarNfePageClient — nota com valor e sem duplicatas', () => {
  it('bloqueia a confirmação do estoque e explica o motivo, sem chamar o servidor', async () => {
    obterConferenciaMock.mockResolvedValue({ success: true, data: conferencia(0) })

    await renderar({ importacaoInicialId: 'imp-1' })

    const confirmar = botao('Confirmar e atualizar estoque')
    expect(confirmar).toBeTruthy()
    expect(confirmar!.disabled).toBe(true)
    const motivo = container.querySelector('[data-testid="confirmar-estoque-motivo"]')
    expect(motivo?.textContent).toContain('O estoque não pode ser confirmado por aqui')
    expect(motivo?.textContent).not.toMatch(/IMPORT_NFE_/)
    expect(confirmarMock).not.toHaveBeenCalled()
  })

  it('libera a confirmação quando a nota tem duplicatas', async () => {
    obterConferenciaMock.mockResolvedValue({ success: true, data: conferencia(2) })

    await renderar({ importacaoInicialId: 'imp-1' })

    expect(botao('Confirmar e atualizar estoque')!.disabled).toBe(false)
    expect(container.querySelector('[data-testid="confirmar-estoque-motivo"]')).toBeNull()
  })

  it('não bloqueia nota de valor zero sem duplicatas', async () => {
    obterConferenciaMock.mockResolvedValue({ success: true, data: conferencia(0, 0) })

    await renderar({ importacaoInicialId: 'imp-1' })

    expect(botao('Confirmar e atualizar estoque')!.disabled).toBe(false)
  })

  it('a prévia avisa antes da confirmação quando há valor e nenhuma parcela', async () => {
    previewMock.mockResolvedValue({ success: true, data: { parsed: parsedSemParcelas, linhas: [linhaPreview] } })
    await renderar({})

    const ta = container.querySelector('textarea')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(ta, '<nfeProc/>')
      ta.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      botao('Carregar pré-visualização')!.click()
    })

    const aviso = container.querySelector('[data-testid="previa-sem-obrigacao"]')
    expect(aviso?.textContent).toContain('será bloqueada')
    expect(container.textContent).not.toContain('nenhuma conta a pagar será gerada')
  })
})
