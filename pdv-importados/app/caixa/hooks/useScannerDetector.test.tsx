/** @vitest-environment jsdom */
import React from "react"
import { createRoot, type Root } from "react-dom/client"
import { act } from "react-dom/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useScannerDetector } from "@/hooks/useScannerDetector"

function TestHarness({ onScan }: { onScan: (code: string) => void }) {
  useScannerDetector(onScan, {
    maxIntervalMs: 40,
    flushTimeoutMs: 100,
    minLength: 3,
  })
  return null
}

describe("useScannerDetector", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"))
    container = document.createElement("div")
    document.body.appendChild(container)
  })

  afterEach(() => {
    root?.unmount()
    container.remove()
    vi.useRealTimers()
  })

  function mount(onScan: (code: string) => void) {
    root = createRoot(container)
    act(() => {
      root.render(<TestHarness onScan={onScan} />)
    })
  }

  function press(key: string, target: EventTarget = window) {
    const ev = new KeyboardEvent("keydown", { key, bubbles: true })
    act(() => {
      target.dispatchEvent(ev)
    })
  }

  it("detecta sequência rápida com Enter", () => {
    const onScan = vi.fn()
    mount(onScan)

    press("1")
    vi.setSystemTime(new Date("2026-01-01T00:00:00.020Z"))
    press("2")
    vi.setSystemTime(new Date("2026-01-01T00:00:00.035Z"))
    press("3")
    vi.setSystemTime(new Date("2026-01-01T00:00:00.050Z"))
    press("Enter")

    expect(onScan).toHaveBeenCalledWith("123")
  })

  it("ignora digitação lenta", () => {
    const onScan = vi.fn()
    mount(onScan)

    press("1")
    vi.setSystemTime(new Date("2026-01-01T00:00:00.120Z"))
    press("2")
    vi.setSystemTime(new Date("2026-01-01T00:00:00.240Z"))
    press("3")
    press("Enter")

    expect(onScan).not.toHaveBeenCalled()
  })

  it("não captura quando foco está em input editável", () => {
    const onScan = vi.fn()
    mount(onScan)

    const input = document.createElement("input")
    document.body.appendChild(input)
    input.focus()

    press("7", input)
    vi.setSystemTime(new Date("2026-01-01T00:00:00.010Z"))
    press("8", input)
    vi.setSystemTime(new Date("2026-01-01T00:00:00.020Z"))
    press("9", input)
    press("Enter", input)

    expect(onScan).not.toHaveBeenCalled()
    input.remove()
  })
})

