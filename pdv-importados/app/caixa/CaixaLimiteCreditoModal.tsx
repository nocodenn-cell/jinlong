"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { DragonModal } from "@/components/ui/DragonModal"
import { Input, Field } from "@/components/ui/forms"
import type { Mensagens } from "@/i18n/getMessages"
import { ImperialSealIcon } from "@/components/icons/ImperialSealIcon"
import type { ValidarSenhaGerenteResult } from "@/app/caixa/CaixaGerenteModal"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  m: Mensagens
  validando: boolean
  onValidateSenha: (senha: string) => Promise<ValidarSenhaGerenteResult>
  onAutorizado: (token: string) => void
}

/**
 * Autorização gerencial de limite de crédito (BR-01). Reaproveita a mesma
 * validação de senha do desconto gerencial (`tokens_desconto_gerente` — um
 * único registro de token, não específico por finalidade) via um modal
 * dedicado de um passo só: aqui não há percentual/motivo, só a senha.
 */
export function CaixaLimiteCreditoModal({
  open,
  onOpenChange,
  m,
  validando,
  onValidateSenha,
  onAutorizado,
}: Props) {
  const [senha, setSenha] = useState("")
  const [erroLocal, setErroLocal] = useState<string | null>(null)
  const senhaRef = useRef<HTMLInputElement>(null)

  const fechar = useCallback(() => onOpenChange(false), [onOpenChange])

  useEffect(() => {
    if (!open) return
    setSenha("")
    setErroLocal(null)
    queueMicrotask(() => senhaRef.current?.focus())
  }, [open])

  const handleAutorizar = useCallback(async () => {
    if (validando) return
    setErroLocal(null)
    const s = senha.trim()
    if (!s) {
      setErroLocal(m.caixa.msg_senha_obrigatoria)
      return
    }
    const res = await onValidateSenha(s)
    if (!res.ok) {
      setErroLocal(res.error)
      return
    }
    onAutorizado(res.token)
  }, [validando, senha, onValidateSenha, onAutorizado, m.caixa.msg_senha_obrigatoria])

  return (
    <DragonModal
      open={open}
      onClose={fechar}
      title={
        <span className="flex items-center gap-2">
          <ImperialSealIcon
            className="h-6 w-6 shrink-0 text-primary"
            title={m.caixa.aria_selo_gerente}
            pulse
          />
          {m.caixa.modal_limite_credito_titulo}
        </span>
      }
      sheet
      closeLabel={m.comum.fechar}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={fechar} disabled={validando}>
            {m.comum.cancelar}
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={() => void handleAutorizar()}
            disabled={validando}
            loading={validando}
          >
            {validando ? m.caixa.validando_gerente : m.caixa.modal_limite_credito_autorizar}
          </Button>
        </>
      }
    >
      <div data-testid="caixa-limite-credito-modal" className="space-y-4">
        <p className="text-caption text-jl-fg-3">{m.caixa.modal_limite_credito_descricao}</p>
        <Field
          id="limite-credito-senha"
          label={m.caixa.modal_gerente_passo_senha}
          error={erroLocal || undefined}
          required
        >
          <Input
            ref={senhaRef}
            id="limite-credito-senha"
            type="password"
            value={senha}
            placeholder={m.caixa.modal_gerente_senha_placeholder}
            onChange={(e) => setSenha(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleAutorizar()
            }}
            autoComplete="off"
          />
        </Field>
      </div>
    </DragonModal>
  )
}
