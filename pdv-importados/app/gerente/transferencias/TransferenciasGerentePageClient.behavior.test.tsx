/** @vitest-environment jsdom */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const routerRefreshMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: routerRefreshMock }),
}))

vi.mock('./actions', () => ({
  executarTransferencia: vi.fn(),
  obterEstoqueDisponivelTransferencia: vi.fn().mockResolvedValue({
    success: true,
    quantidadeDisponivel: 100,
    unidadeMedida: 'UN',
    limiteObservacao: 50,
  }),
}))

import { TransferenciasGerentePageClient } from '@/app/gerente/transferencias/TransferenciasGerentePageClient'
import { AdminV2SessionProvider } from '@/components/ui/admin-v2/AdminV2SessionContext'

const LOJAS = [
  { id: 'l1', nome: 'Loja 1', codigo: 'L1' },
  { id: 'l2', nome: 'Loja 2', codigo: 'L2' },
]
const PRODUTOS = [{ id: 'p1', nome: 'Produto Teste', unidade_medida: 'UN', limite_transferencia_sem_observacao: 50 }]

let container: HTMLDivElement
let root: Root

function render(ui: React.ReactElement) {
  act(() => {
    root.render(<AdminV2SessionProvider idioma="pt">{ui}</AdminV2SessionProvider>)
  })
}

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => {
    root.unmount()
  })
  container.remove()
})

async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('TransferenciasGerentePageClient — falha de carga', () => {
  it('mostra o alerta de falha real (não "só 1 loja") quando loadError está presente, mesmo com poucas lojas', () => {
    render(
      <TransferenciasGerentePageClient
        idioma="pt"
        lojas={[]}
        produtos={[]}
        loadError="Não foi possível carregar lojas/produtos para transferência. Tente novamente."
      />,
    )
    const alerta = container.querySelector('[role="alert"]')
    expect(alerta).not.toBeNull()
    expect(alerta?.textContent).toContain('Não foi possível carregar')
  })

  it('sem loadError e com só 1 loja, mostra o aviso normal (não o alerta de falha)', () => {
    render(<TransferenciasGerentePageClient idioma="pt" lojas={[LOJAS[0]]} produtos={PRODUTOS} />)
    expect(container.querySelector('[role="alert"]')).toBeNull()
    expect(container.querySelector('[role="status"]')).not.toBeNull()
  })

  it('sem loadError e com 2+ lojas, não mostra nenhum aviso de bloqueio', async () => {
    render(<TransferenciasGerentePageClient idioma="pt" lojas={LOJAS} produtos={PRODUTOS} />)
    await flush()
    expect(container.querySelector('[role="alert"]')).toBeNull()
  })
})
