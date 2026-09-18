/** @vitest-environment jsdom */
/**
 * BP-A3 — o link "NF-e #…" de Contas a pagar levava a uma tela de upload vazia:
 * o href usava a rota legada `/gerente/...` (o catch-all descarta a query) e o
 * destino nunca lia o parâmetro. Prova que, recebendo `importacaoInicialId`, o
 * client abre essa importação (aberta ou já concluída) pela mesma action de
 * "Retomar conferência", e que sem o parâmetro nada é buscado.
 */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const obterConferenciaMock = vi.fn()
const listarPendentesMock = vi.fn()
const emitToastMock = vi.fn()

vi.mock('./actions', () => ({
  buscarProdutosParaVinculo: vi.fn(),
  confirmarImportacaoNfe: vi.fn(),
  executarImportacaoNfe: vi.fn(),
  listarImportacoesNfePendentes: () => listarPendentesMock(),
  obterConferenciaImportacaoNfe: (id: string) => obterConferenciaMock(id),
  previewImportacaoNfe: vi.fn(),
  registrarConferenciaNfe: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/admin/estoque/importar-nfe',
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/lib/gerente/toast', () => ({
  emitGerenteToast: (t: unknown) => emitToastMock(t),
}))

const { ImportarNfePageClient } = await import('./ImportarNfePageClient')
const { AdminV2SessionProvider } = await import('@/components/ui/admin-v2/AdminV2SessionContext')

const conferenciaConcluida = {
  importacao_id: 'imp-42',
  status: 'CONCLUIDA' as const,
  numero_nf: '987654',
  fornecedor_nome: 'Fornecedor Deep Link',
  created_at: '2026-09-17T10:00:00Z',
  itens: [
    {
      item_id: 'it-1',
      produto_id: 'p-1',
      produto_nome: 'Produto da nota',
      produto_codigo_barras: null,
      quantidade_nfe: 10,
      custo_unitario: 5,
      atualizar_custo: true,
      quantidade_conferida: 10,
      divergencia_obs: null,
      status_conferencia: 'CONFERIDO' as const,
    },
  ],
}

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

beforeEach(() => {
  obterConferenciaMock.mockReset()
  listarPendentesMock.mockReset()
  emitToastMock.mockReset()
  listarPendentesMock.mockResolvedValue({ success: true, data: [] })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('ImportarNfePageClient — deep-link ?importacao= (BP-A3)', () => {
  it('abre a importação informada e mostra a conferência já concluída (somente leitura)', async () => {
    obterConferenciaMock.mockResolvedValue({ success: true, data: conferenciaConcluida })

    await renderar({ importacaoInicialId: 'imp-42' })

    expect(obterConferenciaMock).toHaveBeenCalledTimes(1)
    expect(obterConferenciaMock).toHaveBeenCalledWith('imp-42')
    expect(container.textContent).toContain('Produto da nota')
    const qtdInputs = Array.from(container.querySelectorAll('input[type="number"]'))
    expect(qtdInputs.length).toBeGreaterThan(0)
    expect(qtdInputs.every((i) => (i as HTMLInputElement).disabled)).toBe(true)
  })

  it('não busca nada quando não há importação no link (tela de upload normal)', async () => {
    await renderar({})

    expect(obterConferenciaMock).not.toHaveBeenCalled()
  })

  it('importação inexistente/de outra loja: mostra o erro da action e não quebra a página', async () => {
    obterConferenciaMock.mockResolvedValue({ success: false, error: 'Importação não encontrada.' })

    await renderar({ importacaoInicialId: 'imp-de-outra-loja' })

    expect(emitToastMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'error', message: 'Importação não encontrada.' }),
    )
    expect(container.querySelector('input[type="file"], [data-testid], h1, h2, section')).not.toBeNull()
  })

  it('abre a importação uma única vez, mesmo com re-renders', async () => {
    obterConferenciaMock.mockResolvedValue({ success: true, data: conferenciaConcluida })

    await renderar({ importacaoInicialId: 'imp-42' })
    await renderar({ importacaoInicialId: 'imp-42' })

    expect(obterConferenciaMock).toHaveBeenCalledTimes(1)
  })
})
