'use client'

import { useCallback, useState } from 'react'
import { emitGerenteToast } from '@/lib/gerente/toast'

type UseGerenteMutationOptions<TResult> = {
  loadingMessage?: string
  successMessage?: string
  onSuccess?: (result: TResult) => void
}

type UseGerenteMutationState<TPayload, TResult> = {
  mutate: (payload: TPayload) => Promise<TResult | null>
  loading: boolean
  error: string | null
}

/**
 * Hook padrão de mutação: loading, erro e sucesso com toasts consistentes.
 */
export function useGerenteMutation<TPayload, TResult>(
  mutationFn: (payload: TPayload) => Promise<TResult>,
  options?: UseGerenteMutationOptions<TResult>,
): UseGerenteMutationState<TPayload, TResult> {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mutate = useCallback(
    async (payload: TPayload) => {
      setLoading(true)
      setError(null)
      if (options?.loadingMessage) {
        emitGerenteToast({ kind: 'info', message: options.loadingMessage })
      }
      try {
        const result = await mutationFn(payload)
        options?.onSuccess?.(result)
        if (options?.successMessage) {
          emitGerenteToast({ kind: 'success', message: options.successMessage })
        }
        return result
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Falha ao salvar alterações.'
        setError(message)
        emitGerenteToast({ kind: 'error', message })
        return null
      } finally {
        setLoading(false)
      }
    },
    [mutationFn, options],
  )

  return { mutate, loading, error }
}
