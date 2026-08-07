'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageShell, SectionCard } from '@/components/ui/admin-v2'
import { InlineAlert } from '@/components/ui/InlineAlert'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/forms'
import { emitToast } from '@/lib/gerente/toast'
import { askConfirm } from '@/lib/ui/askConfirm'
import type { SuspensaoStatus } from '@/app/gerente/suspensao/actions'
import { atualizarSuspensaoVendas } from '@/app/gerente/suspensao/actions'

type Labels = {
  titulo: string
  subtitulo: string
  statusTitulo: string
  alertTitulo: string
  alertDesc: string
  labelSuspensas: string
  labelAtivas: string
  motivoLabel: string
  motivoPlaceholder: string
  charsTemplate: string
  btnSalvar: string
  btnSalvando: string
  confirmTitulo: string
  confirmDesc: string
  confirmOk: string
  confirmCancel: string
  toastOk: string
}

type Props = {
  statusInicial: SuspensaoStatus
  labels: Labels
}

export function SuspensaoContent({ statusInicial, labels: L }: Props) {
  const router = useRouter()
  const [suspensas, setSuspensas] = useState(statusInicial.suspensas)
  const [motivo, setMotivo] = useState(statusInicial.motivo)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSalvar() {
    if (suspensas && !statusInicial.suspensas) {
      const ok = await askConfirm({
        title: L.confirmTitulo,
        description: L.confirmDesc,
        confirmLabel: L.confirmOk,
        cancelLabel: L.confirmCancel,
        variant: 'danger',
      })
      if (!ok) return
    }

    setLoading(true)
    setError(null)
    try {
      const res = await atualizarSuspensaoVendas(suspensas, motivo)
      if (!res.success) {
        setError(res.error)
        emitToast({ kind: 'error', message: res.error })
        return
      }
      emitToast({ kind: 'success', message: L.toastOk })
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <PageShell title={L.titulo} subtitle={L.subtitulo}>
      <SectionCard title={L.statusTitulo}>
        {suspensas ? (
          <InlineAlert tone="warning" title={L.alertTitulo} className="mb-4">
            {L.alertDesc}
          </InlineAlert>
        ) : null}

        <div className="mb-4">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={suspensas}
              onChange={(e) => setSuspensas(e.target.checked)}
              className="h-5 w-5 rounded border-[var(--color-border)] accent-[var(--color-brand)]"
            />
            <span className="text-body font-medium text-fg">
              {suspensas ? L.labelSuspensas : L.labelAtivas}
            </span>
          </label>
        </div>

        <div className="mb-4">
          <Field id="suspensao-motivo" label={L.motivoLabel}>
            <textarea
              id="suspensao-motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value.slice(0, 300))}
              placeholder={L.motivoPlaceholder}
              disabled={!suspensas}
              className="admin-v2-input w-full px-3 py-2 text-caption outline-none placeholder:text-fg-subtle disabled:opacity-50 focus:border-jl-accent/50"
              rows={4}
            />
          </Field>
          <p className="mt-1 text-[10px] text-fg-subtle">
            {L.charsTemplate.replace('{{n}}', String(motivo.length))}
          </p>
        </div>

        {error ? (
          <InlineAlert tone="danger" className="mb-4">
            {error}
          </InlineAlert>
        ) : null}

        <Button type="button" disabled={loading} onClick={() => void handleSalvar()}>
          {loading ? L.btnSalvando : L.btnSalvar}
        </Button>
      </SectionCard>
    </PageShell>
  )
}
