/** @vitest-environment jsdom */
import React from "react"
import { createRoot, type Root } from "react-dom/client"
import { flushSync } from "react-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Select } from "@/components/ui/select"

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  flushSync(() => root.unmount())
  container.remove()
})

describe("Select", () => {
  it("renderiza como <select> nativo com as opções passadas", () => {
    flushSync(() => {
      root.render(
        <Select aria-label="Forma de pagamento" value="DINHEIRO" onChange={() => {}}>
          <option value="DINHEIRO">Dinheiro</option>
          <option value="PIX">Pix</option>
        </Select>,
      )
    })
    const select = container.querySelector("select")
    expect(select).not.toBeNull()
    expect(select?.value).toBe("DINHEIRO")
    expect(select?.querySelectorAll("option")).toHaveLength(2)
  })

  it("dispara onChange com o novo valor selecionado", () => {
    const onChange = vi.fn()
    flushSync(() => {
      root.render(
        <Select aria-label="Forma de pagamento" value="DINHEIRO" onChange={onChange}>
          <option value="DINHEIRO">Dinheiro</option>
          <option value="PIX">Pix</option>
        </Select>,
      )
    })
    const select = container.querySelector("select") as HTMLSelectElement

    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLSelectElement.prototype,
      "value",
    )?.set
    flushSync(() => {
      nativeSetter?.call(select, "PIX")
      select.dispatchEvent(new Event("change", { bubbles: true }))
    })

    expect(onChange).toHaveBeenCalledOnce()
  })

  it("aceita disabled e className customizada", () => {
    flushSync(() => {
      root.render(
        <Select aria-label="Forma" value="DINHEIRO" onChange={() => {}} disabled className="custom-class">
          <option value="DINHEIRO">Dinheiro</option>
        </Select>,
      )
    })
    const select = container.querySelector("select")
    expect(select?.disabled).toBe(true)
    expect(select?.className).toContain("custom-class")
  })
})
