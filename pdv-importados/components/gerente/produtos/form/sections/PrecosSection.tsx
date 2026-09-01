'use client'

import { useMemo, type RefObject } from 'react'
import { AlertTriangle } from 'lucide-react'
import { formatBRL } from '@/lib/format/money'
import { ProdutoFormSectionHeading } from '../ProdutoFormSectionHeading'
import { useProdutoFormContext } from '../ProdutoFormContext'
import { focusOnEnter } from '../focusOnEnter'
import { CAMPO_INVALIDO_CLASS, CampoErroMsg, erroDoCampo } from '../CampoErro'
import {
  avaliarMargem,
  formatMargemPercentual,
  margemToneClassName,
} from '../produtoForm.margem'

type Props = Readonly<{
  modoCompleto?: boolean
  precoCustoRef?: RefObject<HTMLInputElement | null>
  precoVarejoRef?: RefObject<HTMLInputElement | null>
  /** Próximo campo da cadeia do Enter depois do varejo (estoque inicial). */
  proximoAposVarejoRef?: RefObject<HTMLInputElement | null>
  onEnterSubmit?: () => void
}>

export function PrecosSection({
  modoCompleto = false,
  precoCustoRef,
  precoVarejoRef,
  proximoAposVarejoRef,
  onEnterSubmit,
}: Props) {
  const ctx = useProdutoFormContext()
  const p = ctx.m.produtos
  const { disabled, inputMonoClassName } = ctx

  const erroVarejo = erroDoCampo(ctx.erro, 'preco_varejo')

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
      <p className="mt-1 text-caption text-jl-fg-3">{p.hint_precos_publicar}</p>
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
              ref={precoCustoRef}
              type="text"
              inputMode="decimal"
              className={`${inputMonoClassName} mt-1`}
              value={ctx.precoCustoInput.display}
              onChange={ctx.precoCustoInput.onChange}
              disabled={disabled}
              placeholder="0,00"
              data-field="preco_custo"
              onKeyDown={(e) => focusOnEnter(e, precoVarejoRef?.current)}
            />
          </label>
          <label className="block text-xs font-medium text-jl-fg-3">
            {p.preco_varejo} *
            <input
              ref={precoVarejoRef}
              type="text"
              inputMode="decimal"
              className={`${inputMonoClassName} mt-1 ${erroVarejo ? CAMPO_INVALIDO_CLASS : ''}`}
              value={ctx.precoVarejoInput.display}
              onChange={ctx.precoVarejoInput.onChange}
              disabled={disabled}
              placeholder="0,00"
              data-field="preco_varejo"
              aria-invalid={erroVarejo ? true : undefined}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return
                // Passa pelo estoque inicial antes de salvar; sem ele o campo
                // só era alcançável com mouse/Tab. Ctrl+Enter continua salvando
                // de qualquer campo.
                if (proximoAposVarejoRef?.current) {
                  focusOnEnter(e, proximoAposVarejoRef.current)
                  return
                }
                e.preventDefault()
                onEnterSubmit?.()
              }}
            />
            <CampoErroMsg mensagem={erroVarejo} />
          </label>
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
            <p className="mt-1 flex items-start gap-1.5 text-caption font-semibold">
              <AlertTriangle size={13} className="mt-px shrink-0" aria-hidden />
              {alerta}
            </p>
          ) : margem.tom === 'indefinida' ? (
            <p className="mt-1 text-caption text-jl-fg-3">{p.margem_sem_custo}</p>
          ) : null}
        </div>

      </div>
    </section>
  )
}
