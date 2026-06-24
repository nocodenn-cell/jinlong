'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import {
  registrarDevolucao,
  obterSaldoDevolvivel,
  type FormaDevolucao,
  type SaldoDevolvivel,
} from '../actions'
import { formatBRL } from '@/lib/format/money'
import { cn } from '@/lib/utils'

type DevolucaoAlvo = {
  id: string
  total_liquido: number | null
}

const FORMAS: { value: FormaDevolucao; label: string }[] = [
  { value: 'DINHEIRO', label: 'Dinheiro' },
  { value: 'PIX', label: 'PIX' },
  { value: 'CARTAO_DEBITO', label: 'Cartão de débito' },
  { value: 'CARTAO_CREDITO', label: 'Cartão de crédito' },
]

const inputCls =
  'admin-v2-input w-full px-2.5 py-[7px] text-[12px] outline-none transition-colors'
const monoInputCls = `${inputCls} font-mono`

export function DevolucaoModal({
  alvo,
  onClose,
}: {
  alvo: DevolucaoAlvo | null
  onClose: () => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [saldo, setSaldo] = useState<SaldoDevolvivel | null>(null)
  const [carregando, setCarregando] = useState(false)
  const motivoRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!alvo) {
      setSaldo(null)
      setErro(null)
      return
    }

    setErro(null)
    setSaldo(null)
    setCarregando(true)

    obterSaldoDevolvivel(alvo.id).then((res) => {
      setCarregando(false)
      if (!res.success) {
        setErro(res.error)
        return
      }
      setSaldo(res.data)
      requestAnimationFrame(() => motivoRef.current?.focus())
    })

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
    if (!saldo) return

    const fd = new FormData(e.currentTarget)
    const valorStr = String(fd.get('valor') ?? '').replace(',', '.')
    const valor = parseFloat(valorStr)
    if (!valor || valor <= 0) {
      setErro('Informe um valor válido maior que zero.')
      return
    }
    if (valor > saldo.saldo_devolvivel + 0.005) {
      setErro(`Valor excede o saldo disponível (${formatBRL(saldo.saldo_devolvivel)}).`)
      return
    }
    const forma = String(fd.get('forma')) as FormaDevolucao
    const motivo = String(fd.get('motivo') ?? '').trim()
    if (!motivo) {
      setErro('Motivo é obrigatório.')
      return
    }

    setErro(null)
    startTransition(async () => {
      try {
        const res = await registrarDevolucao({
          venda_id: alvo.id,
          valor,
          forma_pagamento: forma,
          motivo,
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

  const podeDevolver =
    saldo &&
    saldo.status.toUpperCase() === 'CONCLUIDA' &&
    saldo.saldo_devolvivel > 0.005

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="devolucao-heading"
    >
      <div
        className="absolute inset-0 bg-black/60"
        onClick={pending ? undefined : onClose}
        aria-hidden
      />
      <div className="admin-v2-panel relative z-10 w-full max-w-md rounded-[14px] p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="devolucao-heading" className="text-[15px] font-semibold text-jl-fg-1">
              Registrar devolução
            </h2>
            <p className="mt-0.5 text-[12px] text-jl-fg-2">
              Venda #{alvo.id.slice(0, 8).toUpperCase()}
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

        {carregando ? (
          <div className="mt-6 flex items-center justify-center py-8">
            <span className="text-[12px] text-jl-fg-3">Carregando…</span>
          </div>
        ) : erro && !saldo ? (
          <div className="mt-4">
            <p className={cn('admin-v2-alert-danger rounded-lg px-3 py-2 text-[12px]')}>{erro}</p>
            <div className="mt-3 flex justify-end">
              <button type="button" onClick={onClose} className="admin-v2-btn-secondary">
                Fechar
              </button>
            </div>
          </div>
        ) : saldo && saldo.status.toUpperCase() !== 'CONCLUIDA' ? (
          <div className="mt-4">
            <p className={cn('admin-v2-alert-danger rounded-lg px-3 py-2 text-[12px]')}>
              Devolução permitida apenas para vendas concluídas. Esta venda está com status{' '}
              <strong>{saldo.status}</strong>.
            </p>
            <div className="mt-3 flex justify-end">
              <button type="button" onClick={onClose} className="admin-v2-btn-secondary">
                Fechar
              </button>
            </div>
          </div>
        ) : saldo && saldo.saldo_devolvivel <= 0.005 ? (
          <div className="mt-4">
            <p className={cn('admin-v2-alert-danger rounded-lg px-3 py-2 text-[12px]')}>
              O valor total desta venda já foi devolvido ({formatBRL(saldo.total_liquido)}).
            </p>
            <div className="mt-3 flex justify-end">
              <button type="button" onClick={onClose} className="admin-v2-btn-secondary">
                Fechar
              </button>
            </div>
          </div>
        ) : saldo ? (
          <>
            <div className="mt-3 flex gap-4 rounded-lg border border-[#242424] bg-[#0d0d0d] px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] text-jl-fg-3">Valor da venda</p>
                <p className="text-[13px] font-medium text-jl-fg-1">{formatBRL(saldo.total_liquido)}</p>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] text-jl-fg-3">Já devolvido</p>
                <p className={cn('text-[13px] font-medium', saldo.total_devolvido > 0 ? 'text-amber-400' : 'text-jl-fg-3')}>
                  {formatBRL(saldo.total_devolvido)}
                </p>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] text-jl-fg-3">Saldo disponível</p>
                <p className="text-[13px] font-medium text-emerald-400">{formatBRL(saldo.saldo_devolvivel)}</p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-medium text-jl-fg-3">Valor devolvido *</span>
                <input
                  name="valor"
                  type="number"
                  min="0.01"
                  max={saldo.saldo_devolvivel}
                  step="0.01"
                  required
                  defaultValue={saldo.saldo_devolvivel.toFixed(2)}
                  disabled={pending || !podeDevolver}
                  className={monoInputCls}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-medium text-jl-fg-3">Forma de reembolso *</span>
                <select name="forma" defaultValue="DINHEIRO" disabled={pending} className={inputCls}>
                  {FORMAS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-medium text-jl-fg-3">Motivo *</span>
                <textarea
                  ref={motivoRef}
                  name="motivo"
                  required
                  rows={3}
                  maxLength={500}
                  placeholder="Descreva o motivo da devolução"
                  disabled={pending}
                  className={`${inputCls} resize-none`}
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
                  {pending ? 'Registrando…' : 'Confirmar devolução'}
                </button>
              </div>
            </form>
          </>
        ) : null}
      </div>
    </div>
  )
}
