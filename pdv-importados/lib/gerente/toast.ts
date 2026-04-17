'use client'

export type GerenteToastKind = 'info' | 'success' | 'error'

export type GerenteToastPayload = {
  kind: GerenteToastKind
  message: string
}

const EVENT_NAME = 'gerente:toast'

/** Evento global para o viewport de toasts montado no layout do gerente. */
export function emitGerenteToast(payload: GerenteToastPayload) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<GerenteToastPayload>(EVENT_NAME, { detail: payload }))
}

export function onGerenteToast(listener: (payload: GerenteToastPayload) => void) {
  if (typeof window === 'undefined') return () => {}
  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<GerenteToastPayload>
    listener(customEvent.detail)
  }
  window.addEventListener(EVENT_NAME, handler)
  return () => window.removeEventListener(EVENT_NAME, handler)
}
