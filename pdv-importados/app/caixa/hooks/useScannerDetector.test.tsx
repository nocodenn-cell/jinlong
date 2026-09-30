/** @vitest-environment jsdom */
import React from "react"
import { createRoot, type Root } from "react-dom/client"
import { act } from "react-dom/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { scannerBurstEmAndamento, useScannerDetector } from "@/hooks/useScannerDetector"

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

  // ── Simulação HID / keyboard-wedge ──────────────────────────────────────
  // Leitor real digita o código inteiro em rajada (~5–20ms por caractere) e
  // encerra com Enter. Os casos abaixo cobrem o roteiro que será repetido com
  // o leitor físico: código completo, bipes repetidos, produtos em sequência,
  // e ausência de duplo processamento.

  /** Digita `codigo` em rajada a `intervaloMs` por caractere e finaliza com Enter. */
  function bipar(codigo: string, intervaloMs = 12, t0 = 0) {
    let t = t0
    for (const ch of codigo) {
      vi.setSystemTime(new Date(2026, 0, 1, 0, 0, 0, t))
      press(ch)
      t += intervaloMs
    }
    vi.setSystemTime(new Date(2026, 0, 1, 0, 0, 0, t))
    press("Enter")
    return t + intervaloMs
  }

  it("lê um EAN-13 completo em rajada, sem perder caractere", () => {
    const onScan = vi.fn()
    mount(onScan)

    bipar("7898512340003")

    expect(onScan).toHaveBeenCalledTimes(1)
    expect(onScan).toHaveBeenCalledWith("7898512340003")
  })

  it("lê código interno alfanumérico (CODE128) por inteiro", () => {
    const onScan = vi.fn()
    mount(onScan)

    bipar("ABC-1234")

    expect(onScan).toHaveBeenCalledWith("ABC-1234")
  })

  it("um Enter = uma leitura (sem duplo processamento)", () => {
    const onScan = vi.fn()
    mount(onScan)

    const t = bipar("7898512340003")
    // Enter extra do operador (ou repique do leitor) não repete a leitura:
    // o buffer já foi drenado pelo primeiro Enter.
    vi.setSystemTime(new Date(2026, 0, 1, 0, 0, 0, t))
    press("Enter")

    expect(onScan).toHaveBeenCalledTimes(1)
  })

  it("bipe repetido do MESMO produto gera duas leituras independentes", () => {
    const onScan = vi.fn()
    mount(onScan)

    const t = bipar("7898512340003")
    bipar("7898512340003", 12, t + 300)

    expect(onScan).toHaveBeenCalledTimes(2)
    expect(onScan).toHaveBeenNthCalledWith(1, "7898512340003")
    expect(onScan).toHaveBeenNthCalledWith(2, "7898512340003")
  })

  it("produtos diferentes em sequência não se misturam", () => {
    const onScan = vi.fn()
    mount(onScan)

    const t = bipar("7898512340003")
    const t2 = bipar("7898512340005", 12, t + 250)
    bipar("camisa preta", 12, t2 + 250)

    expect(onScan.mock.calls.map((c) => c[0])).toEqual([
      "7898512340003",
      "7898512340005",
      "camisa preta",
    ])
  })

  it("código abaixo do comprimento mínimo é descartado (ruído de tecla)", () => {
    const onScan = vi.fn()
    mount(onScan)

    bipar("42")

    expect(onScan).not.toHaveBeenCalled()
  })

  /**
   * Fronteira de tolerância entre teclas (`maxIntervalMs`, hoje 40ms). Um
   * intervalo MAIOR reinicia a rajada — o que sobra é só o trecho final. Fica
   * fixado em teste porque define a folga real do pipeline: se a main thread
   * travar acima disso no meio de uma leitura, o código chega truncado em vez
   * de chegar errado silenciosamente sem ninguém saber por quê.
   */
  it("intervalo acima da tolerância reinicia a rajada (código truncado, não corrompido)", () => {
    const onScan = vi.fn()
    mount(onScan)

    vi.setSystemTime(new Date(2026, 0, 1, 0, 0, 0, 0))
    press("7")
    vi.setSystemTime(new Date(2026, 0, 1, 0, 0, 0, 12))
    press("8")
    // engasgo de 60ms (> 40ms) no meio da leitura
    vi.setSystemTime(new Date(2026, 0, 1, 0, 0, 0, 72))
    press("9")
    vi.setSystemTime(new Date(2026, 0, 1, 0, 0, 0, 84))
    press("1")
    vi.setSystemTime(new Date(2026, 0, 1, 0, 0, 0, 96))
    press("2")
    vi.setSystemTime(new Date(2026, 0, 1, 0, 0, 0, 108))
    press("Enter")

    expect(onScan).toHaveBeenCalledWith("912")
  })
  describe("rajada em andamento (refoco do campo de busca)", () => {
    it("foco em input no meio da rajada descarta o começo do código (regressão que motiva o adiamento do refoco)", () => {
      const onScan = vi.fn()
      mount(onScan)
      const input = document.createElement("input")
      document.body.appendChild(input)

      let t = 0
      for (const ch of "78985") {
        vi.setSystemTime(new Date(2026, 0, 1, 0, 0, 0, t))
        press(ch)
        t += 10
      }
      // campo ganha foco no meio da rajada: o resto da leitura passa a ter alvo editável
      for (const ch of "12340003") {
        vi.setSystemTime(new Date(2026, 0, 1, 0, 0, 0, t))
        press(ch, input)
        t += 10
      }
      vi.setSystemTime(new Date(2026, 0, 1, 0, 0, 0, t))
      press("Enter", input)

      expect(onScan).not.toHaveBeenCalled()
      input.remove()
    })

    it("scannerBurstEmAndamento: true durante a rajada, false após Enter ou silêncio", () => {
      const onScan = vi.fn()
      mount(onScan)
      expect(scannerBurstEmAndamento()).toBe(false)

      vi.setSystemTime(new Date(2026, 0, 1, 0, 0, 0, 0))
      press("7")
      vi.setSystemTime(new Date(2026, 0, 1, 0, 0, 0, 10))
      press("8")
      expect(scannerBurstEmAndamento()).toBe(true)

      vi.setSystemTime(new Date(2026, 0, 1, 0, 0, 0, 20))
      press("9")
      press("Enter")
      expect(scannerBurstEmAndamento()).toBe(false)

      vi.setSystemTime(new Date(2026, 0, 1, 0, 0, 1, 0))
      press("7")
      vi.setSystemTime(new Date(2026, 0, 1, 0, 0, 1, 500))
      expect(scannerBurstEmAndamento()).toBe(false)
    })
  })
})

