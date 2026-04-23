import { useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'

export type OutboxResumo = {
  pendentes_total: number
  prontos_sync: number
  em_backoff: number
  dlq: number
}

type StatusSync = 'ok' | 'pendente' | 'offline'

type Params = {
  tauriDisponivel: boolean
  caixaAtualId: string | null
  onSyncElapsedMs: (elapsedMs: number) => void
  onMensagem: (msg: string) => void
  formatarErro: (error: unknown, fallback: string) => string
}

export function usePdvLocalOutboxSync({
  tauriDisponivel,
  caixaAtualId,
  onSyncElapsedMs,
  onMensagem,
  formatarErro,
}: Params) {
  const [outboxResumo, setOutboxResumo] = useState<OutboxResumo | null>(null)
  const [reprocessandoDlq, setReprocessandoDlq] = useState(false)
  const syncInFlightRef = useRef(false)

  const executarSyncOutboxComMetrica = useCallback(
    async (limite = 50) => {
      if (syncInFlightRef.current) return
      syncInFlightRef.current = true
      const t0 = performance.now()
      try {
        await invoke('sync_outbox_real_cmd', { limite })
      } finally {
        onSyncElapsedMs(performance.now() - t0)
        syncInFlightRef.current = false
      }
    },
    [onSyncElapsedMs],
  )

  const refreshOutboxResumo = useCallback(async () => {
    if (!tauriDisponivel) return
    try {
      const r = await invoke<OutboxResumo>('outbox_resumo_cmd')
      setOutboxResumo(r)
    } catch {
      setOutboxResumo(null)
    }
  }, [tauriDisponivel])

  const reprocessarDlq = useCallback(async () => {
    setReprocessandoDlq(true)
    try {
      await invoke('outbox_reprocessar_dlq_cmd')
      await executarSyncOutboxComMetrica(50)
      await refreshOutboxResumo()
      onMensagem('Eventos repostos na fila. Sync executada em seguida.')
    } catch (e) {
      onMensagem(
        formatarErro(e, 'Não foi possível reprocessar a fila de sincronização.'),
      )
    } finally {
      setReprocessandoDlq(false)
    }
  }, [executarSyncOutboxComMetrica, refreshOutboxResumo, onMensagem, formatarErro])

  useEffect(() => {
    if (!tauriDisponivel) return
    void refreshOutboxResumo()
    const id = window.setInterval(() => void refreshOutboxResumo(), 12000)
    return () => window.clearInterval(id)
  }, [tauriDisponivel, refreshOutboxResumo])

  useEffect(() => {
    if (!tauriDisponivel || !caixaAtualId) return

    let running = false
    const t = window.setInterval(() => {
      if (running) return
      running = true
      executarSyncOutboxComMetrica(50)
        .catch(() => {
          // Sem bloquear o caixa offline
        })
        .finally(() => {
          void refreshOutboxResumo()
          running = false
        })
    }, 15000)

    return () => window.clearInterval(t)
  }, [tauriDisponivel, caixaAtualId, refreshOutboxResumo, executarSyncOutboxComMetrica])

  const statusSync: StatusSync = !tauriDisponivel
    ? 'offline'
    : outboxResumo &&
        (outboxResumo.pendentes_total > 0 ||
          outboxResumo.em_backoff > 0 ||
          outboxResumo.dlq > 0)
      ? 'pendente'
      : 'ok'

  return {
    outboxResumo,
    reprocessandoDlq,
    statusSync,
    executarSyncOutboxComMetrica,
    refreshOutboxResumo,
    reprocessarDlq,
  }
}
