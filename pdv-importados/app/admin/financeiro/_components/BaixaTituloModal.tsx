'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { baixarContaReceber, type FormaPagamentoCR } from '../actions'
import type { ContaLinha } from './ContasReceberTable'
import { formatBRL } from '@/lib/format/money'
import { cn } from '@/lib/utils'

const FORMAS: { value: FormaPagamentoCR; label: string }[] = [
  { value: 'DINHEIRO', label: 'Dinheiro' },
  { value: 'PIX', label: 'PIX' },
  { value: 'CARTAO_DEBITO', label: 'Cartão de débito' },
  { value: 'CARTAO_CREDITO', label: 'Cartão de crédito' },
  { value: 'OUTROS', label: 'Outros' },
]

const inputCls =
  'admin-v2-input w-full px-2.5 py-[7px] text-[12px] font-mono outline-none transition-colors'

export function BaixaTituloModal({
  alvo,
  onClose,
}: {
  alvo: ContaLinha | null
  onClose: () => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const valorRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!alvo) return
    setErro(null)
    requestAnimationFrame(() => valorRef.current?.select())

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

  if (!alvo) return null

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const valorStr = String(fd.get('valor') ?? '').replace(',', '.')
    const valor = parseFloat(valorStr)
    if (!valor || valor <= 0) {
      setErro('Informe um valor válido maior que zero.')
      return
    }
    const forma = String(fd.get('forma')) as FormaPagamentoCR
    const observacao = String(fd.get('observacao') ?? '').trim()

    setErro(null)
    startTransition(async () => {
      try {
        const res = await baixarContaReceber({
          titulo_id: alvo.id,
          valor,
          forma_pagamento: forma,
          observacao: observacao || undefined,
        })
        if (!res.success) {
          setErro(res.error)
          return
        }
        router.refresh()
        onClose()
      } catch {
        setErro('Erro inesperado. Tente novamente.')
      }
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="baixa-titulo-heading"
    >
      <div
        className="absolute inset-0 bg-black/60"
        onClick={pending ? undefined : onClose}
        aria-hidden
      />
      <div className="admin-v2-panel relative z-10 w-full max-w-md rounded-[14px] p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="baixa-titulo-heading" className="text-[15px] font-semibold text-jl-fg-1">
              Receber título
            </h2>
            <p className="mt-0.5 max-w-[300px] truncate text-[12px] text-jl-fg-2">
              {alvo.cliente_nome}
            </p>
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

        <div className="mt-3 flex gap-4 rounded-lg border border-[#242424] bg-[#0d0d0d] px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] text-jl-fg-3">Total</p>
            <p className="text-[13px] font-medium text-jl-fg-1">{formatBRL(alvo.valor_total)}</p>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] text-jl-fg-3">Já recebido</p>
            <p className="text-[13px] font-medium text-emerald-400">{formatBRL(alvo.valor_pago)}</p>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] text-jl-fg-3">Em aberto</p>
            <p className="text-[13px] font-medium text-red-400">{formatBRL(alvo.valor_aberto)}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-jl-fg-3">Valor a receber *</span>
            <input
              ref={valorRef}
              name="valor"
              type="number"
              min="0.01"
              max={alvo.valor_aberto}
              step="0.01"
              required
              defaultValue={alvo.valor_aberto.toFixed(2)}
              disabled={pending}
              className={inputCls}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-jl-fg-3">Forma de recebimento *</span>
            <select name="forma" defaultValue="DINHEIRO" disabled={pending} className={inputCls}>
              {FORMAS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-jl-fg-3">Observação</span>
            <input
              name="observacao"
              type="text"
              maxLength={500}
              placeholder="Opcional"
              disabled={pending}
              className={inputCls}
            />
          </label>

          {erro ? (
            <p className={cn('admin-v2-alert-danger rounded-lg px-3 py-2 text-[12px]')}>{erro}</p>
          ) : null}

          <div className="mt-1 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="admin-v2-btn-secondary"
            >
              Cancelar
            </button>
            <button type="submit" disabled={pending} className="admin-v2-btn-primary">
              {pending ? 'Salvando…' : 'Confirmar recebimento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
