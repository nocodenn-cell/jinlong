import { useEffect } from 'react'

type Params = {
  caixaAberto: boolean
  itensNoCarrinho: boolean
  isFinalizandoVenda: boolean
  onFinalizar: () => void
  onFecharCaixa: () => void
  onFocarLeitura: () => void
  onNovoCupom: () => void
  onRegistrarMovimento: () => void
}

/**
 * Atalhos globais do PDV local — mesmo mapa canônico do Caixa web
 * (app/caixa/hooks/useCaixaKeyboardShortcuts.ts), adotado aqui para que um
 * operador que alterne entre os dois terminais use as mesmas teclas.
 *
 * Diferença deliberada em relação ao guard do web: lá, atalhos são
 * bloqueados quando o foco está em INPUT/TEXTAREA (alvoEhCampoTexto), pois
 * o operador normalmente sai do campo de busca antes de usar teclas de
 * função. Aqui o design é o oposto — o único input (leitura de código de
 * barras) fica focado o tempo todo por projeto ("zero mouse": foco retorna
 * a ele após toda ação, ver `focarInputLeitura` em App.tsx). Bloquear
 * atalhos enquanto esse input está focado tornaria as teclas inúteis na
 * prática. Como nenhuma destas combinações (teclas de função, Ctrl+combo)
 * insere caracteres no campo, não há conflito com a digitação manual de
 * código/nome do produto.
 */
export function usePdvLocalKeyboardShortcuts({
  caixaAberto,
  itensNoCarrinho,
  isFinalizandoVenda,
  onFinalizar,
  onFecharCaixa,
  onFocarLeitura,
  onNovoCupom,
  onRegistrarMovimento,
}: Params) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return

      if (e.code === 'F4' || e.code === 'F9') {
        if (!itensNoCarrinho || isFinalizandoVenda) return
        e.preventDefault()
        onFinalizar()
        return
      }
      if (e.code === 'F2' || (e.ctrlKey && !e.shiftKey && !e.altKey && e.code === 'KeyB')) {
        e.preventDefault()
        onFocarLeitura()
        return
      }
      if (e.code === 'F6') {
        if (!caixaAberto) return
        e.preventDefault()
        onFecharCaixa()
        return
      }
      if (e.code === 'F8') {
        if (!itensNoCarrinho) return
        e.preventDefault()
        onNovoCupom()
        return
      }
      if (e.ctrlKey && e.shiftKey && !e.repeat && (e.code === 'KeyS' || e.code === 'KeyR')) {
        if (!caixaAberto) return
        e.preventDefault()
        onRegistrarMovimento()
        return
      }
    }
    globalThis.addEventListener('keydown', onKey)
    return () => globalThis.removeEventListener('keydown', onKey)
  }, [
    caixaAberto,
    itensNoCarrinho,
    isFinalizandoVenda,
    onFinalizar,
    onFecharCaixa,
    onFocarLeitura,
    onNovoCupom,
    onRegistrarMovimento,
  ])
}
