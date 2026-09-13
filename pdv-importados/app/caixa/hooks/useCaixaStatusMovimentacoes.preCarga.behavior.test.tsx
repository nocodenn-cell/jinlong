/** @vitest-environment jsdom */
import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { renderToString } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/app/caixa/actions", () => ({
  obterStatusCaixaOperador: vi.fn(),
  obterMovimentacoesCaixa: vi.fn(),
  registrarMovimentacao: vi.fn(),
  autorizarMovimentacaoGerente: vi.fn(),
  cancelarMovimentacaoCaixa: vi.fn(),
  estornarMovimentacaoCaixa: vi.fn(),
}))
vi.mock("@/app/caixa/hooks/useMovimentacoesRealtime", () => ({
  useMovimentacoesRealtime: vi.fn(),
}))

import { obterMovimentacoesCaixa, obterStatusCaixaOperador } from "@/app/caixa/actions"
import { useCaixaStatusMovimentacoes } from "@/app/caixa/hooks/useCaixaStatusMovimentacoes"
import type { CaixaBootstrapInicial } from "@/app/caixa/caixaBootstrapTypes"
import type { MovimentacaoCaixaDTO } from "@/app/caixa/caixaMovimentacaoTypes"
import type { Mensagens } from "@/i18n/getMessages"

/**
 * Regressão (E2E do PR de performance): com o status do turno pré-carregado no
 * Server Component, o HTML do servidor não pode sair com o turno já resolvido —
 * "Abrir/Fechar caixa" apareceria habilitado antes da hidratação e o clique nesse
 * intervalo se perderia. O primeiro render continua "carregando"; a pré-carga entra
 * no efeito de montagem (pós-hidratação) sem nenhuma ida ao servidor.
 */

type Api = ReturnType<typeof useCaixaStatusMovimentacoes>

let container: HTMLDivElement
let root: Root
let api: Api | null = null

// Referências estáveis, como em `CaixaPageClient` (setCaixaMensagem vem de useCallback).
const MENSAGENS = {} as Mensagens
const setCaixaMensagem = () => {}

function Harness({ inicial }: { inicial?: Pick<CaixaBootstrapInicial, "status" | "movimentacoes"> | null }) {
  api = useCaixaStatusMovimentacoes({
    m: MENSAGENS,
    setCaixaMensagem,
    movimentacaoModalTipo: null,
    acaoMovimentacao: null,
    currentUserId: "user-1",
    inicial,
  })
  return <span data-carregando={String(api.carregandoStatus)} data-status={api.caixaStatus?.status ?? "null"} />
}

const inicialAberto: Pick<CaixaBootstrapInicial, "status" | "movimentacoes"> = {
  status: {
    ok: true,
    status: "ABERTO",
    caixaId: "caixa-1",
    dataAbertura: "2026-09-13T10:00:00.000Z",
    valorInicial: 120,
    valorSistemaDinheiro: 170,
    blindClosureEnabled: false,
  },
  movimentacoes: { ok: true, itens: [{ id: "mov-1" } as unknown as MovimentacaoCaixaDTO] },
}

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  api = null
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe("useCaixaStatusMovimentacoes — pré-carga do Server Component", () => {
  it("HTML do servidor sai 'carregando' (sem turno resolvido), mesmo com pré-carga", () => {
    const html = renderToString(<Harness inicial={inicialAberto} />)

    expect(html).toContain('data-carregando="true"')
    expect(html).toContain('data-status="null"')
  })

  it("após montar, aplica a pré-carga sem chamar as Server Actions", () => {
    act(() => {
      root.render(<Harness inicial={inicialAberto} />)
    })

    expect(api?.carregandoStatus).toBe(false)
    expect(api?.caixaStatus).toMatchObject({ status: "ABERTO", caixaId: "caixa-1" })
    expect(api?.movimentacoes).toHaveLength(1)
    expect(obterStatusCaixaOperador).not.toHaveBeenCalled()
    expect(obterMovimentacoesCaixa).not.toHaveBeenCalled()
  })

  it("sem pré-carga, mantém o fluxo anterior (busca o status pela action)", async () => {
    vi.mocked(obterStatusCaixaOperador).mockResolvedValue({ ok: true, status: "FECHADO" })

    await act(async () => {
      root.render(<Harness inicial={null} />)
    })

    expect(obterStatusCaixaOperador).toHaveBeenCalledTimes(1)
    expect(api?.caixaStatus).toEqual({ status: "FECHADO" })
    expect(api?.carregandoStatus).toBe(false)
  })
})
