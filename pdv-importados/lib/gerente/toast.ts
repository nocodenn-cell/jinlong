'use client'

export type GerenteToastKind = 'info' | 'success' | 'error'

export type GerenteToastPayload = {
  kind: GerenteToastKind
  message: string
}

const EVENT_NAME = 'gerente:toast'

/** Evento global para o viewport de toasts montado no layout do gerente. */
export function emitGerenteToast(payload: GerenteToastPayload) {
  if (typeof globalThis === 'undefined') return
  globalThis.dispatchEvent(new CustomEvent<GerenteToastPayload>(EVENT_NAME, { detail: payload }))
}

export function onGerenteToast(listener: (payload: GerenteToastPayload) => void) {
  if (typeof globalThis === 'undefined') return () => {}
  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<GerenteToastPayload>
    listener(customEvent.detail)
  }
  globalThis.addEventListener(EVENT_NAME, handler)
  return () => globalThis.removeEventListener(EVENT_NAME, handler)
}
