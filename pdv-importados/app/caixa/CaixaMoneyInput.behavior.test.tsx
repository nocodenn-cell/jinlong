/** @vitest-environment jsdom */
import React, { act, useState } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { CaixaMoneyInput } from "./CaixaMoneyInput"
let container: HTMLDivElement
let root: ReturnType<typeof createRoot>
let current = 0
function Harness() {
  const [value, setValue] = useState(0)
  current = value
  return <><CaixaMoneyInput aria-label="Recebido" value={value} onValueChange={setValue} /><button onClick={() => setValue(12.5)}>Atualizar externo</button></>
}
beforeEach(() => {
  container = document.createElement("div"); document.body.appendChild(container)
  root = createRoot(container); act(() => root.render(<Harness />))
})
afterEach(() => { act(() => root.unmount()); container.remove() })
function type(raw: string) {
  const input = container.querySelector("input")!
  act(() => {
    input.focus()
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, raw)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
  return input.value
}
it("sincroniza atualização externa mesmo durante foco", () => {
  type("50")
  act(() => container.querySelector("button")!.click())
  expect(container.querySelector("input")!.value).toBe("12,50")
})

describe("valor recebido sem reformatar durante digitação", () => {
  it("preserva vírgula e centavos intermediários", () => {
    for (const value of ["1", "12", "12,", "12,5", "12,50"]) expect(type(value)).toBe(value)
    expect(current).toBe(12.5)
  })
  it("aceita colar milhares BRL, ponto decimal e apagar tudo", () => {
    type("1.234,56"); expect(current).toBe(1234.56)
    type("25.90"); expect(current).toBe(25.9)
    type(""); expect(current).toBe(0)
  })
  it("rejeita negativos, expoentes e mais de dois centavos", () => {
    type("50"); type("-5"); expect(current).toBe(50)
    type("1e3"); expect(current).toBe(50)
    type("50,123"); expect(current).toBe(50)
  })
})
