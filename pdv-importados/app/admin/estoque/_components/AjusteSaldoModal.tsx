'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { DragonModal } from '@/components/ui/DragonModal'
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
      try {
        const res = await atualizarEstoqueProduto(payload)
        if (!res.ok) {
          setErro(res.error)
          return
        }
        router.refresh()
        onClose()
      } catch {
        setErro('Erro inesperado ao salvar. Tente novamente.')
      }
    })
  }

  return (
    <DragonModal
      open
      onClose={onClose}
      title={labels.titulo}
      subtitle={alvo.produtoNome}
      size="sm"
      dismissable={!pending}
      closeLabel={labels.cancelar}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={pending} className="admin-v2-btn-secondary">
            {labels.cancelar}
          </button>
          <button type="submit" form="ajuste-saldo-form" disabled={pending} className="admin-v2-btn-primary">
            {pending ? labels.salvando : labels.salvar}
          </button>
        </>
      }
    >
      <form id="ajuste-saldo-form" onSubmit={handleSubmit} className="flex flex-col gap-3 py-1">
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
      </form>
    </DragonModal>
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
