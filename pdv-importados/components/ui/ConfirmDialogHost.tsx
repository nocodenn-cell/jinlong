'use client'

import { useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { ConfirmDialog, type ConfirmDialogVariant } from '@/components/ui/ConfirmDialog'
import { onAskConfirm, type AskConfirmOptions } from '@/lib/ui/askConfirm'

type Pending = AskConfirmOptions & {
  resolve: (ok: boolean) => void
}

/**
 * Host global do ConfirmDialog — montar uma vez no shell admin/PDV.
 */
export function ConfirmDialogHost() {
  const [pending, setPending] = useState<Pending | null>(null)

  useEffect(() => {
    return onAskConfirm((detail) => {
      // flushSync: askConfirm é chamado fora do ciclo React (handlers async).
      flushSync(() => {
        setPending((current) => {
          current?.resolve(false)
          return detail
        })
      })
    })
  }, [])

  const close = (ok: boolean) => {
    pending?.resolve(ok)
    setPending(null)
  }

  return (
    <ConfirmDialog
      open={pending != null}
      onClose={() => close(false)}
      onConfirm={() => close(true)}
      title={pending?.title ?? ''}
      description={pending?.description}
      confirmLabel={pending?.confirmLabel}
      cancelLabel={pending?.cancelLabel}
      variant={(pending?.variant ?? 'danger') as ConfirmDialogVariant}
    />
  )
}
