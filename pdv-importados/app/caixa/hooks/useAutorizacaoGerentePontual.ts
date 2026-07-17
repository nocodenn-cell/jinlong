"use client"

import { useCallback, useRef, useState } from "react"
import { validarGerenteDesconto } from "@/app/caixa/actions"
import { getDeviceFingerprint } from "@/lib/security/deviceFingerprint"
import type { Mensagens } from "@/i18n/getMessages"
import type { ValidarSenhaGerentePontualResult } from "@/app/caixa/CaixaGerenteSenhaModal"

/**
 * Autorização pontual de gerente (senha → token de uso único), reutilizável por
 * qualquer operação privilegiada iniciada por um operador comum no caixa:
 * cancelamento, devolução e futuras (sangria, reabertura de caixa, alteração
 * manual de preço etc. — Fase 5). SSoT do lado do cliente para essa etapa;
 * o SSoT real da autorização é a RPC `autorizar_operacao_privilegiada` no
 * banco (migration 272) — este hook só orquestra a UI (modal de senha) e
 * repassa o token obtido para quem pediu a autorização.
 *
 * Uso:
 *   const autorizacao = useAutorizacaoGerentePontual(m)
 *   autorizacao.solicitar((token) => minhaAcaoQueExigeToken(token))
 *   <CaixaGerenteSenhaModal
 *     open={autorizacao.aberto} onOpenChange={autorizacao.setAberto} m={m}
 *     validando={autorizacao.validando}
 *     onValidateSenha={autorizacao.handleValidateSenha}
 *     onAutorizado={autorizacao.handleAutorizado}
 *   />
 */
export function useAutorizacaoGerentePontual(m: Mensagens) {
  const [aberto, setAberto] = useState(false)
  const [validando, setValidando] = useState(false)
  const onAutorizadoRef = useRef<((token: string) => void) | null>(null)

  /** Abre o modal de senha; ao autorizar com sucesso, chama onAutorizado(token). */
  const solicitar = useCallback((onAutorizado: (token: string) => void) => {
    onAutorizadoRef.current = onAutorizado
    setAberto(true)
  }, [])

  const handleValidateSenha = useCallback(
    async (senha: string): Promise<ValidarSenhaGerentePontualResult> => {
      setValidando(true)
      try {
        const res = await validarGerenteDesconto({ senha, deviceFingerprint: getDeviceFingerprint() })
        if (!res.ok) return { ok: false, error: res.error }
        return { ok: true, token: res.token }
      } catch {
        return { ok: false, error: m.caixa.msg_falha_gerente_rede }
      } finally {
        setValidando(false)
      }
    },
    [m.caixa.msg_falha_gerente_rede],
  )

  const handleAutorizado = useCallback((token: string) => {
    const callback = onAutorizadoRef.current
    onAutorizadoRef.current = null
    callback?.(token)
  }, [])

  return { aberto, setAberto, validando, solicitar, handleValidateSenha, handleAutorizado }
}
