import { useEffect } from "react"
import { CAIXA_ATALHOS, atalhoCombina } from "@/app/caixa/caixaAtalhos"

/** Atalhos extras do layout PDV clássico (Fase E). Layout único desde a Fase 6.1 (Onda 3). */
export type CaixaPdvClassicAtalhos = {
  onExcluirVenda: () => void
  onFinalizarVenda: () => void
  /** Só registra Alt+Z/C/B quando `abas` for passado. */
  abas?: {
    /** Alt+Z — foco no bloco de leitura/busca de produto. */
    produto?: () => void
    /** Alt+C — vincular cliente ao cupom atual. */
    cliente?: () => void
    /** Alt+B — foco no bloco de pagamento. */
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
  /** F1: abre referência de atalhos (Fase 3). */
  onAbrirReferencia?: () => void
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

/**
 * Com um diálogo aberto o foco costuma estar num botão (Confirmar/Cancelar), não
 * num campo de texto — então `alvoEhCampoTexto` não basta e os atalhos globais
 * agiriam por baixo do modal (F4/F9 finalizava a venda atrás da confirmação de
 * estorno; 1–4 trocava a forma de pagamento). Todo overlay do PDV carrega o role
 * de diálogo (DragonModal, recibo, histórico), então um seletor cobre todos.
 * Seletor sem aspas de propósito: mantém a métrica `raw_dialog_caixa` do
 * burndown do DS contando só diálogos crus de verdade, não esta detecção.
 */
function existeDialogAberto(): boolean {
  if (typeof document === "undefined") return false
  return document.querySelector("[role=dialog]") !== null
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
  onAbrirReferencia,
  pdvClassicAtalhos = null,
}: Params) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const suprimento = atalhoCombina(CAIXA_ATALHOS.suprimento, e)
      if (!suprimento && !atalhoCombina(CAIXA_ATALHOS.sangria, e)) return
      if (e.repeat) return
      if (!caixaAberto || movimentandoCaixa) return
      if (alvoEhCampoTexto(e.target) || existeDialogAberto()) return
      e.preventDefault()
      if (suprimento) onAbrirSuprimento()
      else onAbrirSangria()
    }
    globalThis.addEventListener("keydown", onKey)
    return () => globalThis.removeEventListener("keydown", onKey)
  }, [caixaAberto, movimentandoCaixa, onAbrirSangria, onAbrirSuprimento])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return
      if (alvoEhCampoTexto(e.target)) return
      // F1 alterna a própria referência de atalhos, por isso passa antes do
      // guard de diálogo (é o único atalho que deve agir com ela aberta).
      if (atalhoCombina(CAIXA_ATALHOS.ajuda, e)) {
        e.preventDefault()
        onAbrirReferencia?.()
        return
      }
      if (existeDialogAberto()) return
      if (atalhoCombina(CAIXA_ATALHOS.finalizar, e)) {
        e.preventDefault()
        onFinalizar()
        return
      }
      if (atalhoCombina(CAIXA_ATALHOS.buscar, e)) {
        e.preventDefault()
        onFocarBusca()
        return
      }
      if (atalhoCombina(CAIXA_ATALHOS.consultaRapida, e)) {
        e.preventDefault()
        onConsultaRapida?.()
        return
      }
      if (atalhoCombina(CAIXA_ATALHOS.fecharCaixa, e)) {
        e.preventDefault()
        onFecharCaixa()
        return
      }
      if (atalhoCombina(CAIXA_ATALHOS.novoCupom, e)) {
        e.preventDefault()
        onNovoCupom()
        return
      }
      if (atalhoCombina(CAIXA_ATALHOS.reimprimir, e)) {
        e.preventDefault()
        onReimprimir?.()
        return
      }
      // 1–4: forma de pagamento (sem modificadores). Mesma semântica dos F:
      // já barrado em campo de texto pelo guard no topo, então não conflita
      // com a digitação de código de barras.
      const indiceMetodo = CAIXA_ATALHOS.metodoPagamento.findIndex((a) => atalhoCombina(a, e))
      if (onSelecionarMetodo && indiceMetodo >= 0) {
        e.preventDefault()
        onSelecionarMetodo((indiceMetodo + 1) as 1 | 2 | 3 | 4)
        return
      }
      // Ctrl+Z fora de campo de texto (guard no topo do handler) → desfazer
      // remoção de item. Em input/textarea o undo nativo do navegador segue.
      if (onDesfazerRemocao && atalhoCombina(CAIXA_ATALHOS.desfazerRemocao, e)) {
        e.preventDefault()
        onDesfazerRemocao()
        return
      }
      if (pdvClassicAtalhos) {
        if (atalhoCombina(CAIXA_ATALHOS.excluirVenda, e)) {
          e.preventDefault()
          pdvClassicAtalhos.onExcluirVenda()
          return
        }
        if (atalhoCombina(CAIXA_ATALHOS.finalizarClassico, e)) {
          e.preventDefault()
          pdvClassicAtalhos.onFinalizarVenda()
          return
        }
        const abas = pdvClassicAtalhos.abas
        if (abas?.produto && atalhoCombina(CAIXA_ATALHOS.focoProduto, e)) {
          e.preventDefault()
          abas.produto()
          return
        }
        if (abas?.cliente && atalhoCombina(CAIXA_ATALHOS.cliente, e)) {
          e.preventDefault()
          abas.cliente()
          return
        }
        if (abas?.pgto && atalhoCombina(CAIXA_ATALHOS.pagamento, e)) {
          e.preventDefault()
          abas.pgto()
          return
        }
      }
    }
    globalThis.addEventListener("keydown", onKey)
    return () => globalThis.removeEventListener("keydown", onKey)
  }, [
    onAbrirReferencia,
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
