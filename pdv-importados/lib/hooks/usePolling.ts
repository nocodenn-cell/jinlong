'use client'

import { useEffect, useRef } from 'react'

/**
 * Callback de polling. Retorna `true` em sucesso e `false` em falha "leve"
 * (ex.: resposta não-ok / exceção tratada). A falha aciona o backoff
 * exponencial; o sucesso reseta o intervalo para o valor base.
 */
export type PollFn = () => Promise<boolean> | boolean

type Options = Readonly<{
  /** Teto do backoff. Default: max(base × 8, 5 min). */
  maxIntervalMs?: number
}>

/**
 * Polling consciente de recurso, pensado para o Supabase FREE (teto de 60
 * conexões): em vez de `setInterval` cego, este hook
 *
 *  1. **pausa** quando a aba não está visível (`visibilitychange`) — abas em
 *     segundo plano param de bater no banco e voltam a buscar ao reaparecer;
 *  2. faz **backoff exponencial** quando a chamada falha (resposta não-ok ou
 *     exceção), espaçando as tentativas em vez de martelar o banco durante uma
 *     queda — o que ajuda o próprio banco a se recuperar;
 *  3. dispara uma busca **imediata** na montagem e ao voltar o foco da aba.
 *
 * A `fn` é lida via ref, então mudanças de identidade não reiniciam o ciclo;
 * só `baseIntervalMs` e `maxIntervalMs` recriam o efeito.
 */
export function usePolling(fn: PollFn, baseIntervalMs: number, opts?: Options): void {
  const fnRef = useRef(fn)
  fnRef.current = fn

  const maxIntervalMs = opts?.maxIntervalMs

  useEffect(() => {
    const teto = maxIntervalMs ?? Math.max(baseIntervalMs * 8, 5 * 60_000)
    let timer: ReturnType<typeof setTimeout> | null = null
    let delay = baseIntervalMs
    let stopped = false

    const clear = () => {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
    }

    const schedule = () => {
      clear()
      if (stopped || document.visibilityState === 'hidden') return
      timer = setTimeout(() => void run(), delay)
    }

    const run = async () => {
      try {
        const ok = await fnRef.current()
        delay = ok === false ? Math.min(delay * 2, teto) : baseIntervalMs
      } catch {
        delay = Math.min(delay * 2, teto)
      }
      schedule()
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        delay = baseIntervalMs
        void run() // busca imediata ao reaparecer; run() re-agenda
      } else {
        clear()
      }
    }

    void run() // busca inicial
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stopped = true
      clear()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [baseIntervalMs, maxIntervalMs])
}
