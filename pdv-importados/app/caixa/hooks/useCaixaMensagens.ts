"use client"

import { useCallback, useEffect, useRef, useState } from "react"

export type CaixaToastKind = "info" | "success" | "warning" | "error"

type CaixaToastItem = {
  id: number
  kind: CaixaToastKind
  text: string
}

type SetMensagemOptions = {
  kind?: CaixaToastKind
  toast?: boolean
}

export function useCaixaMensagens() {
  const [mensagem, setMensagemState] = useState<string | null>(null)
  const [msgVendaOk, setMsgVendaOk] = useState(false)
  const [toasts, setToasts] = useState<CaixaToastItem[]>([])
  const timerRefs = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  useEffect(() => {
    const timers = timerRefs.current
    return () => {
      timers.forEach((t) => clearTimeout(t))
    }
  }, [])

  const pushCaixaToast = useCallback((kind: CaixaToastKind, text: string) => {
    const id = Date.now() + Math.floor(Math.random() * 1000)
    setToasts((prev) => [...prev, { id, kind, text }])
    const t = globalThis.setTimeout(() => {
      timerRefs.current.delete(id)
      setToasts((prev) => prev.filter((item) => item.id !== id))
    }, 2600)
    timerRefs.current.set(id, t)
  }, [])

  const dismissCaixaToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((item) => item.id !== id))
  }, [])

  const setCaixaMensagem = useCallback((text: string | null, options?: SetMensagemOptions) => {
    setMsgVendaOk(false)
    setMensagemState(text)
    if (!text) return
    if (options?.toast === false) return
    pushCaixaToast(options?.kind ?? "warning", text)
  }, [pushCaixaToast])

  const setCaixaMensagemVendaOk = useCallback((text: string, options?: SetMensagemOptions) => {
    setMsgVendaOk(true)
    setMensagemState(text)
    if (options?.toast === false) return
    pushCaixaToast(options?.kind ?? "success", text)
  }, [pushCaixaToast])

  return {
    mensagem,
    msgVendaOk,
    toasts,
    setCaixaMensagem,
    setCaixaMensagemVendaOk,
    pushCaixaToast,
    dismissCaixaToast,
  }
}
