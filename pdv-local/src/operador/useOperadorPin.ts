import { useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import {
  minutosBloqueio,
  modoPinAtivo,
  type OperadorAtual,
  type OperadoresStatus,
  type ValidarPinResultado,
} from './operadorPin'

const SYNC_INTERVALO_MS = 5 * 60_000
const EVENTOS_ATIVIDADE = ['keydown', 'pointerdown', 'mousemove', 'wheel', 'touchstart'] as const

/**
 * Estado do login por PIN. Com o flag da loja desligado (ou PDV sem a Edge nova) `ativo` é false e nada muda.
 * Bloqueio (troca ou inatividade) só cobre a tela: carrinho, caixa e forma de pagamento ficam intactos.
 */
export function useOperadorPin({ tauriDisponivel }: { tauriDisponivel: boolean }) {
  const [status, setStatus] = useState<OperadoresStatus | null>(null)
  const [operadorAtual, setOperadorAtual] = useState<OperadorAtual | null>(null)
  const [bloqueado, setBloqueado] = useState(false)
  const ativo = modoPinAtivo(status)

  const aplicarStatus = useCallback((s: OperadoresStatus) => {
    setStatus(s)
    setOperadorAtual(s.operador_atual ?? null)
  }, [])

  useEffect(() => {
    if (!tauriDisponivel) return
    let vivo = true
    const sync = () =>
      invoke<OperadoresStatus>('operadores_sync_cmd')
        .then((s) => vivo && aplicarStatus(s))
        .catch(() => {})
    invoke<OperadoresStatus>('operadores_local_cmd')
      .then((s) => vivo && aplicarStatus(s))
      .catch(() => {})
      .finally(() => void sync())
    const id = globalThis.setInterval(() => void sync(), SYNC_INTERVALO_MS)
    return () => {
      vivo = false
      globalThis.clearInterval(id)
    }
  }, [tauriDisponivel, aplicarStatus])

  // Sem operador identificado no modo PIN ⇒ tela de bloqueio.
  const telaBloqueio = ativo && (bloqueado || !operadorAtual)

  const entrar = useCallback(async (usuario: string, pin: string): Promise<ValidarPinResultado> => {
    const r = await invoke<ValidarPinResultado>('operador_validar_pin_cmd', { usuario, pin, gerente: false })
    if (r.ok && r.usuario_id) {
      setOperadorAtual({ usuario_id: r.usuario_id, nome: r.nome ?? '', papel: r.papel ?? '' })
      setBloqueado(false)
    }
    return r
  }, [])

  const sair = useCallback(async (motivo: 'troca' | 'inatividade') => {
    setBloqueado(true)
    setOperadorAtual(null)
    try {
      await invoke('operador_sair_cmd', { motivo })
    } catch {
      /* auditoria é best-effort; o bloqueio da tela já valeu */
    }
  }, [])

  const autorizarGerente = useCallback(
    (usuario: string, pin: string, acao: string) =>
      invoke<ValidarPinResultado>('operador_validar_pin_cmd', { usuario, pin, gerente: true, acao }),
    [],
  )

  // Bloqueio automático por inatividade (padrão 3 min, vem da loja).
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const minutos = minutosBloqueio(status)
  useEffect(() => {
    if (!ativo || telaBloqueio) return
    const armar = () => {
      if (timerRef.current) globalThis.clearTimeout(timerRef.current)
      timerRef.current = globalThis.setTimeout(() => void sair('inatividade'), minutos * 60_000)
    }
    armar()
    for (const ev of EVENTOS_ATIVIDADE) globalThis.addEventListener(ev, armar, { passive: true })
    return () => {
      if (timerRef.current) globalThis.clearTimeout(timerRef.current)
      for (const ev of EVENTOS_ATIVIDADE) globalThis.removeEventListener(ev, armar)
    }
  }, [ativo, telaBloqueio, minutos, sair])

  return { status, ativo, operadorAtual, telaBloqueio, entrar, sair, autorizarGerente }
}
