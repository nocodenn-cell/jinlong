import { useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { logger } from '../lib/logger'
import { captureOutboxSyncError } from '../lib/sentry'

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
  const [ultimoErroOutbox, setUltimoErroOutbox] = useState<string | null>(null)
  const [reprocessandoDlq, setReprocessandoDlq] = useState(false)
  const syncInFlightRef = useRef(false)

  const executarSyncOutboxComMetrica = useCallback(
    async (limite = 50, opts?: { suppressThrow?: boolean }) => {
      if (syncInFlightRef.current) return
      syncInFlightRef.current = true
      const t0 = performance.now()
      try {
        await invoke('sync_outbox_real_cmd', { limite })
        setUltimoErroOutbox(null)
      } catch (e) {
        const msg = formatarErro(e, 'Falha ao sincronizar a fila com o servidor.')
        setUltimoErroOutbox(msg)
        logger.warn('outbox_sync_failed', {
          stage: 'outbox',
          event: 'sync_outbox_real_cmd',
          limite,
          error: String(e),
          mensagem: msg,
        })
        captureOutboxSyncError(e, { stage: 'sync', caixa_id: caixaAtualId, limite })
        if (!opts?.suppressThrow) throw e
      } finally {
        onSyncElapsedMs(performance.now() - t0)
        syncInFlightRef.current = false
      }
    },
    [onSyncElapsedMs, formatarErro],
  )

  const refreshOutboxResumo = useCallback(async () => {
    if (!tauriDisponivel) return
    try {
      const r = await invoke<OutboxResumo>('outbox_resumo_cmd')
      setOutboxResumo(r)
      setUltimoErroOutbox(null)
    } catch (e) {
      setOutboxResumo(null)
      const msg = formatarErro(e, 'Não foi possível ler o resumo da fila de sincronização.')
      setUltimoErroOutbox(msg)
      logger.warn('outbox_resumo_failed', {
        stage: 'outbox',
        event: 'outbox_resumo_cmd',
        error: String(e),
        mensagem: msg,
      })
    }
  }, [tauriDisponivel, formatarErro])

  const reprocessarDlq = useCallback(async () => {
    setReprocessandoDlq(true)
    try {
      await invoke('outbox_reprocessar_dlq_cmd')
      await executarSyncOutboxComMetrica(50)
      await refreshOutboxResumo()
      setUltimoErroOutbox(null)
      onMensagem('Eventos repostos na fila. Sync executada em seguida.')
    } catch (e) {
      const dlqCount = outboxResumo?.dlq ?? 0
      captureOutboxSyncError(e, { stage: 'dlq', caixa_id: caixaAtualId, dlq_count: dlqCount })
      onMensagem(
        formatarErro(e, 'Não foi possível reprocessar a fila de sincronização.'),
      )
    } finally {
      setReprocessandoDlq(false)
    }
  }, [executarSyncOutboxComMetrica, refreshOutboxResumo, onMensagem, formatarErro, outboxResumo, caixaAtualId])

  useEffect(() => {
    if (!tauriDisponivel) return
    void refreshOutboxResumo()
    const id = globalThis.setInterval(() => void refreshOutboxResumo(), 12000)
    return () => globalThis.clearInterval(id)
  }, [tauriDisponivel, refreshOutboxResumo])

  useEffect(() => {
    if (!tauriDisponivel || !caixaAtualId) return

    let running = false
    const t = globalThis.setInterval(() => {
      if (running) return
      running = true
      void executarSyncOutboxComMetrica(50, { suppressThrow: true })
        .finally(() => {
          void refreshOutboxResumo()
          running = false
        })
    }, 15000)

    return () => globalThis.clearInterval(t)
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
    ultimoErroOutbox,
    reprocessandoDlq,
    statusSync,
    executarSyncOutboxComMetrica,
    refreshOutboxResumo,
    reprocessarDlq,
  }
}
