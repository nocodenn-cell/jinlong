'use client'

import { useMemo, type RefObject } from 'react'
import { AlertTriangle } from 'lucide-react'
import { formatBRL } from '@/lib/format/money'
import { ProdutoFormSectionHeading } from '../ProdutoFormSectionHeading'
import { useProdutoFormContext } from '../ProdutoFormContext'
import {
  avaliarMargem,
  formatMargemPercentual,
  margemToneClassName,
} from '../produtoForm.margem'

type Props = Readonly<{
  modoCompleto?: boolean
  precoVarejoRef?: RefObject<HTMLInputElement | null>
  onEnterSubmit?: () => void
}>

export function PrecosSection({
  modoCompleto = false,
  precoVarejoRef,
  onEnterSubmit,
}: Props) {
  const ctx = useProdutoFormContext()
  const p = ctx.m.produtos
  const { disabled, inputMonoClassName } = ctx

  const varejo = ctx.precoVarejoInput.parse()
  const custo = ctx.precoCustoInput.parse()
  const margem = useMemo(() => avaliarMargem(varejo, custo), [varejo, custo])

  const alerta =
    margem.tom === 'negativa'
      ? p.margem_alerta_negativa
      : margem.tom === 'zero'
        ? p.margem_alerta_zero
        : null

  return (
    <section aria-labelledby="produto-secao-precos">
      <ProdutoFormSectionHeading title={p.secao_precificacao} />
      <p className="mt-1 text-[11px] text-jl-fg-3">{p.hint_precos_publicar}</p>
      <div id="produto-secao-precos" className="mt-3 space-y-3">
        {/* Custo e venda SEMPRE lado a lado — a margem precisa estar visível no
            momento em que o preço é digitado, não atrás de "Mais detalhes". */}
        <div
          className={
            modoCompleto
              ? 'grid grid-cols-2 gap-3 sm:grid-cols-3'
              : 'grid grid-cols-2 gap-3'
          }
        >
          <label className="block text-xs font-medium text-jl-fg-3">
            {p.preco_custo}
            <input
              type="text"
              inputMode="decimal"
              className={`${inputMonoClassName} mt-1`}
              value={ctx.precoCustoInput.display}
              onChange={ctx.precoCustoInput.onChange}
              disabled={disabled}
              placeholder="0,00"
              data-field="preco_custo"
            />
          </label>
          <label className="block text-xs font-medium text-jl-fg-3">
            {p.preco_varejo} *
            <input
              ref={precoVarejoRef}
              type="text"
              inputMode="decimal"
              className={`${inputMonoClassName} mt-1`}
              value={ctx.precoVarejoInput.display}
              onChange={ctx.precoVarejoInput.onChange}
              disabled={disabled}
              placeholder="0,00"
              data-field="preco_varejo"
              onKeyDown={
                onEnterSubmit
                  ? (e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        onEnterSubmit()
                      }
                    }
                  : undefined
              }
            />
          </label>
          {modoCompleto ? (
            <label className="block text-xs font-medium text-jl-fg-3">
              {p.preco_atacado}
              <input
                type="text"
                inputMode="decimal"
                className={`${inputMonoClassName} mt-1`}
                value={ctx.precoAtacadoInput.display}
                onChange={ctx.precoAtacadoInput.onChange}
                disabled={disabled}
                placeholder="—"
                data-field="preco_atacado"
              />
            </label>
          ) : null}
        </div>

        {/* Leitura da margem — muda de tom quando o preço dá prejuízo. */}
        <div
          className={`rounded-md border px-3 py-2 ${margemToneClassName(margem.tom)}`}
          data-field="margem"
          data-tom={margem.tom}
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-medium">{p.margem_label}</span>
            <span className="font-mono text-sm font-semibold">
              {margem.valor != null && margem.percentual != null
                ? `${formatBRL(margem.valor)} (${formatMargemPercentual(margem.percentual)}%)`
                : '—'}
            </span>
          </div>
          {alerta ? (
            <p className="mt-1 flex items-start gap-1.5 text-[11px] font-semibold">
              <AlertTriangle size={13} className="mt-px shrink-0" aria-hidden />
              {alerta}
            </p>
          ) : margem.tom === 'indefinida' ? (
            <p className="mt-1 text-[10px] text-jl-fg-3">{p.margem_sem_custo}</p>
          ) : null}
        </div>

        {modoCompleto ? (
          <label className="block text-xs font-medium text-jl-fg-3 sm:max-w-[12rem]">
            {p.qtd_gatilho_atacado}
            <input
              type="text"
              inputMode="numeric"
              className={`${inputMonoClassName} mt-1`}
              value={ctx.quantidadeGatilho}
              onChange={(e) => ctx.setQuantidadeGatilho(e.target.value.replace(/\D/g, ''))}
              disabled={disabled}
              placeholder="—"
            />
            <span className="mt-0.5 block text-[10px] text-jl-fg-3">{p.hint_atacado_faixa}</span>
          </label>
        ) : null}
      </div>
    </section>
  )
}
