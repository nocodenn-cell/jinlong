'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle } from 'lucide-react'
import { PageHeader, SectionCard } from '@/components/ui/admin-v2'
import type { SuspensaoStatus } from '@/app/gerente/suspensao/actions'
import { atualizarSuspensaoVendas } from '@/app/gerente/suspensao/actions'

type Props = { statusInicial: SuspensaoStatus }

export function SuspensaoContent({ statusInicial }: Props) {
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
    <div className="admin-v2-page">
      <PageHeader
        title="Suspensão de Vendas"
        subtitle="Controle de operações da loja"
      />

      <SectionCard title="Status da loja">
        {suspensas && (
          <div className="admin-v2-alert-warning mb-4 flex items-start gap-3 rounded-lg px-3 py-2">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <div>
              <p className="text-[12px] font-medium">Vendas suspensas</p>
              <p className="mt-0.5 text-[11px] opacity-90">
                Nenhuma venda poderá ser processada enquanto esta suspensão estiver ativa.
              </p>
            </div>
          </div>
        )}

        <div className="mb-4">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={suspensas}
              onChange={(e) => setSuspensas(e.target.checked)}
              className="h-5 w-5 rounded border-[var(--color-border-secondary)] bg-transparent accent-jl-accent"
            />
            <span className="text-[13px] font-medium text-jl-fg-1">
              {suspensas ? 'Vendas estão SUSPENSAS' : 'Vendas estão ATIVAS'}
            </span>
          </label>
        </div>

        <div className="mb-4">
          <label className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-jl-fg-3">
            Motivo (se suspensas)
          </label>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value.slice(0, 300))}
            placeholder="Descreva o motivo da suspensão (máx 300 caracteres)..."
            disabled={!suspensas}
            className="admin-v2-input w-full px-3 py-2 text-[12px] outline-none placeholder:text-jl-fg-3 disabled:opacity-50 focus:border-jl-accent/50"
            rows={4}
          />
          <p className="mt-1 text-[10px] text-jl-fg-3">
            {motivo.length} / 300 caracteres
          </p>
        </div>

        {error && (
          <div className="admin-v2-alert-danger mb-4 rounded-lg px-3 py-2 text-[12px]">
            {error}
          </div>
        )}

        {success && (
          <div className="admin-v2-alert-success mb-4 rounded-lg px-3 py-2 text-[12px]">
            Suspensão atualizada com sucesso
          </div>
        )}

        <button
          onClick={handleSalvar}
          disabled={loading}
          className="admin-v2-btn-primary disabled:opacity-50"
        >
          {loading ? 'Salvando...' : 'Salvar alterações'}
        </button>
      </SectionCard>
    </div>
  )
}
