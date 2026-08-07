'use client'

export type ToastKind = 'info' | 'success' | 'error'
export type ToastPayload = {
  kind: ToastKind
  message: string
}

/** @deprecated Preferir `ToastKind`. */
export type GerenteToastKind = ToastKind
/** @deprecated Preferir `ToastPayload`. */
export type GerenteToastPayload = ToastPayload

const EVENT_NAME = 'gerente:toast'

/**
 * emitToast — único ponto de entrada do toast do painel (Sprint 0 / IX-SUCCESS).
 * PDV permanece EXC-02 (`CaixaToastViewport`).
 */
export function emitToast(payload: ToastPayload) {
  if (typeof globalThis === 'undefined') return
  globalThis.dispatchEvent(new CustomEvent<ToastPayload>(EVENT_NAME, { detail: payload }))
}

/** @deprecated Preferir `emitToast`. */
export const emitGerenteToast = emitToast

export function onGerenteToast(listener: (payload: ToastPayload) => void) {
  if (typeof globalThis === 'undefined') return () => {}
  const handler = (event: Event) => {
    listener((event as CustomEvent<ToastPayload>).detail)
  }
  globalThis.addEventListener(EVENT_NAME, handler)
  return () => globalThis.removeEventListener(EVENT_NAME, handler)
}

/** Alias canônico do listener (nome DS). */
export const onToast = onGerenteToast
