'use client'

import { useState } from 'react'

export function ConfirmarButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const [enviando, setEnviando] = useState(false)
  return (
    <button
      type="submit"
      onClick={(e) => {
        if (enviando) e.preventDefault()
        else setTimeout(() => setEnviando(true), 0)
      }}
      className="login-premium-submit"
      data-testid="confirm-email-link-submit"
    >
      {enviando ? pendingLabel : label}
    </button>
  )
}
