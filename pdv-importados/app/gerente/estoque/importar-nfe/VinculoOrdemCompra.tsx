'use client'

import { useEffect, useState } from 'react'
import { Link2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/forms'
import { emitGerenteToast } from '@/lib/gerente/toast'
import {
  listarOrdensCompraVinculaveis,
  vincularOrdemCompraNfe,
  type OrdemCompraVinculavel,
} from './actions'

export type VinculoLabels = Readonly<{
  titulo: string
  hint: string
  placeholder: string
  vincular: string
  vinculado: string
  semOrdens: string
  sucesso: string
}>

type Props = Readonly<{
  importacaoId: string
  ordemCompraId: string | null
  labels: VinculoLabels
  /** Recarrega a conferência para refletir o vínculo recém-declarado. */
  onVinculado: () => void
  disabled?: boolean
}>

/**
 * Declara que esta NF-e é o documento fiscal de uma ordem de compra.
 *
 * É o que impede a dupla entrada: sem o vínculo, receber a ordem e importar a
 * nota da mesma compra creditariam o estoque duas vezes. A guarda real está no
 * banco (`vincular_importacao_nfe_ordem_compra` + guardas nas duas RPCs de
 * crédito); esta tela apenas oferece o caminho para declará-lo.
 */
export function VinculoOrdemCompra({
  importacaoId,
  ordemCompraId,
  labels,
  onVinculado,
  disabled = false,
}: Props) {
  const [ordens, setOrdens] = useState<OrdemCompraVinculavel[]>([])
  const [escolhida, setEscolhida] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (ordemCompraId) return
    let vivo = true
    void listarOrdensCompraVinculaveis().then((r) => {
      if (vivo && r.success) setOrdens(r.data)
    })
    return () => {
      vivo = false
    }
  }, [ordemCompraId])

  async function vincular() {
    if (!escolhida || salvando) return
    setSalvando(true)
    try {
      const r = await vincularOrdemCompraNfe(importacaoId, escolhida)
      if (!r.success) {
        emitGerenteToast({ kind: 'error', message: r.error })
        return
      }
      emitGerenteToast({ kind: 'success', message: labels.sucesso })
      onVinculado()
    } finally {
      setSalvando(false)
    }
  }

  if (ordemCompraId) {
    return (
      <div className="mt-4 flex items-center gap-2 rounded-lg border border-[var(--color-success-border)] bg-[var(--color-success-bg)] px-4 py-3">
        <Link2 className="h-4 w-4 shrink-0 text-[var(--color-success-strong)]" aria-hidden />
        <p className="text-body text-[var(--color-success-strong)]">
          {labels.vinculado.replace('{{id}}', ordemCompraId.slice(0, 8).toUpperCase())}
        </p>
      </div>
    )
  }

  return (
    <div className="mt-4 rounded-lg border border-[var(--color-border)] p-3">
      <p className="text-caption font-semibold uppercase tracking-wide text-fg-muted">
        {labels.titulo}
      </p>
      <p className="mt-1 text-caption text-fg-subtle">{labels.hint}</p>

      {ordens.length === 0 ? (
        <p className="mt-2 text-body text-fg-muted">{labels.semOrdens}</p>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Select
            value={escolhida}
            onChange={(e) => setEscolhida(e.target.value)}
            disabled={disabled || salvando}
            className="min-w-56 flex-1"
          >
            <option value="">{labels.placeholder}</option>
            {ordens.map((oc) => (
              <option key={oc.id} value={oc.id}>
                {oc.id.slice(0, 8).toUpperCase()} · {oc.fornecedor_nome ?? '—'} ·{' '}
                {oc.total_itens} it.
              </option>
            ))}
          </Select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!escolhida || disabled}
            loading={salvando}
            onClick={() => void vincular()}
          >
            {labels.vincular}
          </Button>
        </div>
      )}
    </div>
  )
}
