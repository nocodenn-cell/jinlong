/** @vitest-environment jsdom */
import React from "react"
import { createRoot, type Root } from "react-dom/client"
import { flushSync } from "react-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"

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

function renderGroup(value: string, onValueChange: (v: string) => void) {
  flushSync(() => {
    root.render(
      <RadioGroup value={value} onValueChange={onValueChange} aria-label="Forma de pagamento">
        <RadioGroupItem value="dinheiro">Dinheiro</RadioGroupItem>
        <RadioGroupItem value="pix">Pix</RadioGroupItem>
        <RadioGroupItem value="debito" disabled>
          Débito
        </RadioGroupItem>
      </RadioGroup>,
    )
  })
}

describe("RadioGroup", () => {
  it('renderiza role="radiogroup" no wrapper e role="radio" em cada item', () => {
    renderGroup("dinheiro", () => {})
    expect(container.querySelector('[role="radiogroup"]')).not.toBeNull()
    expect(container.querySelectorAll('[role="radio"]')).toHaveLength(3)
  })

  it("marca aria-checked=true apenas no item selecionado", () => {
    renderGroup("pix", () => {})
    const radios = Array.from(container.querySelectorAll('[role="radio"]'))
    const checked = radios.filter((r) => r.getAttribute("aria-checked") === "true")
    expect(checked).toHaveLength(1)
    expect(checked[0].textContent).toBe("Pix")
  })

  it("clicar em um item chama onValueChange com o value correspondente", () => {
    const onValueChange = vi.fn()
    renderGroup("dinheiro", onValueChange)
    const pixButton = Array.from(container.querySelectorAll('[role="radio"]')).find(
      (b) => b.textContent === "Pix",
    ) as HTMLButtonElement

    flushSync(() => {
      pixButton.click()
    })

    expect(onValueChange).toHaveBeenCalledWith("pix")
  })

  it("item disabled não dispara onValueChange e fica com atributo disabled", () => {
    const onValueChange = vi.fn()
    renderGroup("dinheiro", onValueChange)
    const debitoButton = Array.from(container.querySelectorAll('[role="radio"]')).find(
      (b) => b.textContent === "Débito",
    ) as HTMLButtonElement

    expect(debitoButton.disabled).toBe(true)

    flushSync(() => {
      debitoButton.click()
    })

    expect(onValueChange).not.toHaveBeenCalled()
  })
})
