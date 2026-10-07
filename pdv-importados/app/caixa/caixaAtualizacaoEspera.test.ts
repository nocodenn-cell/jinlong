import { afterEach, expect, it, vi } from "vitest"
import { atualizarPedidoEspera } from "./caixaAtualizacaoEspera"
afterEach(() => vi.restoreAllMocks())
it("falha retornada na conversão é avisada sem reabrir finalização", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {})
  const aviso = vi.fn()
  await expect(atualizarPedidoEspera("espera", async () => ({ ok: false, error: "Conversão falhou" }), aviso, "Falha")).resolves.toBeUndefined()
  expect(aviso).toHaveBeenCalledWith("Conversão falhou")
})
it("falha de rede recebe mensagem descritiva centralizada", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {})
  const aviso = vi.fn()
  await atualizarPedidoEspera("espera", async () => { throw new Error("Rede") }, aviso, "Não foi possível devolver o pedido")
  expect(aviso).toHaveBeenCalledWith("Não foi possível devolver o pedido")
})
