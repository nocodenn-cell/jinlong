/** @vitest-environment jsdom */
import React from "react"
import { createRoot, type Root } from "react-dom/client"
import { act } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { getMessages } from "@/i18n/getMessages"
import type { TrocaContexto } from "@/app/caixa/caixaTrocaOperadorRegras"

const actions = vi.hoisted(() => ({
  obterContextoTrocaOperador: vi.fn(),
  liberarCaixaParaTroca: vi.fn(),
  assumirCaixaLiberado: vi.fn(),
  bloquearCaixaOperador: vi.fn(),
  desbloquearCaixaComPin: vi.fn(),
}))
vi.mock("@/app/caixa/actions", () => actions)
const logout = vi.hoisted(() => ({ performClientLogout: vi.fn(async () => ({ ok: true as const })) }))
vi.mock("@/lib/auth/clientLogout", () => logout)
vi.mock("@/lib/caixa/resetCarrinhoPersistido", () => ({ resetCarrinhoPersistido: vi.fn() }))

import {
  CaixaTrocaAvisos,
  CaixaTrocaControles,
  CaixaTrocaModais,
  useCaixaTrocaOperador,
} from "@/app/caixa/CaixaTrocaOperador"
import type { MotivoTrocaBloqueada } from "@/app/caixa/caixaTrocaOperadorRegras"

const m = getMessages("pt")
let container: HTMLDivElement
let root: Root

const base: TrocaContexto = { operando: null, bloqueado: null, proprioEmUso: null, liberados: [], pin: { exigido: false, minutos: 3 } }

function Tela({ userId, motivo = null, aviso, onMudou }: { userId: string; motivo?: MotivoTrocaBloqueada; aviso: (t: string) => void; onMudou: () => void }) {
  const troca = useCaixaTrocaOperador({ m, statusKey: "k", motivoBloqueada: motivo, onMudou, aviso })
  return (
    <>
      <CaixaTrocaControles m={m} troca={troca} userId={userId} />
      <CaixaTrocaAvisos m={m} troca={troca} />
      <CaixaTrocaModais m={m} troca={troca} operadorLabel="Bruno" />
    </>
  )
}

async function montar(ctx: TrocaContexto, props: Partial<React.ComponentProps<typeof Tela>> = {}) {
  actions.obterContextoTrocaOperador.mockResolvedValue({ ok: true, data: ctx })
  const aviso = vi.fn()
  const onMudou = vi.fn()
  await act(async () => {
    root.render(<Tela userId="bruno" aviso={aviso} onMudou={onMudou} {...props} />)
  })
  return { aviso, onMudou }
}
const q = (id: string) => container.querySelector(`[data-testid="${id}"]`) as HTMLElement | null

beforeEach(() => {
  vi.clearAllMocks()
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe("Troca Segura de Operador — tela do caixa", () => {
  it("sem caixa operado nem turno liberado: nada aparece (PDV igual ao de hoje)", async () => {
    await montar(base)
    expect(q("caixa-btn-trocar-operador")).toBeNull()
    expect(q("caixa-troca-avisos")).toBeNull()
  })

  it("operando o turno de outra pessoa: mostra 'Turno de' e o botão de troca; sem PIN não há Bloquear", async () => {
    await montar({ ...base, operando: { caixaId: "c1", responsavelId: "ana", responsavelNome: "Ana" } })
    expect(q("caixa-turno-de")?.textContent).toBe("Turno de: Ana")
    expect(q("caixa-btn-trocar-operador")).toBeTruthy()
    expect(q("caixa-btn-bloquear")).toBeNull()
  })

  it("carrinho com itens bloqueia a troca com aviso (não libera o caixa)", async () => {
    const { aviso } = await montar({ ...base, operando: { caixaId: "c1", responsavelId: "bruno", responsavelNome: "Bruno" } }, { motivo: "carrinho" })
    expect(q("caixa-turno-de")).toBeNull()
    act(() => q("caixa-btn-trocar-operador")!.click())
    expect(aviso).toHaveBeenCalledWith(m.caixa.troca_bloqueada_carrinho, { kind: "warning" })
    expect(actions.liberarCaixaParaTroca).not.toHaveBeenCalled()
  })

  it("confirmar a troca libera o caixa, encerra a sessão e vai ao login", async () => {
    const assign = vi.fn()
    vi.stubGlobal("location", { ...globalThis.location, assign, reload: vi.fn() })
    actions.liberarCaixaParaTroca.mockResolvedValue({ ok: true, data: undefined })
    await montar({ ...base, operando: { caixaId: "c1", responsavelId: "bruno", responsavelNome: "Bruno" } })
    act(() => q("caixa-btn-trocar-operador")!.click())
    const confirmar = [...document.querySelectorAll("button")].find((b) => b.textContent === m.caixa.troca_btn && !b.dataset.testid)!
    await act(async () => confirmar.click())
    expect(actions.liberarCaixaParaTroca).toHaveBeenCalledWith("c1")
    expect(logout.performClientLogout).toHaveBeenCalled()
    expect(assign).toHaveBeenCalledWith("/login?next=%2Fcaixa&reason=troca_operador")
    vi.unstubAllGlobals()
  })

  it("turno liberado: o próximo operador assume e o status recarrega", async () => {
    actions.assumirCaixaLiberado.mockResolvedValue({ ok: true, data: undefined })
    const { onMudou } = await montar({ ...base, liberados: [{ caixaId: "c1", responsavelNome: "Ana", dataAbertura: null }] })
    expect(q("caixa-troca-avisos")?.textContent).toContain("Turno de Ana")
    await act(async () => q("caixa-btn-assumir-caixa")!.click())
    expect(actions.assumirCaixaLiberado).toHaveBeenCalledWith("c1")
    expect(onMudou).toHaveBeenCalled()
  })

  it("assumir caixa em uso mostra o erro do servidor", async () => {
    actions.assumirCaixaLiberado.mockResolvedValue({ ok: false, erro: "em_uso" })
    const { aviso } = await montar({ ...base, liberados: [{ caixaId: "c1", responsavelNome: "Ana", dataAbertura: null }] })
    await act(async () => q("caixa-btn-assumir-caixa")!.click())
    expect(aviso).toHaveBeenCalledWith(m.caixa.troca_erro_em_uso, { kind: "error" })
  })

  it("responsável vê que o próprio turno está com outra pessoa", async () => {
    await montar({ ...base, proprioEmUso: { caixaId: "c1", operadorNome: "Bruno", liberado: false, bloqueado: false } })
    expect(q("caixa-troca-avisos")?.textContent).toContain("Seu turno está com Bruno")
  })

  it("bloqueado: tela de PIN; PIN errado mostra erro; 4 dígitos certos desbloqueiam", async () => {
    actions.desbloquearCaixaComPin.mockResolvedValueOnce({ ok: false, erro: "pin_incorreto" })
    await montar({ ...base, bloqueado: { caixaId: "c1" }, pin: { exigido: true, minutos: 3 } })
    const input = q("caixa-bloqueio-pin") as HTMLInputElement
    expect(q("caixa-tela-bloqueio")).toBeTruthy()
    const digitar = async (v: string) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!
      await act(async () => {
        setter.call(input, v)
        input.dispatchEvent(new Event("input", { bubbles: true }))
      })
    }
    await digitar("1357")
    expect(actions.desbloquearCaixaComPin).toHaveBeenCalledWith("1357")
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(m.caixa.troca_erro_pin_incorreto)
    actions.desbloquearCaixaComPin.mockResolvedValueOnce({ ok: true, data: undefined })
    actions.obterContextoTrocaOperador.mockResolvedValue({ ok: true, data: { ...base, operando: { caixaId: "c1", responsavelId: "bruno", responsavelNome: "Bruno" } } })
    await digitar("2468")
    expect(q("caixa-tela-bloqueio")).toBeNull()
  })

  it("com PIN exigido, inatividade bloqueia o caixa no servidor", async () => {
    vi.useFakeTimers()
    actions.bloquearCaixaOperador.mockResolvedValue({ ok: true, data: undefined })
    await montar({ ...base, operando: { caixaId: "c1", responsavelId: "bruno", responsavelNome: "Bruno" }, pin: { exigido: true, minutos: 1 } })
    expect(q("caixa-btn-bloquear")).toBeTruthy()
    await act(async () => {
      vi.advanceTimersByTime(60_000)
    })
    expect(actions.bloquearCaixaOperador).toHaveBeenCalledWith("INATIVIDADE")
    vi.useRealTimers()
  })
})
