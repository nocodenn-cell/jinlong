"use client"

import { useCallback, useState } from "react"

export function useCaixaMensagens() {
  const [mensagem, setMensagemState] = useState<string | null>(null)
  const [msgVendaOk, setMsgVendaOk] = useState(false)

  const setCaixaMensagem = useCallback((text: string | null) => {
    setMsgVendaOk(false)
    setMensagemState(text)
  }, [])

  const setCaixaMensagemVendaOk = useCallback((text: string) => {
    setMsgVendaOk(true)
    setMensagemState(text)
  }, [])

  return { mensagem, msgVendaOk, setCaixaMensagem, setCaixaMensagemVendaOk }
}
