'use client'

export type GerenteToastKind = 'info' | 'success' | 'error'

export type GerenteToastPayload = {
  kind: GerenteToastKind
  message: string
}

const EVENT_NAME = 'gerente:toast'

/** Evento global para o viewport de toasts montado no layout do gerente/admin. */
export function emitGerenteToast(payload: GerenteToastPayload) {
  if (typeof globalThis === 'undefined') return
  globalThis.dispatchEvent(new CustomEvent<GerenteToastPayload>(EVENT_NAME, { detail: payload }))
}

/**
 * Alias canônico do Design System (Sprint 0 / IX-SUCCESS).
 * Painel admin = este canal; PDV permanece EXC-02 (toast próprio).
 */
export const emitToast = emitGerenteToast

/** @deprecated Preferir `emitToast`. Mantido por compatibilidade. */
export type ToastKind = GerenteToastKind
export type ToastPayload = GerenteToastPayload


export function onGerenteToast(listener: (payload: GerenteToastPayload) => void) {
  if (typeof globalThis === 'undefined') return () => {}
  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<GerenteToastPayload>
    listener(customEvent.detail)
  }
  globalThis.addEventListener(EVENT_NAME, handler)
  return () => globalThis.removeEventListener(EVENT_NAME, handler)
}
