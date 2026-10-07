/** @vitest-environment jsdom */
import React, { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import type { Mensagens } from "@/i18n/getMessages"
import { useCaixaVendasEmEspera, type UseCaixaVendasEmEsperaDeps } from "./useCaixaVendasEmEspera"
const actions = vi.hoisted(() => ({ colocarVendaEmEsperaCaixa: vi.fn(), listarVendasEmEsperaCaixa: vi.fn(), retomarVendaEmEsperaCaixa: vi.fn(), descartarVendaEmEsperaCaixa: vi.fn(), obterClienteCaixa: vi.fn() }))
vi.mock("@/app/caixa/actions", () => actions)
let root: ReturnType<typeof createRoot>
let container: HTMLDivElement
let api: ReturnType<typeof useCaixaVendasEmEspera>
let deps: UseCaixaVendasEmEsperaDeps
const item = { id: "p", produtoId: "p", quantidade: 1, nome: "Teste", precoUnitario: 9.5, resultado: { precoOriginal: 10, precoUnitario: 9.5, descontoUnitario: 0.5, tipoPreco: "MANUAL" as const } }
function Harness() { api = useCaixaVendasEmEspera(deps); return null }
beforeEach(async () => {
  vi.resetAllMocks()
  actions.listarVendasEmEsperaCaixa.mockResolvedValue({ ok: true, vendas: [] })
  deps = { m: { caixa: { em_aberto_colocada: "Em espera {{n}}", em_aberto_retomada: "Retomada {{n}}", em_aberto_finalize_antes: "Revise o cupom" } } as unknown as Mensagens,
    itens: [item], totalBruto: 10, totalDesconto: 0.5, totalLiquidoComGerente: 9.5, descontoGerentePercentual: 0,
    caixaStatus: null, clienteId: "cliente", turnoRefreshToken: 0, novoCupom: vi.fn(), limparEstadoDescontoGerente: vi.fn(), substituirCarrinho: vi.fn(), reprecificar: vi.fn(), setCaixaMensagem: vi.fn(), tocarFeedback: vi.fn(), focarCampoBusca: vi.fn(), setClienteId: vi.fn(), setClienteNome: vi.fn(), vendaEmEsperaOrigemId: null, setVendaEmEsperaOrigemId: vi.fn() }
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container)
  await act(async () => root.render(<Harness />))
})
afterEach(() => { act(() => root.unmount()); container.remove() })
it("cliques simultâneos criam apenas um pedido e preservam cliente/desconto", async () => {
  let resolve!: (value: { ok: true; id: string; numeroLocal: number }) => void
  actions.colocarVendaEmEsperaCaixa.mockImplementation(() => new Promise((done) => { resolve = done }))
  let first!: Promise<void>
  act(() => { first = api.handleNovaVendaOuEspera(); void api.handleNovaVendaOuEspera() })
  expect(actions.colocarVendaEmEsperaCaixa).toHaveBeenCalledTimes(1)
  expect(actions.colocarVendaEmEsperaCaixa).toHaveBeenCalledWith(expect.objectContaining({ itens: [item], clienteId: "cliente", totalLiquido: 9.5 }))
  await act(async () => { resolve({ ok: true, id: "espera", numeroLocal: 1 }); await first })
  expect(deps.novoCupom).toHaveBeenCalledTimes(1)
})
it("falha de gravação mantém cupom e libera nova tentativa", async () => {
  actions.colocarVendaEmEsperaCaixa.mockRejectedValue(new Error("Rede indisponível"))
  await act(async () => api.handleNovaVendaOuEspera())
  expect(deps.novoCupom).not.toHaveBeenCalled()
  expect(api.processandoEspera).toBe(false)
  expect(deps.setCaixaMensagem).toHaveBeenCalledWith("Rede indisponível", { kind: "error" })
})
it("retomada restaura cliente, desconto manual e origem exclusiva", async () => {
  deps.itens = []
  actions.retomarVendaEmEsperaCaixa.mockResolvedValue({ ok: true, id: "espera", numeroLocal: 1, itens: [item], clienteId: null })
  await act(async () => root.render(<Harness />))
  await act(async () => api.handleRetomarEmEspera("espera"))
  expect(deps.substituirCarrinho).toHaveBeenCalledWith([item])
  expect(deps.setVendaEmEsperaOrigemId).toHaveBeenCalledWith("espera")
  expect(deps.setClienteId).toHaveBeenCalledWith(null)
  expect(deps.limparEstadoDescontoGerente).toHaveBeenCalledTimes(1)
})
