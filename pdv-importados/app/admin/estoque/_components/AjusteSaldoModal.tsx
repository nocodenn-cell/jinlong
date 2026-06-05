'use client'

/**
 * FastProduct Admin — AjusteSaldoModal (Fase 5)
 *
 * Modal de ajuste de saldo/mínimo. Reusa a server action EXISTENTE
 * `atualizarEstoqueProduto` (RPC `ajustar_estoque_manual`) — nenhuma query nova.
 * Visual zinc-950 do painel /admin (o modal do gerente é branco/Dragon POS).
 *
 * Overlay fixo próprio (não usa DragonModal, que é temado p/ o POS): Escape e
 * clique no backdrop fecham; trava scroll do body enquanto aberto.
 */

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { atualizarEstoqueProduto } from '@/app/gerente/estoque/actions'

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '7px 10px',
  borderRadius: 8,
  fontSize: 12,
  background: 'var(--fp-bg-secondary)',
  border: '1px solid var(--fp-border)',
  color: 'var(--fp-text-primary)',
  outline: 'none',
}

const MOTIVOS = [
  { value: 'ACERTO_INVENTARIO', label: 'Acerto de inventário' },
  { value: 'COMPRA', label: 'Entrada por compra' },
  { value: 'PERDA', label: 'Perda' },
  { value: 'QUEBRA', label: 'Quebra / avaria' },
  { value: 'OUTRO', label: 'Outro (descreva)' },
] as const

export type AjusteAlvo = Readonly<{
  produtoId: string
  produtoNome: string
  quantidadeAtual: number
  estoqueMinimo: number
}>

export function AjusteSaldoModal({
  alvo,
  onClose,
}: {
  alvo: AjusteAlvo | null
  onClose: () => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  // Trava scroll + fecha no Escape enquanto aberto.
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

  // Reseta erro a cada (re)abertura.
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
        className="absolute inset-0"
        style={{ background: 'rgba(0,0,0,0.6)' }}
        onClick={pending ? undefined : onClose}
        aria-hidden
      />
      <div
        className="relative z-10 w-full max-w-md rounded-[14px] p-5"
        style={{ background: 'var(--fp-bg-card)', border: '1px solid var(--fp-border)' }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2
              id="ajuste-saldo-titulo"
              className="text-[15px] font-semibold"
              style={{ color: 'var(--fp-text-primary)' }}
            >
              Ajustar saldo
            </h2>
            <p className="mt-0.5 truncate text-[12px]" style={{ color: 'var(--fp-text-secondary)' }}>
              {alvo.produtoNome}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            aria-label="Fechar"
            className="-mr-1 -mt-1 rounded-lg p-1.5 transition-colors hover:bg-white/[0.06] disabled:opacity-50"
            style={{ color: 'var(--fp-text-muted)' }}
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Saldo atual">
              <input
                name="quantidade_atual"
                type="number"
                min={0}
                step="0.001"
                required
                defaultValue={alvo.quantidadeAtual}
                style={inputStyle}
              />
            </Field>
            <Field label="Estoque mínimo">
              <input
                name="estoque_minimo"
                type="number"
                min={0}
                step="0.001"
                required
                defaultValue={alvo.estoqueMinimo}
                style={inputStyle}
              />
            </Field>
          </div>

          <Field label="Motivo">
            <select name="motivo" required defaultValue="ACERTO_INVENTARIO" style={inputStyle}>
              {MOTIVOS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Observação">
            <input
              name="observacao"
              maxLength={500}
              placeholder="Opcional (obrigatória se o motivo for “Outro”)"
              style={inputStyle}
            />
          </Field>

          {erro ? (
            <p
              className="rounded-lg px-3 py-2 text-[12px]"
              style={{
                background: 'var(--fp-danger-bg)',
                border: '1px solid var(--fp-danger-border)',
                color: 'var(--fp-danger)',
              }}
            >
              {erro}
            </p>
          ) : null}

          <div className="mt-1 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="fp-btn fp-btn--secondary"
            >
              Cancelar
            </button>
            <button type="submit" disabled={pending} className="fp-btn fp-btn--primary">
              {pending ? 'Salvando…' : 'Salvar ajuste'}
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
      <span className="text-[11px] font-medium" style={{ color: 'var(--fp-text-muted)' }}>
        {label}
      </span>
      {children}
    </label>
  )
}
