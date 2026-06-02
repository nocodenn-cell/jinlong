'use client'

import { useCallback, useRef, useState } from 'react'
import type { AtividadeFeedPayload, AtividadeRailItem } from '@/app/api/gerente/atividades/recent/route'
import { usePolling } from '@/lib/hooks/usePolling'

export type { AtividadeRailItem }

const RING_SIZE = 40

export function useActivityFeed(intervalMs = 60_000) {
  const [items,     setItems]     = useState<AtividadeRailItem[]>([])
  const [newCount,  setNewCount]  = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const lastTopIdRef = useRef<string | null>(null)

  const hasLoadedRef = useRef(false)

  const fetchFeed = useCallback(async (): Promise<boolean> => {
    const showSpinner = !hasLoadedRef.current
    if (showSpinner) setIsLoading(true)
    try {
      const res = await fetch('/api/gerente/atividades/recent')
      if (!res.ok) return false
      const data = (await res.json()) as AtividadeFeedPayload
      const incoming = data.items ?? []

      setItems((prev) => {
        const merged = [...incoming]
        for (const old of prev) {
          if (!merged.find((x) => x.id === old.id)) merged.push(old)
        }
        return merged.slice(0, RING_SIZE)
      })

      // conta quantos novos chegaram desde o último fetch visto
      const prevTopId = lastTopIdRef.current
      if (prevTopId === null) {
        lastTopIdRef.current = incoming[0]?.id ?? null
      } else {
        const newIdx = incoming.findIndex((x) => x.id === prevTopId)
        const added  = newIdx === -1 ? incoming.length : newIdx
        if (added > 0) setNewCount((n) => n + added)
        if (incoming[0]) lastTopIdRef.current = incoming[0].id
      }
      return true
    } catch {
      return false // backoff via usePolling
    } finally {
      hasLoadedRef.current = true
      if (showSpinner) setIsLoading(false)
    }
  }, [])

  usePolling(fetchFeed, intervalMs)

  const markSeen = useCallback(() => {
    setNewCount(0)
  }, [])

  return { items, newCount, isLoading, markSeen }
}
