import { useEffect } from "react"

/** Atalhos extras do layout PDV clássico (Fase E). Layout único desde a Fase 6.1 (Onda 3). */
export type CaixaPdvClassicAtalhos = {
  onExcluirVenda: () => void
  onFinalizarVenda: () => void
  /** Só registra Alt+Z/C/B quando `abas` for passado. */
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
  /** F3: consulta rápida de produto (sem adicionar ao carrinho). */
  onConsultaRapida?: () => void
  /** Ctrl+Z: repõe o último item removido do carrinho (achado #13). */
  onDesfazerRemocao?: () => void
  /**
   * Teclas 1–4: seleciona a forma de pagamento (Dinheiro/PIX/Débito/Crédito),
   * na mesma ordem do seletor. Segue a semântica dos demais atalhos: só dispara
   * FORA de campo de texto (não interfere na digitação de código de barras).
   */
  onSelecionarMetodo?: (indice: 1 | 2 | 3 | 4) => void
  pdvClassicAtalhos?: CaixaPdvClassicAtalhos | null
}

const CODE_TO_METODO_INDICE: Record<string, 1 | 2 | 3 | 4> = {
  Digit1: 1,
  Numpad1: 1,
  Digit2: 2,
  Numpad2: 2,
  Digit3: 3,
  Numpad3: 3,
  Digit4: 4,
  Numpad4: 4,
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
  onConsultaRapida,
  onDesfazerRemocao,
  onSelecionarMetodo,
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
      if (e.code === "F3") {
        e.preventDefault()
        onConsultaRapida?.()
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
      // 1–4: forma de pagamento (sem modificadores). Mesma semântica dos F:
      // já barrado em campo de texto pelo guard no topo, então não conflita
      // com a digitação de código de barras.
      if (
        onSelecionarMetodo &&
        !e.ctrlKey &&
        !e.altKey &&
        !e.shiftKey &&
        !e.metaKey &&
        CODE_TO_METODO_INDICE[e.code]
      ) {
        e.preventDefault()
        onSelecionarMetodo(CODE_TO_METODO_INDICE[e.code])
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
    onConsultaRapida,
    onDesfazerRemocao,
    onSelecionarMetodo,
    pdvClassicAtalhos,
  ])
}
