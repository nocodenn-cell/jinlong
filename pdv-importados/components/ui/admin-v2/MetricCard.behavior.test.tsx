/** @vitest-environment jsdom */
import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { MetricCard } from "./MetricCard"

// Auditoria UI/UX P0-2: valores monetários não podem ser cortados com "…" e o card
// não deve reservar largura fantasma quando não há sparkline.

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  // jsdom não tem ResizeObserver (usado pelo sparkline).
  if (!("ResizeObserver" in globalThis)) {
    ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      observe() {}
      disconnect() {}
    }
  }
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function valorEl(valor: string) {
  return container.querySelector<HTMLDivElement>(`[title="${valor}"]`)!
}

describe("MetricCard — valores monetários", () => {
  it.each(["R$ 4.253,30", "-R$ 46.596,70"])("não trunca %s", (valor) => {
    act(() => root.render(<MetricCard label="Saldo" value={valor} />))
    const el = valorEl(valor)
    expect(el.className).not.toContain("truncate")
    expect(el.className).toContain("whitespace-nowrap")
  })

  it("sem sparkline não renderiza slot reservado (sem largura fantasma)", () => {
    act(() => root.render(<MetricCard label="Saldo" value="R$ 4.253,30" />))
    expect(container.querySelector("canvas")).toBeNull()
    expect(container.querySelector(".h-11.w-24")).toBeNull()
    expect(container.querySelector(".h-11.w-16")).toBeNull()
  })

  it("com sparkline mantém o canvas e usa fonte compatível com a largura reduzida", () => {
    act(() =>
      root.render(<MetricCard label="Vendas" value="R$ 4.253,30" sparkData={[1, 2, 3]} />),
    )
    expect(container.querySelector("canvas")).not.toBeNull()
    const el = valorEl("R$ 4.253,30")
    expect(el.className).toContain("text-h2")
    expect(el.className).not.toContain("2xl:text-h1")
  })
})
