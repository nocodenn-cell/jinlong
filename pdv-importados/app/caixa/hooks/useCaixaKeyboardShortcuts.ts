import { useEffect } from "react"

/** Atalhos extras do layout PDV clássico (Fase E). Só passar quando `NEXT_PUBLIC_CAIXA_PDV_LAYOUT=classic`. */
export type CaixaPdvClassicAtalhos = {
  onExcluirVenda: () => void
  onFinalizarVenda: () => void
  /** Só registra Alt+Z/C/B quando `abas` for passado (layout PDV clássico). */
  abas?: {
    produto?: () => void
    cliente?: () => void
    pgto?: () => void
  }
}

type Params = {
  caixaAberto: boolean
  movimentandoCaixa: boolean
  onAbrirSuprimento: () => void
  onAbrirSangria: () => void
  onFinalizar: () => void
  onFecharCaixa: () => void
  onFocarBusca: () => void
  onNovoCupom: () => void
  onReimprimir?: () => void
  /** Ctrl+Z: repõe o último item removido do carrinho (achado #13). */
  onDesfazerRemocao?: () => void
  pdvClassicAtalhos?: CaixaPdvClassicAtalhos | null
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
  onNovoCupom,
  onReimprimir,
  onDesfazerRemocao,
  pdvClassicAtalhos = null,
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
      if (e.code === "F4" || e.code === "F9") {
        e.preventDefault()
        onFinalizar()
        return
      }
      if (e.code === "F2") {
        e.preventDefault()
        onFocarBusca()
        return
      }
      if (e.code === "F6") {
        e.preventDefault()
        onFecharCaixa()
        return
      }
      if (e.code === "F8") {
        e.preventDefault()
        onNovoCupom()
        return
      }
      if (e.code === "F12") {
        e.preventDefault()
        onReimprimir?.()
        return
      }
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.code === "KeyB") {
        e.preventDefault()
        onFocarBusca()
        return
      }
      // Ctrl+Z fora de campo de texto (guard no topo do handler) → desfazer
      // remoção de item. Em input/textarea o undo nativo do navegador segue.
      if (onDesfazerRemocao && e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey && e.code === "KeyZ") {
        e.preventDefault()
        onDesfazerRemocao()
        return
      }
      if (
        pdvClassicAtalhos &&
        e.altKey &&
        !e.ctrlKey &&
        !e.shiftKey &&
        !e.metaKey
      ) {
        if (e.code === "KeyQ") {
          e.preventDefault()
          pdvClassicAtalhos.onExcluirVenda()
          return
        }
        if (e.code === "KeyS") {
          e.preventDefault()
          pdvClassicAtalhos.onFinalizarVenda()
          return
        }
        const abas = pdvClassicAtalhos.abas
        if (abas?.produto && e.code === "KeyZ") {
          e.preventDefault()
          abas.produto()
          return
        }
        if (abas?.cliente && e.code === "KeyC") {
          e.preventDefault()
          abas.cliente()
          return
        }
        if (abas?.pgto && e.code === "KeyB") {
          e.preventDefault()
          abas.pgto()
          return
        }
      }
    }
    globalThis.addEventListener("keydown", onKey)
    return () => globalThis.removeEventListener("keydown", onKey)
  }, [
    onFecharCaixa,
    onFinalizar,
    onFocarBusca,
    onNovoCupom,
    onReimprimir,
    onDesfazerRemocao,
    pdvClassicAtalhos,
  ])
}
