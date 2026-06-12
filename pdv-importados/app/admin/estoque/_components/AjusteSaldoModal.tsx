'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { atualizarEstoqueProduto } from '@/app/gerente/estoque/actions'
import { cn } from '@/lib/utils'

type Motivo = { value: string; label: string }

type AjusteLabels = {
  titulo: string
  saldoAtual: string
  estoqueMinimo: string
  motivo: string
  observacao: string
  cancelar: string
  salvar: string
  salvando: string
  motivos: Motivo[]
}

const inputClassName =
  'admin-v2-input w-full px-2.5 py-[7px] text-[12px] outline-none transition-colors'

export type AjusteAlvo = Readonly<{
  produtoId: string
  produtoNome: string
  quantidadeAtual: number
  estoqueMinimo: number
}>

export function AjusteSaldoModal({
  alvo,
  onClose,
  labels,
}: {
  alvo: AjusteAlvo | null
  onClose: () => void
  labels: AjusteLabels
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!alvo) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [alvo, pending, onClose])

  useEffect(() => {
    if (alvo) setErro(null)
  }, [alvo])

  if (!alvo) return null

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const payload = {
      produto_id: alvo.produtoId,
      quantidade_atual: Number(fd.get('quantidade_atual')),
      estoque_minimo: Number(fd.get('estoque_minimo')),
      motivo: String(fd.get('motivo') ?? ''),
      observacao: String(fd.get('observacao') ?? '').trim() || undefined,
    }
    setErro(null)
    startTransition(async () => {
      const res = await atualizarEstoqueProduto(payload)
      if (!res.ok) {
        setErro(res.error)
        return
      }
      router.refresh()
      onClose()
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ajuste-saldo-titulo"
    >
      <div
        className="absolute inset-0 bg-black/60"
        onClick={pending ? undefined : onClose}
        aria-hidden
      />
      <div className="admin-v2-panel relative z-10 w-full max-w-md rounded-[14px] p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="ajuste-saldo-titulo" className="text-[15px] font-semibold text-jl-fg-1">
              {labels.titulo}
            </h2>
            <p className="mt-0.5 truncate text-[12px] text-jl-fg-2">{alvo.produtoNome}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            aria-label="Fechar"
            className="-mr-1 -mt-1 rounded-lg p-1.5 text-jl-fg-3 transition-colors hover:bg-white/[0.06] disabled:opacity-50"
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label={labels.saldoAtual}>
              <input
                name="quantidade_atual"
                type="number"
                min={0}
                step="0.001"
                required
                defaultValue={alvo.quantidadeAtual}
                className={inputClassName}
              />
            </Field>
            <Field label={labels.estoqueMinimo}>
              <input
                name="estoque_minimo"
                type="number"
                min={0}
                step="0.001"
                required
                defaultValue={alvo.estoqueMinimo}
                className={inputClassName}
              />
            </Field>
          </div>

          <Field label={labels.motivo}>
            <select name="motivo" required defaultValue="ACERTO_INVENTARIO" className={inputClassName}>
              {labels.motivos.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label={labels.observacao}>
            <input
              name="observacao"
              maxLength={500}
              placeholder='Opcional (obrigatória se o motivo for "Outro")'
              className={inputClassName}
            />
          </Field>

          {erro ? (
            <p className={cn('admin-v2-alert-danger rounded-lg px-3 py-2 text-[12px]')}>{erro}</p>
          ) : null}

          <div className="mt-1 flex items-center justify-end gap-2">
            <button type="button" onClick={onClose} disabled={pending} className="admin-v2-btn-secondary">
              {labels.cancelar}
            </button>
            <button type="submit" disabled={pending} className="admin-v2-btn-primary">
              {pending ? labels.salvando : labels.salvar}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-jl-fg-3">{label}</span>
      {children}
    </label>
  )
}
