/**
 * askConfirm — API promise do IX-CONFIRM (Sprint 0).
 * Renderizado por `ConfirmDialogHost` (mesmo padrão de evento do toast painel).
 */

export type AskConfirmOptions = {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'neutral'
}

type AskConfirmDetail = AskConfirmOptions & {
  resolve: (ok: boolean) => void
}

const EVENT_NAME = 'ds:confirm'

/** Abre ConfirmDialog e resolve true/false. Sem host montado → false. */
export function askConfirm(options: AskConfirmOptions): Promise<boolean> {
  if (typeof globalThis === 'undefined') return Promise.resolve(false)
  return new Promise((resolve) => {
    globalThis.dispatchEvent(
      new CustomEvent<AskConfirmDetail>(EVENT_NAME, {
        detail: { ...options, resolve },
      }),
    )
  })
}

export function onAskConfirm(listener: (detail: AskConfirmDetail) => void): () => void {
  if (typeof globalThis === 'undefined') return () => {}
  const handler = (event: Event) => {
    listener((event as CustomEvent<AskConfirmDetail>).detail)
  }
  globalThis.addEventListener(EVENT_NAME, handler)
  return () => globalThis.removeEventListener(EVENT_NAME, handler)
}
