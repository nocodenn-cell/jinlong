'use client'

import { useCallback, useEffect, useState } from 'react'
import { emitGerenteToast } from '@/lib/gerente/toast'

type UseGerenteQueryOptions<TData> = {
  enabled?: boolean
  loadingMessage?: string
  onSuccess?: (data: TData) => void
}

type UseGerenteQueryState<TData> = {
  data: TData | null
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

/**
 * Hook padrão de leitura para telas do gerente.
 * Opcionalmente exibe toast informativo no carregamento e toast de erro em falhas.
 */
export function useGerenteQuery<TData>(
  queryFn: () => Promise<TData>,
  options?: UseGerenteQueryOptions<TData>,
): UseGerenteQueryState<TData> {
  const [data, setData] = useState<TData | null>(null)
  const [loading, setLoading] = useState(Boolean(options?.enabled ?? true))
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    if (options?.loadingMessage) {
      emitGerenteToast({ kind: 'info', message: options.loadingMessage })
    }
    try {
      const result = await queryFn()
      setData(result)
      options?.onSuccess?.(result)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao carregar dados.'
      setError(message)
      emitGerenteToast({ kind: 'error', message })
    } finally {
      setLoading(false)
    }
  }, [options, queryFn])

  useEffect(() => {
    if (options?.enabled === false) {
      setLoading(false)
      return
    }
    refetch().catch(() => undefined)
  }, [options?.enabled, refetch])

  return { data, loading, error, refetch }
}
