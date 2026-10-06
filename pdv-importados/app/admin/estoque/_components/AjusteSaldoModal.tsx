'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { PackageMinus, SlidersHorizontal } from 'lucide-react'
import { atualizarEstoqueProduto } from '@/app/gerente/estoque/actions'
import { DragonModal } from '@/components/ui/DragonModal'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/forms'
import { ErrorState } from '@/components/ui/feedback'

type Motivo = { value: string; label: string }

export type AjusteModo = 'generico' | 'retirar' | 'ajustar'

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
  quantidadeRetirar?: string
  quantidadeContada?: string
  saldoAnterior?: string
  referenciaDoc?: string
  referenciaDocHint?: string
  unidadeLabel?: string
  codigoLabel?: string
  confirmarRetirada?: string
  confirmarAjuste?: string
  erroRetiradaInvalida?: string
  erroRetiradaExcede?: string
}

export type AjusteAlvo = Readonly<{
  produtoId: string
  produtoNome: string
  quantidadeAtual: number
  estoqueMinimo: number
  codigoBarras?: string | null
  unidade?: string
  modo?: AjusteModo
}>

const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 3 })

/** "Saldo: 9 → 5 (−4)". Sem valor válido, mostra só o saldo atual. */
export function previaAjuste(atual: number, novo: number | null): string {
  if (novo == null || !Number.isFinite(novo)) return `Saldo atual: ${fmt(atual)}`
  const delta = Math.round((novo - atual) * 1000) / 1000
  if (delta === 0) return `Saldo: ${fmt(atual)} (sem alteração)`
  const sinal = delta > 0 ? '+' : '−'
  return `Saldo: ${fmt(atual)} → ${fmt(novo)} (${sinal}${fmt(Math.abs(delta))})`
}

/** Prévia da retirada: quantidade a remover → saldo resultante. */
export function previaRetirada(atual: number, qtdRetirar: number | null): string {
  if (qtdRetirar == null || !Number.isFinite(qtdRetirar) || qtdRetirar <= 0) {
    return `Saldo atual: ${fmt(atual)}`
  }
  const novo = Math.round((atual - qtdRetirar) * 1000) / 1000
  return `Saldo: ${fmt(atual)} → ${fmt(novo)} (−${fmt(qtdRetirar)})`
}

function montarObservacao(referencia: string, observacao: string): string | undefined {
  const ref = referencia.trim()
  const obs = observacao.trim()
  if (ref && obs) return `[Doc: ${ref}] ${obs}`
  if (ref) return `[Doc: ${ref}]`
  return obs || undefined
}

function motivoPadrao(modo: AjusteModo, motivos: Motivo[]): string {
  if (modo === 'retirar') {
    return motivos.find((m) => m.value === 'PERDA')?.value ?? motivos[0]?.value ?? 'PERDA'
  }
  if (modo === 'ajustar') {
    return (
      motivos.find((m) => m.value === 'ACERTO_INVENTARIO')?.value ??
      motivos[0]?.value ??
      'ACERTO_INVENTARIO'
    )
  }
  return motivos.find((m) => m.value === 'ACERTO_INVENTARIO')?.value ?? motivos[0]?.value ?? ''
}

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
  const [campoQtd, setCampoQtd] = useState<number | null>(null)
  const [referencia, setReferencia] = useState('')
  const [observacao, setObservacao] = useState('')

  const modo: AjusteModo = alvo?.modo ?? 'generico'

  useEffect(() => {
    if (!alvo) return
    setErro(null)
    setReferencia('')
    setObservacao('')
    setCampoQtd(modo === 'retirar' ? null : alvo.quantidadeAtual)
  }, [alvo, modo])

  if (!alvo) return null

  const Icon = modo === 'retirar' ? PackageMinus : SlidersHorizontal
  const salvarLabel =
    modo === 'retirar'
      ? (labels.confirmarRetirada ?? labels.salvar)
      : modo === 'ajustar'
        ? (labels.confirmarAjuste ?? labels.salvar)
        : labels.salvar

  const previaTexto =
    modo === 'retirar'
      ? previaRetirada(alvo.quantidadeAtual, campoQtd)
      : previaAjuste(alvo.quantidadeAtual, campoQtd)

  const qtdFieldLabel =
    modo === 'retirar'
      ? (labels.quantidadeRetirar ?? labels.saldoAtual)
      : modo === 'ajustar'
        ? (labels.quantidadeContada ?? labels.saldoAtual)
        : labels.saldoAtual

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const motivo = String(fd.get('motivo') ?? '')
    const obsFinal = montarObservacao(referencia, observacao)

    let quantidadeAtual = alvo.quantidadeAtual
    let estoqueMinimo = alvo.estoqueMinimo

    if (modo === 'retirar') {
      const qtdRetirar = Number(fd.get('quantidade_retirar'))
      if (!Number.isFinite(qtdRetirar) || qtdRetirar <= 0) {
        setErro(labels.erroRetiradaInvalida ?? 'Informe uma quantidade positiva a retirar.')
        return
      }
      if (qtdRetirar > alvo.quantidadeAtual) {
        setErro(
          labels.erroRetiradaExcede ??
            `Não é possível retirar mais que o saldo atual (${fmt(alvo.quantidadeAtual)}).`,
        )
        return
      }
      quantidadeAtual = Math.round((alvo.quantidadeAtual - qtdRetirar) * 1000) / 1000
    } else {
      quantidadeAtual = Number(fd.get('quantidade_atual'))
      estoqueMinimo = Number(fd.get('estoque_minimo'))
    }

    const payload = {
      produto_id: alvo.produtoId,
      quantidade_atual: quantidadeAtual,
      estoque_minimo: estoqueMinimo,
      motivo,
      observacao: obsFinal,
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
      icon={Icon}
      title={labels.titulo}
      subtitle={alvo.produtoNome}
      closeLabel={labels.cancelar}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            {labels.cancelar}
          </Button>
          <Button type="submit" form="ajuste-saldo-form" variant="primary" loading={pending}>
            {pending ? labels.salvando : salvarLabel}
          </Button>
        </>
      }
    >
      <form id="ajuste-saldo-form" onSubmit={handleSubmit} className="flex flex-col gap-3">
        <ProdutoContexto alvo={alvo} labels={labels} />

        {modo === 'retirar' ? (
          <Field id="ajuste-qtd-retirar" label={qtdFieldLabel} required>
            <Input
              name="quantidade_retirar"
              type="number"
              min={0.001}
              max={alvo.quantidadeAtual}
              step="0.001"
              required
              placeholder="0"
              onChange={(e) => setCampoQtd(e.target.value === '' ? null : Number(e.target.value))}
            />
          </Field>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field id="ajuste-qtd" label={qtdFieldLabel} required>
              <Input
                name="quantidade_atual"
                type="number"
                min={0}
                step="0.001"
                required
                defaultValue={alvo.quantidadeAtual}
                onChange={(e) => setCampoQtd(e.target.value === '' ? null : Number(e.target.value))}
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
        )}

        <p className="text-caption text-fg-muted" data-testid="ajuste-previa" aria-live="polite">
          {previaTexto}
        </p>

        <Field id="ajuste-motivo" label={labels.motivo} required>
          <Select name="motivo" required defaultValue={motivoPadrao(modo, labels.motivos)}>
            {labels.motivos.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>

        {modo !== 'generico' ? (
          <Field id="ajuste-ref" label={labels.referenciaDoc ?? 'Referência / documento'}>
            <Input
              name="referencia_doc"
              maxLength={80}
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              placeholder={labels.referenciaDocHint ?? 'Opcional (NF, OS, protocolo…)'}
            />
          </Field>
        ) : null}

        <Field id="ajuste-obs" label={labels.observacao}>
          <Input
            name="observacao"
            maxLength={500}
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder='Opcional (obrigatória se o motivo for "Outro")'
          />
        </Field>

        {erro ? <ErrorState dense title={erro} /> : null}
      </form>
    </DragonModal>
  )
}

function ProdutoContexto({
  alvo,
  labels,
}: {
  alvo: AjusteAlvo
  labels: AjusteLabels
}) {
  const modo = alvo.modo ?? 'generico'
  if (modo === 'generico') return null

  return (
    <div
      className="rounded-lg border border-[var(--color-border-secondary)] bg-jl-surface-soft px-3 py-2.5 text-small"
      data-testid="ajuste-produto-contexto"
    >
      <p className="font-medium text-jl-fg-1">{alvo.produtoNome}</p>
      <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-caption text-jl-fg-3">
        <div>
          <dt className="inline">{labels.codigoLabel ?? 'Código'}: </dt>
          <dd className="inline font-mono">{alvo.codigoBarras?.trim() || '—'}</dd>
        </div>
        <div>
          <dt className="inline">{labels.unidadeLabel ?? 'Unidade'}: </dt>
          <dd className="inline uppercase">{alvo.unidade ?? '—'}</dd>
        </div>
        <div>
          <dt className="inline">{labels.saldoAnterior ?? labels.saldoAtual}: </dt>
          <dd className="inline tabular-nums">{fmt(alvo.quantidadeAtual)}</dd>
        </div>
        <div>
          <dt className="inline">{labels.estoqueMinimo}: </dt>
          <dd className="inline tabular-nums">{fmt(alvo.estoqueMinimo)}</dd>
        </div>
      </dl>
    </div>
  )
}
