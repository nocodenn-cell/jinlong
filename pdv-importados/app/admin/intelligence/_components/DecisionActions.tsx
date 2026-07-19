'use client'

import { useState, useTransition } from 'react'
import {
  registrarDecisaoIntelligenceAction,
  type RegistrarDecisaoResult,
} from '../actions'

type Props = {
  recommendationId: string
  disabled?: boolean
}

/**
 * Ações humanas sobre Recommendation — sem regras de DI.
 * Apenas persiste DecisionRecord via server action.
 */
export function DecisionActions({ recommendationId, disabled }: Props) {
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)

  function run(status: 'accepted' | 'rejected' | 'deferred') {
    setMsg(null)
    startTransition(async () => {
      const result: RegistrarDecisaoResult =
        await registrarDecisaoIntelligenceAction({
          recommendationId,
          status,
          decisionReason: status === 'deferred' ? 'SEASONAL' : 'HUMAN_OVERRIDE',
          reviewDate:
            status === 'deferred'
              ? new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)
              : null,
        })
      setMsg(
        result.ok
          ? `Registrado (${status})`
          : `Falha: ${result.message}`,
      )
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          disabled={disabled || pending}
          onClick={() => run('accepted')}
          className="rounded-md border border-[var(--color-border)] px-2 py-1 text-caption text-fg hover:bg-[var(--color-surface-muted)] disabled:opacity-50"
        >
          Aceitar
        </button>
        <button
          type="button"
          disabled={disabled || pending}
          onClick={() => run('rejected')}
          className="rounded-md border border-[var(--color-border)] px-2 py-1 text-caption text-fg hover:bg-[var(--color-surface-muted)] disabled:opacity-50"
        >
          Rejeitar
        </button>
        <button
          type="button"
          disabled={disabled || pending}
          onClick={() => run('deferred')}
          className="rounded-md border border-[var(--color-border)] px-2 py-1 text-caption text-fg hover:bg-[var(--color-surface-muted)] disabled:opacity-50"
        >
          Adiar
        </button>
      </div>
      {msg ? <p className="text-caption text-fg-subtle">{msg}</p> : null}
    </div>
  )
}
