'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { DragonModal } from '@/components/ui/DragonModal'
import { Button } from '@/components/ui/button'
import { ConsequenciaOperacao, type EfeitoOperacao } from './ConsequenciaOperacao'

/**
 * Captura do motivo de uma operação financeira irreversível.
 *
 * Substitui `window.prompt`, que era o padrão em dois pontos do financeiro
 * (cancelar título a pagar e estornar liquidação a receber). O prompt do
 * navegador não passa pelo i18n, não valida antes de fechar, não declara a
 * consequência e não se parece com o resto do produto — três problemas num
 * diálogo que decide dinheiro.
 *
 * O bloco de consequência é o mesmo padrão já usado na conferência de NF-e e no
 * recebimento de ordem: o operador lê o que vai acontecer **antes** de confirmar.
 */

const MOTIVO_MIN = 2
const MOTIVO_MAX = 200

export type MotivoOperacaoLabels = Readonly<{
  titulo: string
  subtitulo?: string
  consequenciaTitulo: string
  campoLabel: string
  campoPlaceholder: string
  erroObrigatorio: string
  confirmar: string
  cancelar: string
  fechar: string
  enviando: string
}>

type Props = Readonly<{
  open: boolean
  labels: MotivoOperacaoLabels
  efeitos: readonly EfeitoOperacao[]
  pending?: boolean
  onCancel: () => void
  onConfirm: (motivo: string) => void
}>

export function MotivoOperacaoModal({
  open,
  labels,
  efeitos,
  pending = false,
  onCancel,
  onConfirm,
}: Props) {
  const [motivo, setMotivo] = useState('')
  const [tocado, setTocado] = useState(false)

  // Reabrir o modal para outro registro não pode herdar o motivo do anterior —
  // é exatamente o tipo de vazamento que faria um estorno sair com a
  // justificativa errada gravada na auditoria.
  useEffect(() => {
    if (open) {
      setMotivo('')
      setTocado(false)
    }
  }, [open])

  const invalido = motivo.trim().length < MOTIVO_MIN
  const mostrarErro = tocado && invalido

  function submeter() {
    setTocado(true)
    if (invalido || pending) return
    onConfirm(motivo.trim())
  }

  return (
    <DragonModal
      open={open}
      onClose={onCancel}
      title={labels.titulo}
      subtitle={labels.subtitulo}
      icon={AlertTriangle}
      variant="danger"
      size="md"
      dismissable={!pending}
      closeLabel={labels.fechar}
      data-testid="motivo-operacao-modal"
      footer={
        <>
          <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={pending}>
            {labels.cancelar}
          </Button>
          <Button
            type="button"
            variant="danger"
            size="sm"
            onClick={submeter}
            disabled={pending || invalido}
          >
            {pending ? labels.enviando : labels.confirmar}
          </Button>
        </>
      }
    >
      <div className="admin-v2-stack">
        <ConsequenciaOperacao titulo={labels.consequenciaTitulo} efeitos={efeitos} />

        <div>
          <label
            htmlFor="motivo-operacao"
            className="mb-1 block text-caption font-medium text-fg-muted"
          >
            {labels.campoLabel}
          </label>
          <textarea
            id="motivo-operacao"
            name="motivo"
            rows={3}
            required
            autoFocus
            maxLength={MOTIVO_MAX}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            onBlur={() => setTocado(true)}
            onKeyDown={(e) => {
              // Enter puro quebra linha num textarea; Ctrl/Cmd+Enter confirma,
              // como no resto dos formulários longos do admin.
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                submeter()
              }
            }}
            placeholder={labels.campoPlaceholder}
            aria-invalid={mostrarErro || undefined}
            aria-describedby={mostrarErro ? 'motivo-operacao-erro' : undefined}
            className="fp-control w-full text-small"
          />
          {mostrarErro ? (
            <p
              id="motivo-operacao-erro"
              role="alert"
              className="mt-1 text-caption text-[var(--color-danger-strong)]"
            >
              {labels.erroObrigatorio}
            </p>
          ) : null}
        </div>
      </div>
    </DragonModal>
  )
}
