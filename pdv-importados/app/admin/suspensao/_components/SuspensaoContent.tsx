'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle } from 'lucide-react'
import { SectionCard } from '@/components/ui/admin-v2'
import type { SuspensaoStatus } from '@/app/gerente/suspensao/actions'
import { atualizarSuspensaoVendas } from '@/app/gerente/suspensao/actions'

type Labels = {
  titulo: string
  subtitulo: string
  erroCarregar: string
  alertaTitulo: string
  alertaTexto: string
  statusSuspensas: string
  statusAtivas: string
  motivoLabel: string
  motivoPlaceholder: string
  motivoContador: string
  sucesso: string
  salvarBtn: string
  salvando: string
}

type Props = {
  statusInicial: SuspensaoStatus
  loadError: string | null
  labels: Labels
}

export function SuspensaoContent({ statusInicial, loadError, labels: l }: Props) {
  const router = useRouter()
  const [suspensas, setSuspensas] = useState(statusInicial.suspensas)
  const [motivo, setMotivo] = useState(statusInicial.motivo)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSalvar = async () => {
    setLoading(true)
    setError(null)
    setSuccess(false)

    try {
      const res = await atualizarSuspensaoVendas(suspensas, motivo)
      if (!res.success) {
        setError(res.error)
        return
      }
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <SectionCard title={l.titulo}>
        {loadError && (
          <div
            className="admin-v2-alert-danger mb-4 flex items-start gap-3 rounded-lg px-3 py-2 text-[12px]"
            role="alert"
          >
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <p>{l.erroCarregar}</p>
          </div>
        )}

        {suspensas && (
          <div className="admin-v2-alert-warning mb-4 flex items-start gap-3 rounded-lg px-3 py-2">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <div>
              <p className="text-[12px] font-medium">{l.alertaTitulo}</p>
              <p className="mt-0.5 text-[11px] opacity-90">{l.alertaTexto}</p>
            </div>
          </div>
        )}

        <div className="mb-4">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={suspensas}
              onChange={(e) => setSuspensas(e.target.checked)}
              disabled={Boolean(loadError)}
              className="h-5 w-5 rounded border-[var(--color-border-secondary)] bg-transparent accent-jl-accent disabled:opacity-50"
            />
            <span className="text-[13px] font-medium text-jl-fg-1">
              {suspensas ? l.statusSuspensas : l.statusAtivas}
            </span>
          </label>
        </div>

        <div className="mb-4">
          <label className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-jl-fg-3">
            {l.motivoLabel}
          </label>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value.slice(0, 300))}
            placeholder={l.motivoPlaceholder}
            disabled={!suspensas || Boolean(loadError)}
            className="admin-v2-input w-full px-3 py-2 text-[12px] outline-none placeholder:text-jl-fg-3 disabled:opacity-50 focus:border-jl-accent/50"
            rows={4}
          />
          <p className="mt-1 text-[10px] text-jl-fg-3">
            {l.motivoContador.replace('{{n}}', String(motivo.length))}
          </p>
        </div>

        {error && (
          <div className="admin-v2-alert-danger mb-4 rounded-lg px-3 py-2 text-[12px]" role="alert">
            {error}
          </div>
        )}

        {success && (
          <div className="admin-v2-alert-success mb-4 rounded-lg px-3 py-2 text-[12px]">
            {l.sucesso}
          </div>
        )}

        <button
          onClick={handleSalvar}
          disabled={loading || Boolean(loadError)}
          className="admin-v2-btn-primary disabled:opacity-50"
        >
          {loading ? l.salvando : l.salvarBtn}
        </button>
      </SectionCard>
    </>
  )
}
