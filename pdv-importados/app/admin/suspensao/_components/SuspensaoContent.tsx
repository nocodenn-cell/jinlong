'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle } from 'lucide-react'
import { PageHeader, SectionCard } from '@/components/ui/admin-v2'
import { Button } from '@/components/ui/button'
import { DragonModal } from '@/components/ui/DragonModal'
import { StatusChip } from '@/components/ui/StatusChip'
import type { SuspensaoStatus } from '@/app/gerente/suspensao/actions'
import { atualizarSuspensaoVendas } from '@/app/gerente/suspensao/actions'

type Props = { statusInicial: SuspensaoStatus }

const MOTIVO_MAX = 300

export function SuspensaoContent({ statusInicial }: Props) {
  const router = useRouter()
  // O estado exibido (badge, motivo vigente) vem SEMPRE do servidor, via props: só muda depois que
  // `router.refresh()` reler o que foi realmente gravado. Nada de setState otimista.
  const suspensas = statusInicial.suspensas
  const motivoAtual = statusInicial.motivo
  const [atualizando, startTransition] = useTransition()
  const [motivo, setMotivo] = useState('')
  const [confirmando, setConfirmando] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const motivoValido = motivo.trim().length > 0

  const handleConfirmar = async () => {
    const suspender = !suspensas
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      // Mesma action de antes; ao liberar, o motivo é limpo (string vazia).
      const motivoEnviado = suspender ? motivo.trim() : ''
      const res = await atualizarSuspensaoVendas(suspender, motivoEnviado)
      if (!res.success) {
        setError(res.error)
        // Falha parcial possível (flag gravada, motivo não): releia o estado persistido.
        startTransition(() => router.refresh())
        return
      }
      setMotivo('')
      setSuccess(suspender ? 'Vendas suspensas.' : 'Vendas liberadas.')
      setTimeout(() => setSuccess(null), 3000)
      startTransition(() => router.refresh())
    } finally {
      setLoading(false)
      setConfirmando(false)
    }
  }

  return (
    <div className="admin-v2-page">
      <PageHeader
        title="Suspensão de Vendas"
        subtitle="Controle de operações da loja"
      />

      <SectionCard title="Status da loja">
        <div className="mb-4 flex items-center gap-3">
          <StatusChip
            status={suspensas ? 'ERRO' : 'ATIVO'}
            label={suspensas ? 'Vendas suspensas' : 'Vendas ativas'}
          />
        </div>

        {suspensas ? (
          <>
            <div className="admin-v2-alert-warning mb-4 flex items-start gap-3 rounded-lg px-3 py-2">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <div>
                <p className="text-[12px] font-medium">Nenhuma venda pode ser processada.</p>
                <p className="mt-0.5 text-[11px] opacity-90">
                  Motivo: {motivoAtual || '—'}
                </p>
              </div>
            </div>
            <Button type="button" onClick={() => setConfirmando(true)} disabled={loading || atualizando}>
              Liberar vendas
            </Button>
          </>
        ) : (
          <>
            <div className="mb-4">
              <label
                htmlFor="suspensao-motivo"
                className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-jl-fg-3"
              >
                Motivo da suspensão (obrigatório)
              </label>
              <textarea
                id="suspensao-motivo"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value.slice(0, MOTIVO_MAX))}
                placeholder={`Descreva o motivo da suspensão (máx ${MOTIVO_MAX} caracteres)...`}
                className="admin-v2-input w-full px-3 py-2 text-[12px] outline-none placeholder:text-jl-fg-3 focus:border-jl-accent/50"
                rows={4}
              />
              <p className="mt-1 text-[10px] text-jl-fg-3">
                {motivo.length} / {MOTIVO_MAX} caracteres
              </p>
            </div>
            <Button
              type="button"
              variant="danger"
              onClick={() => setConfirmando(true)}
              disabled={!motivoValido || loading || atualizando}
            >
              Suspender vendas
            </Button>
          </>
        )}

        {error && (
          <div className="admin-v2-alert-danger mt-4 rounded-lg px-3 py-2 text-[12px]">
            {error}
          </div>
        )}

        {success && (
          <div className="admin-v2-alert-success mt-4 rounded-lg px-3 py-2 text-[12px]">
            {success}
          </div>
        )}
      </SectionCard>

      {confirmando ? (
        <DragonModal
          open
          onClose={() => setConfirmando(false)}
          variant={suspensas ? 'default' : 'danger'}
          size="sm"
          title={suspensas ? 'Liberar vendas?' : 'Suspender vendas?'}
          dismissable={!loading}
          closeLabel="Fechar"
          footer={
            <>
              <Button type="button" variant="secondary" onClick={() => setConfirmando(false)} disabled={loading}>
                Cancelar
              </Button>
              <Button
                type="button"
                variant={suspensas ? 'primary' : 'danger'}
                onClick={() => void handleConfirmar()}
                disabled={loading}
              >
                {loading ? 'Salvando...' : suspensas ? 'Liberar vendas' : 'Suspender vendas'}
              </Button>
            </>
          }
        >
          <p className="text-sm text-jl-fg-2">
            {suspensas
              ? 'O PDV volta a aceitar vendas imediatamente em todos os caixas.'
              : 'Nenhuma venda poderá ser processada em nenhum caixa até que as vendas sejam liberadas.'}
          </p>
        </DragonModal>
      ) : null}
    </div>
  )
}
