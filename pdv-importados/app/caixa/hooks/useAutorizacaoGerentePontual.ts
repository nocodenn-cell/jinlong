"use client"

import { useCallback, useRef, useState } from "react"
import { getDeviceFingerprint } from "@/lib/security/deviceFingerprint"
import type { Mensagens } from "@/i18n/getMessages"
import type { ValidarSenhaGerentePontualResult } from "@/app/caixa/CaixaGerenteSenhaModal"
import { authorizationService, AuthorizationMethod, type OperacaoPrivilegiada } from "@/lib/authorization"

/**
 * Autorização pontual de gerente, reutilizável por qualquer operação
 * privilegiada iniciada por um operador comum no caixa: cancelamento,
 * devolução e futuras (sangria, reabertura de caixa, alteração manual de
 * preço etc. — Fase 5). Orquestra só a UI (modal de senha) — a decisão de
 * COMO autorizar é do `authorizationService` (lib/authorization), que hoje
 * só tem o provider de senha funcional; quando PIN/QR Code forem
 * implementados de verdade, este hook não muda, só o provider por trás.
 * O SSoT real de "autorizado ou não" continua sendo a RPC
 * `autorizar_operacao_privilegiada` no banco (migration 272/274).
 *
 * Uso:
 *   const autorizacao = useAutorizacaoGerentePontual(m)
 *   autorizacao.solicitar(OperacaoPrivilegiada.CANCELAR_VENDA, (token) => minhaAcao(token))
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
  const operationRef = useRef<OperacaoPrivilegiada | null>(null)

  /** Abre o modal de senha; ao autorizar com sucesso, chama onAutorizado(token). */
  const solicitar = useCallback((operation: OperacaoPrivilegiada, onAutorizado: (token: string) => void) => {
    operationRef.current = operation
    onAutorizadoRef.current = onAutorizado
    setAberto(true)
  }, [])

  const handleValidateSenha = useCallback(
    async (senha: string): Promise<ValidarSenhaGerentePontualResult> => {
      if (!operationRef.current) return { ok: false, error: m.comum.erro }
      setValidando(true)
      try {
        const res = await authorizationService.authorize({
          operation: operationRef.current,
          request: {
            method: AuthorizationMethod.PASSWORD,
            senha,
            deviceFingerprint: getDeviceFingerprint(),
          },
        })
        if (!res.ok) return { ok: false, error: res.error }
        return { ok: true, token: res.token }
      } catch {
        return { ok: false, error: m.caixa.msg_falha_gerente_rede }
      } finally {
        setValidando(false)
      }
    },
    [m.caixa.msg_falha_gerente_rede, m.comum.erro],
  )

  const handleAutorizado = useCallback((token: string) => {
    const callback = onAutorizadoRef.current
    onAutorizadoRef.current = null
    operationRef.current = null
    callback?.(token)
  }, [])

  return { aberto, setAberto, validando, solicitar, handleValidateSenha, handleAutorizado }
}
