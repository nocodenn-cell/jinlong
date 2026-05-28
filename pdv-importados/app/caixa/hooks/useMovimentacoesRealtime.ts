"use client"

import { useEffect, useRef } from "react"
import { createClient } from "@/lib/supabase/client"

type Params = {
  caixaId: string | null
  currentUserId: string | null
  onExternalChange: () => void
}

/**
 * Assina postgres_changes em movimentacoes_caixa para o caixa ativo.
 * Dispara onExternalChange apenas quando o evento vem de outro operador —
 * se o próprio operador registrou a movimentação, o handler local já
 * chamou o refresh, então o evento Realtime é descartado.
 */
export function useMovimentacoesRealtime({ caixaId, currentUserId, onExternalChange }: Params) {
  // Ref estável para o callback: evita recriar o canal a cada render
  const callbackRef = useRef(onExternalChange)
  useEffect(() => {
    callbackRef.current = onExternalChange
  })

  useEffect(() => {
    if (!caixaId || !currentUserId) return

    const supabase = createClient()
    const channel = supabase
      .channel(`movimentacoes-caixa-${caixaId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "movimentacoes_caixa",
          filter: `caixa_id=eq.${caixaId}`,
        },
        (payload) => {
          const row = (payload.new ?? payload.old) as Record<string, unknown> | null
          // Ignora eventos gerados pelo próprio operador local — o handler
          // de ação já disparou o refresh antes do evento Realtime chegar.
          if (row && row.operador_id === currentUserId) return
          callbackRef.current()
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [caixaId, currentUserId])
}
