'use client'

import { useState } from 'react'
import { KeyRound, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DragonModal } from '@/components/ui/DragonModal'
import { Field, Input } from '@/components/ui/forms'
import { emitGerenteToast } from '@/lib/gerente/toast'
import { validarPinNovo, type ErroPin } from '@/lib/pdv/pinRegras'
import { definirPinFuncionarioAction, type FuncionarioListRow } from './actions'

export type FuncionarioPinLabels = {
  colPin: string
  sem: string
  ativo: string
  bloqueado: string
  trocarBadge: string
  definir: string
  trocar: string
  desbloquear: string
  modalTitulo: string
  modalSub: string
  pin: string
  pinConfirmar: string
  salvo: string
  desbloqueado: string
  salvar: string
  salvando: string
  cancelar: string
  erros: Record<ErroPin, string>
}

/** Gestor define/troca o PIN de um funcionário. O PIN só trafega até a server action (hash no servidor). */
export function FuncionarioPinModal({
  row,
  labels: L,
  onClose,
  onSalvo,
}: {
  row: FuncionarioListRow
  labels: FuncionarioPinLabels
  onClose: () => void
  onSalvo: (patch: Pick<FuncionarioListRow, 'pin_status' | 'pin_trocar'>) => void
}) {
  const [pin, setPin] = useState('')
  const [conf, setConf] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    const v = validarPinNovo(pin, conf)
    if (v) {
      setErro(L.erros[v])
      return
    }
    setSalvando(true)
    try {
      const r = await definirPinFuncionarioAction(row.id, pin, conf)
      if (!r.ok) {
        setErro(r.error)
        return
      }
      emitGerenteToast({ kind: 'success', message: L.salvo })
      onSalvo(r.data)
      onClose()
    } finally {
      setSalvando(false)
    }
  }

  const so4 = (v: string) => v.replace(/\D/g, '').slice(0, 4)
  return (
    <DragonModal
      open
      onClose={onClose}
      title={L.modalTitulo.replace('{nome}', row.nome)}
      icon={KeyRound}
      size="sm"
      dismissable={!salvando}
      data-testid="funcionario-pin-modal"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={salvando}>
            {L.cancelar}
          </Button>
          <Button type="submit" form="funcionario-pin-form" variant="primary" disabled={salvando} className="gap-1.5">
            {salvando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {salvando ? L.salvando : L.salvar}
          </Button>
        </>
      }
    >
      <form id="funcionario-pin-form" onSubmit={salvar} className="flex flex-col gap-3">
        <p className="text-caption text-fg-muted">{L.modalSub}</p>
        <div className="grid grid-cols-2 gap-3">
          <Field id="func-pin-novo" label={L.pin} required>
            <Input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              autoComplete="off"
              onChange={(ev) => {
                setPin(so4(ev.target.value))
                setErro(null)
              }}
              data-testid="funcionario-pin-novo"
              autoFocus
            />
          </Field>
          <Field id="func-pin-novo-conf" label={L.pinConfirmar} required>
            <Input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={conf}
              autoComplete="off"
              onChange={(ev) => {
                setConf(so4(ev.target.value))
                setErro(null)
              }}
              data-testid="funcionario-pin-novo-confirmar"
            />
          </Field>
        </div>
        {erro ? (
          <p role="alert" className="text-caption text-[var(--color-danger-strong)]" data-testid="funcionario-pin-erro">
            {erro}
          </p>
        ) : null}
      </form>
    </DragonModal>
  )
}

export function PinBadge({ row, labels: L }: { row: FuncionarioListRow; labels: FuncionarioPinLabels }) {
  if (row.pin_status == null || row.pin_status === undefined) return <span className="text-caption text-fg-subtle">—</span>
  const cls =
    row.pin_status === 'bloqueado'
      ? 'border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-[var(--color-danger-strong)]'
      : row.pin_status === 'ativo'
        ? 'border border-[var(--color-success-border)] bg-[var(--color-success-bg)] text-[var(--color-success-strong)]'
        : 'border border-[var(--color-border)] bg-[var(--color-surface-muted)] text-fg-subtle'
  const txt = row.pin_status === 'bloqueado' ? L.bloqueado : row.pin_status === 'ativo' ? L.ativo : L.sem
  return (
    <span className="inline-flex flex-wrap items-center gap-1" data-testid="funcionario-pin-status" data-status={row.pin_status}>
      <span className={`rounded-full px-2 py-0.5 text-caption font-medium ${cls}`}>{txt}</span>
      {row.pin_trocar && row.pin_status !== 'sem' ? (
        <span className="text-caption text-[var(--color-warning-strong)]" data-testid="funcionario-pin-trocar">
          {L.trocarBadge}
        </span>
      ) : null}
    </span>
  )
}
