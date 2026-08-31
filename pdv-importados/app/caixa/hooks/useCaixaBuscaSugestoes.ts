'use client'

import { useEffect, useRef } from 'react'
import { buscarProdutoParaCaixa } from '@/app/caixa/actions'
import {
  deveBuscarSugestoes,
  sugestoesDeResultadoBusca,
  type PayloadSugestoesCaixa,
} from '@/app/caixa/caixaBuscaSugestoes'

const DEBOUNCE_MS = 280

type Opts = Readonly<{
  enabled: boolean
  mensagemUnico: string
  onSugestoes: (payload: PayloadSugestoesCaixa | null) => void
}>

/**
 * Typeahead no campo de busca do PDV (ID 5).
 * Reusa `buscarProdutoParaCaixa` (SSoT) — sem catálogo paralelo.
 * Não dispara em leitura tipo barcode (protege scanner).
 */
export function useCaixaBuscaSugestoes(termo: string, opts: Opts): void {
  const seqRef = useRef(0)
  const onSugestoesRef = useRef(opts.onSugestoes)
  const mensagemRef = useRef(opts.mensagemUnico)
  onSugestoesRef.current = opts.onSugestoes
  mensagemRef.current = opts.mensagemUnico

  useEffect(() => {
    if (!opts.enabled) return

    const trimmed = termo.trim()
    if (!deveBuscarSugestoes(termo)) {
      if (trimmed.length === 0) onSugestoesRef.current(null)
      return
    }

    const seq = ++seqRef.current
    const timer = window.setTimeout(() => {
      void (async () => {
        const res = await buscarProdutoParaCaixa(trimmed)
        if (seq !== seqRef.current) return
        onSugestoesRef.current(sugestoesDeResultadoBusca(res, mensagemRef.current))
      })()
    }, DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timer)
    }
  }, [termo, opts.enabled])
}
