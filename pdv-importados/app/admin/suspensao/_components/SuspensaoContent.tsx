'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle } from 'lucide-react'
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
    <div className="flex flex-col">
      {/* Cabeçalho */}
      <div className="px-6 pb-3 pt-5">
        <h1 className="text-[18px] font-semibold text-zinc-100">Suspensão de Vendas</h1>
        <p className="mt-0.5 text-[12px] text-zinc-500">
          Controle de operações da loja
        </p>
      </div>

      {/* Conteúdo */}
      <div className="px-6 py-6">
        <div
          className="rounded-lg border p-6"
          style={{
            background: 'var(--fp-bg-secondary)',
            border: '1px solid var(--fp-border)',
          }}
        >
          {/* Warning */}
          {suspensas && (
            <div
              className="mb-4 flex items-start gap-3 rounded-lg px-3 py-2"
              style={{
                background: 'var(--fp-warning-bg)',
                border: '1px solid var(--fp-warning-border)',
              }}
            >
              <AlertCircle size={16} style={{ color: 'var(--fp-warning)' }} className="shrink-0 mt-0.5" />
              <div>
                <p style={{ color: 'var(--fp-warning)' }} className="text-[12px] font-medium">
                  Vendas suspensas
                </p>
                <p style={{ color: 'var(--fp-warning)' }} className="text-[11px] mt-0.5">
                  Nenhuma venda poderá ser processada enquanto esta suspensão estiver ativa.
                </p>
              </div>
            </div>
          )}

          {/* Toggle */}
          <div className="mb-4">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={suspensas}
                onChange={(e) => setSuspensas(e.target.checked)}
                className="h-5 w-5 rounded border-zinc-600 bg-zinc-900 accent-yellow-500"
              />
              <span className="text-[13px] font-medium text-zinc-200">
                {suspensas ? 'Vendas estão SUSPENSAS' : 'Vendas estão ATIVAS'}
              </span>
            </label>
          </div>

          {/* Motivo */}
          <div className="mb-4">
            <label className="block text-[11px] font-medium uppercase tracking-wider text-zinc-500 mb-2">
              Motivo (se suspensas)
            </label>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value.slice(0, 300))}
              placeholder="Descreva o motivo da suspensão (máx 300 caracteres)..."
              disabled={!suspensas}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-[12px] text-zinc-100 placeholder-zinc-600 disabled:opacity-50 focus:border-yellow-500 focus:outline-none"
              rows={4}
            />
            <p className="mt-1 text-[10px] text-zinc-500">
              {motivo.length} / 300 caracteres
            </p>
          </div>

          {/* Erro */}
          {error && (
            <div
              className="rounded-lg px-3 py-2 mb-4 text-[12px]"
              style={{
                background: 'var(--fp-danger-bg)',
                border: '1px solid var(--fp-danger-border)',
                color: 'var(--fp-danger)',
              }}
            >
              {error}
            </div>
          )}

          {/* Sucesso */}
          {success && (
            <div
              className="rounded-lg px-3 py-2 mb-4 text-[12px]"
              style={{
                background: 'var(--fp-success-bg)',
                border: '1px solid var(--fp-success-border)',
                color: 'var(--fp-success)',
              }}
            >
              ✓ Suspensão atualizada com sucesso
            </div>
          )}

          {/* Botão */}
          <button
            onClick={handleSalvar}
            disabled={loading}
            className="rounded-lg bg-yellow-500 px-4 py-2 text-[13px] font-medium text-zinc-950 transition-colors disabled:opacity-50 hover:bg-yellow-400"
          >
            {loading ? 'Salvando...' : 'Salvar alterações'}
          </button>
        </div>
      </div>
    </div>
  )
}
