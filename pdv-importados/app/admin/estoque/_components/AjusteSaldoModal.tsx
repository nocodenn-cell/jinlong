'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { SlidersHorizontal } from 'lucide-react'
import { atualizarEstoqueProduto } from '@/app/gerente/estoque/actions'
import { DragonModal } from '@/components/ui/DragonModal'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/forms'
import { ErrorState } from '@/components/ui/feedback'

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
      dismissable={!pending}
      size="md"
      icon={SlidersHorizontal}
      title={labels.titulo}
      subtitle={alvo.produtoNome}
      closeLabel={labels.cancelar}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            {labels.cancelar}
          </Button>
          <Button type="submit" form="ajuste-saldo-form" variant="primary" loading={pending}>
            {pending ? labels.salvando : labels.salvar}
          </Button>
        </>
      }
    >
      <form id="ajuste-saldo-form" onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Field id="ajuste-qtd" label={labels.saldoAtual} required>
            <Input
              name="quantidade_atual"
              type="number"
              min={0}
              step="0.001"
              required
              defaultValue={alvo.quantidadeAtual}
            />
          </Field>
          <Field id="ajuste-min" label={labels.estoqueMinimo} required>
            <Input
              name="estoque_minimo"
              type="number"
              min={0}
              step="0.001"
              required
              defaultValue={alvo.estoqueMinimo}
            />
          </Field>
        </div>

        <Field id="ajuste-motivo" label={labels.motivo} required>
          <Select name="motivo" required defaultValue="ACERTO_INVENTARIO">
            {labels.motivos.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field id="ajuste-obs" label={labels.observacao}>
          <Input
            name="observacao"
            maxLength={500}
            placeholder='Opcional (obrigatória se o motivo for "Outro")'
          />
        </Field>

        {erro ? <ErrorState dense title={erro} /> : null}
      </form>
    </DragonModal>
  )
}
