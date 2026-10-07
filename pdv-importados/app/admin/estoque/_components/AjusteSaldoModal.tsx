'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { PackageMinus, SlidersHorizontal } from 'lucide-react'
import {
  atualizarEstoqueProduto,
  consultarSaldoEstoqueProduto,
} from '@/app/gerente/estoque/actions'
import { DragonModal } from '@/components/ui/DragonModal'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/forms'
import { ErrorState } from '@/components/ui/feedback'
import { montarObservacaoComDoc } from './ajusteObservacaoDoc'
import {
  diferencaAjuste,
  fmtQtd,
  previaAjuste,
  previaRetirada,
  validarRetirada,
} from './ajusteSaldoHelpers'

export { previaAjuste, previaRetirada } from './ajusteSaldoHelpers'

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
  erroConcorrencia?: string
  resumoTitulo?: string
  resumoSaldoAtual?: string
  resumoRetirada?: string
  resumoSaldoApos?: string
  resumoSistema?: string
  resumoContagem?: string
  resumoDiferenca?: string
  resumoNovoSaldo?: string
  produtoLabel?: string
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
  const [saldoBase, setSaldoBase] = useState(0)
  const [minimoBase, setMinimoBase] = useState(0)
  const [qtdRaw, setQtdRaw] = useState('')
  const [minimoRaw, setMinimoRaw] = useState('')
  const [referencia, setReferencia] = useState('')
  const [observacao, setObservacao] = useState('')

  const modo: AjusteModo = alvo?.modo ?? 'generico'

  useEffect(() => {
    if (!alvo) return
    setErro(null)
    setReferencia('')
    setObservacao('')
    setSaldoBase(alvo.quantidadeAtual)
    setMinimoBase(alvo.estoqueMinimo)
    setMinimoRaw(String(alvo.estoqueMinimo))
    setQtdRaw(modo === 'retirar' ? '' : String(alvo.quantidadeAtual))
  }, [alvo, modo])

  if (!alvo) return null

  const Icon = modo === 'retirar' ? PackageMinus : SlidersHorizontal
  const salvarLabel =
    modo === 'retirar'
      ? (labels.confirmarRetirada ?? labels.salvar)
      : modo === 'ajustar'
        ? (labels.confirmarAjuste ?? labels.salvar)
        : labels.salvar

  const qtdNum = Number(qtdRaw.replace(',', '.'))
  const qtdValida = qtdRaw.trim() !== '' && Number.isFinite(qtdNum)
  const contada = modo === 'ajustar' && qtdValida ? qtdNum : null
  const retirada = modo === 'retirar' && qtdValida ? qtdNum : null

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const motivo = String(fd.get('motivo') ?? '')
    const obsFinal = montarObservacaoComDoc(referencia, observacao)

    let quantidadeAtual = saldoBase
    let estoqueMinimo = minimoBase

    if (modo === 'retirar') {
      const v = validarRetirada(saldoBase, qtdRaw)
      if (!v.ok) {
        if (v.erro === 'excede') {
          setErro(
            labels.erroRetiradaExcede ??
              `Não é possível retirar mais que o saldo atual (${fmtQtd(saldoBase)}).`,
          )
        } else {
          setErro(labels.erroRetiradaInvalida ?? 'Informe uma quantidade positiva a retirar.')
        }
        return
      }
      quantidadeAtual = v.novoSaldo
    } else {
      const novo = Number(String(fd.get('quantidade_atual') ?? qtdRaw).replace(',', '.'))
      const min = Number(String(fd.get('estoque_minimo') ?? minimoRaw).replace(',', '.'))
      if (!Number.isFinite(novo) || novo < 0) {
        setErro(labels.erroRetiradaInvalida ?? 'Quantidade inválida.')
        return
      }
      if (!Number.isFinite(min) || min < 0) {
        setErro('Estoque mínimo inválido.')
        return
      }
      quantidadeAtual = novo
      estoqueMinimo = min
    }

    const payload = {
      produto_id: alvo.produtoId,
      quantidade_atual: quantidadeAtual,
      estoque_minimo: estoqueMinimo,
      quantidade_esperada: saldoBase,
      minimo_esperado: minimoBase,
      motivo,
      observacao: obsFinal,
    }
    setErro(null)
    startTransition(async () => {
      try {
        const res = await atualizarEstoqueProduto(payload)
        if (!res.ok) {
          const msg = res.error
          const isStale =
            Boolean(labels.erroConcorrencia && msg.includes(labels.erroConcorrencia)) ||
            msg.includes('foi alterado enquanto') ||
            msg.includes('Atualizamos as informações') ||
            msg.includes('已在此页面打开期间') ||
            msg.includes('mudou desde que')
          if (isStale) {
            setErro(
              labels.erroConcorrencia ??
                'O estoque deste produto foi alterado enquanto esta tela estava aberta. Atualizamos as informações; confira a quantidade e tente novamente.',
            )
            const saldo = await consultarSaldoEstoqueProduto(alvo.produtoId)
            if (saldo.ok) {
              setSaldoBase(saldo.data.quantidade)
              setMinimoBase(saldo.data.minimo)
              setMinimoRaw(String(saldo.data.minimo))
              setQtdRaw(modo === 'retirar' ? '' : String(saldo.data.quantidade))
            }
            router.refresh()
            return
          }
          setErro(msg)
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
      <form id="ajuste-saldo-form" noValidate onSubmit={handleSubmit} className="flex flex-col gap-3">
        {modo !== 'generico' ? (
          <ProdutoContexto
            nome={alvo.produtoNome}
            codigo={alvo.codigoBarras}
            unidade={alvo.unidade}
            saldo={saldoBase}
            minimo={minimoBase}
            labels={labels}
          />
        ) : null}

        {modo === 'retirar' ? (
          <Field id="ajuste-qtd-retirar" label={labels.quantidadeRetirar ?? 'Quantidade a retirar'} required>
            <Input
              name="quantidade_retirar"
              type="number"
              min={0.001}
              max={saldoBase}
              step="0.001"
              required
              inputMode="decimal"
              value={qtdRaw}
              placeholder="0"
              className="text-[20px] font-semibold tabular-nums"
              onChange={(e) => setQtdRaw(e.target.value)}
            />
          </Field>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field
              id="ajuste-qtd"
              label={
                modo === 'ajustar'
                  ? (labels.quantidadeContada ?? labels.saldoAtual)
                  : labels.saldoAtual
              }
              required
            >
              <Input
                name="quantidade_atual"
                type="number"
                min={0}
                step="0.001"
                required
                inputMode="decimal"
                value={qtdRaw}
                className="text-[20px] font-semibold tabular-nums"
                onChange={(e) => setQtdRaw(e.target.value)}
              />
            </Field>
            <Field id="ajuste-min" label={labels.estoqueMinimo} required>
              <Input
                name="estoque_minimo"
                type="number"
                min={0}
                step="0.001"
                required
                inputMode="decimal"
                value={minimoRaw}
                onChange={(e) => setMinimoRaw(e.target.value)}
              />
            </Field>
          </div>
        )}

        {modo === 'retirar' || modo === 'ajustar' ? (
          <ResumoOperacao
            modo={modo === 'retirar' ? 'retirar' : 'ajustar'}
            saldoBase={saldoBase}
            retirada={retirada}
            contada={contada}
            labels={labels}
          />
        ) : (
          <p className="text-caption text-fg-muted" data-testid="ajuste-previa" aria-live="polite">
            {previaAjuste(saldoBase, qtdValida ? qtdNum : null)}
          </p>
        )}

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

        {erro ? <ErrorState dense description={erro} /> : null}
      </form>
    </DragonModal>
  )
}

function ProdutoContexto({
  nome,
  codigo,
  unidade,
  saldo,
  minimo,
  labels,
}: {
  nome: string
  codigo?: string | null
  unidade?: string
  saldo: number
  minimo: number
  labels: AjusteLabels
}) {
  const un = unidade?.trim() || labels.unidadeLabel || 'un'
  return (
    <div
      className="rounded-lg border border-[var(--color-border-secondary)] bg-jl-surface-soft px-3 py-3"
      data-testid="ajuste-produto-contexto"
    >
      <p className="text-caption uppercase tracking-wide text-jl-fg-3">
        {labels.produtoLabel ?? 'Produto'}
      </p>
      <p className="text-[18px] font-semibold text-jl-fg-1">{nome}</p>
      <p className="mt-0.5 font-mono text-caption text-jl-fg-3">
        {(labels.codigoLabel ?? 'Código')}: {codigo?.trim() || '—'}
        {unidade ? ` · ${unidade}` : ''}
      </p>
      <p className="mt-2 text-[22px] font-bold tabular-nums text-jl-fg-1" data-testid="ajuste-saldo-atual">
        {labels.resumoSaldoAtual ?? labels.saldoAtual}: {fmtQtd(saldo)} {un}
      </p>
      <p className="text-caption text-jl-fg-3">
        {labels.estoqueMinimo}: {fmtQtd(minimo)}
      </p>
    </div>
  )
}

function ResumoOperacao({
  modo,
  saldoBase,
  retirada,
  contada,
  labels,
}: {
  modo: 'retirar' | 'ajustar'
  saldoBase: number
  retirada: number | null
  contada: number | null
  labels: AjusteLabels
}) {
  if (modo === 'retirar') {
    const ok = retirada != null && retirada > 0
    const apos = ok ? Math.round((saldoBase - retirada) * 1000) / 1000 : null
    return (
      <div
        className="rounded-lg border border-[var(--color-border-secondary)] px-3 py-3"
        data-testid="ajuste-resumo"
        aria-live="polite"
      >
        <p className="mb-2 text-caption font-semibold uppercase tracking-wide text-jl-fg-3">
          {labels.resumoTitulo ?? 'Resumo da operação'}
        </p>
        <dl className="grid grid-cols-[1fr_auto] gap-y-1.5 text-[16px]">
          <dt className="text-jl-fg-2">{labels.resumoSaldoAtual ?? 'Saldo atual'}</dt>
          <dd className="tabular-nums font-semibold">{fmtQtd(saldoBase)}</dd>
          <dt className="text-jl-fg-2">{labels.resumoRetirada ?? 'Retirada'}</dt>
          <dd className="tabular-nums font-semibold text-[var(--color-danger-strong,inherit)]">
            {ok ? `−${fmtQtd(retirada)}` : '—'}
          </dd>
          <dt className="text-jl-fg-1 font-medium">{labels.resumoSaldoApos ?? 'Saldo após retirada'}</dt>
          <dd className="text-[20px] font-bold tabular-nums" data-testid="ajuste-previa">
            {apos != null ? fmtQtd(apos) : previaRetirada(saldoBase, null).replace('Saldo atual: ', '')}
          </dd>
        </dl>
      </div>
    )
  }

  const ok = contada != null && contada >= 0
  const diff = ok ? diferencaAjuste(saldoBase, contada) : null
  const sinal = diff != null && diff !== 0 ? (diff > 0 ? '+' : '−') : ''
  return (
    <div
      className="rounded-lg border border-[var(--color-border-secondary)] px-3 py-3"
      data-testid="ajuste-resumo"
      aria-live="polite"
    >
      <p className="mb-2 text-caption font-semibold uppercase tracking-wide text-jl-fg-3">
        {labels.resumoTitulo ?? 'Resumo da operação'}
      </p>
      <dl className="grid grid-cols-[1fr_auto] gap-y-1.5 text-[16px]">
        <dt className="text-jl-fg-2">{labels.resumoSistema ?? 'Quantidade no sistema'}</dt>
        <dd className="tabular-nums font-semibold">{fmtQtd(saldoBase)}</dd>
        <dt className="text-jl-fg-2">{labels.resumoContagem ?? 'Quantidade contada'}</dt>
        <dd className="tabular-nums font-semibold">{ok ? fmtQtd(contada) : '—'}</dd>
        <dt className="text-jl-fg-2">{labels.resumoDiferenca ?? 'Diferença'}</dt>
        <dd className="tabular-nums font-semibold" data-testid="ajuste-diferenca">
          {diff == null ? '—' : diff === 0 ? '0' : `${sinal}${fmtQtd(Math.abs(diff))}`}
        </dd>
        <dt className="text-jl-fg-1 font-medium">{labels.resumoNovoSaldo ?? 'Novo saldo'}</dt>
        <dd className="text-[20px] font-bold tabular-nums" data-testid="ajuste-previa">
          {ok ? fmtQtd(contada) : '—'}
        </dd>
      </dl>
    </div>
  )
}
