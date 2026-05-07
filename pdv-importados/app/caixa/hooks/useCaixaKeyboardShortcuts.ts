import { useEffect } from "react"

type Params = {
  caixaAberto: boolean
  movimentandoCaixa: boolean
  onAbrirSuprimento: () => void
  onAbrirSangria: () => void
  onFinalizar: () => void
  onFecharCaixa: () => void
  onFocarBusca: () => void
}

function alvoEhCampoTexto(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true
  if (target.isContentEditable) return true
  if (target.closest("[data-caixa-atalho-bloqueado='true']")) return true
  return false
}

export function useCaixaKeyboardShortcuts({
  caixaAberto,
  movimentandoCaixa,
  onAbrirSuprimento,
  onAbrirSangria,
  onFinalizar,
  onFecharCaixa,
  onFocarBusca,
}: Params) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey && e.shiftKey)) return
      if (e.repeat) return
      if (!caixaAberto || movimentandoCaixa) return
      if (e.code === "KeyS") {
        e.preventDefault()
        onAbrirSuprimento()
      } else if (e.code === "KeyR") {
        e.preventDefault()
        onAbrirSangria()
      }
    }
    globalThis.addEventListener("keydown", onKey)
    return () => globalThis.removeEventListener("keydown", onKey)
  }, [caixaAberto, movimentandoCaixa, onAbrirSangria, onAbrirSuprimento])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return
      if (alvoEhCampoTexto(e.target)) return
      if (e.code === "F4") {
        e.preventDefault()
        onFinalizar()
        return
      }
      if (e.code === "F6") {
        e.preventDefault()
        onFecharCaixa()
        return
      }
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.code === "KeyB") {
        e.preventDefault()
        onFocarBusca()
      }
    }
    globalThis.addEventListener("keydown", onKey)
    return () => globalThis.removeEventListener("keydown", onKey)
  }, [onFecharCaixa, onFinalizar, onFocarBusca])
}
