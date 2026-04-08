'use client'

import { useFormStatus } from 'react-dom'

type Props = {
  idleLabel: string
  pendingLabel?: string
  style?: React.CSSProperties
}

export function PendingSubmitButton({ idleLabel, pendingLabel = 'Processando...', style }: Props) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      style={{
        opacity: pending ? 0.7 : 1,
        cursor: pending ? 'not-allowed' : 'pointer',
        ...style,
      }}
    >
      {pending ? pendingLabel : idleLabel}
    </button>
  )
}
